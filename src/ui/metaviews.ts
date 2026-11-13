import { Container, Graphics, Rectangle } from 'pixi.js'
import { ACH_TEXT, ACHIEVEMENTS } from '../content/achievements'
import { FILES, FILES_TEXT } from '../content/files'
import { ENDLESS_MODS, MODES_TEXT, type EndlessMod } from '../content/modes'
import { modelById } from '../content/models'
import type { ColorKey } from '../content/palette'
import { bestEndless, endlessUnlocked, FILE_LOST, FILE_MET, FILE_SPARED, filesFound, plusUnlocked, type Meta } from '../sim/meta'
import { endlessDay, endlessMult, modsAvailable } from '../sim/modes'
import { col, H, W } from './gfx'
import { Button, paperRect } from './kit'
import { sfx } from './sfx'
import { TextBlock, label } from './text'

const GREY = { bg: 'steel', fg: 'white', edge: 'slate' } as const
const GO = { bg: 'teal', fg: 'white', edge: 'cyan' } as const

/** Полноэкранный слой: ловит клики сам, чтобы под ним ничего не нажималось. */
class Overlay extends Container {
  protected g = new Graphics()
  constructor(title: string) {
    super()
    this.g.rect(0, 0, W, H).fill(col('ink'))
    this.addChild(this.g)
    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, W, H)
    const head = label(title, 'amber')
    head.position.set(Math.floor((W - head.width) / 2), 8)
    this.addChild(head)
  }

  protected text(t: string, x: number, y: number, width: number, color: ColorKey = 'fog'): TextBlock {
    const b = new TextBlock(t, { width, color })
    b.position.set(x, y)
    this.addChild(b)
    return b
  }

  protected button(caption: string, x: number, y: number, w: number, onClick: () => void, style: typeof GREY | typeof GO = GREY): Button {
    const b = new Button(caption, w, 14, style, onClick)
    b.position.set(x, y)
    this.addChild(b)
    return b
  }
}

export interface ModesHandlers {
  daily(): void
  endless(mods: EndlessMod[]): void
  plus(): void
  files(): void
  achievements(): void
  endings(): void
}

/** Меню режимов: смена дня, бесконечная, вторая смена, картотека, достижения, концовки. */
export class ModesView extends Overlay {
  private sub: Container | null = null

  constructor(
    private meta: Meta,
    private today: { key: string; label: string },
    private h: ModesHandlers,
    private onClose: () => void,
    inShift: boolean,
  ) {
    super(MODES_TEXT.menu)
    const cards: { title: string; text: string; status: string; open: boolean; caption: string; act: () => void; confirm?: boolean }[] = []
    const done = meta.daily[today.key]
    cards.push({
      title: MODES_TEXT.daily,
      text: MODES_TEXT.dailyText,
      status: done ? MODES_TEXT.dailyDone(done.score, done.code) : `Сегодня: ${today.label}.`,
      open: true,
      caption: MODES_TEXT.start,
      act: () => h.daily(),
    })
    const eu = endlessUnlocked(meta)
    cards.push({
      title: MODES_TEXT.endless,
      text: MODES_TEXT.endlessText,
      status: eu ? `Правила смены ${endlessDay(meta.bestDay) + 1}. Рекорд: ${bestEndless(meta)}.` : MODES_TEXT.endlessLocked,
      open: eu,
      caption: MODES_TEXT.mods,
      act: () => this.openEndless(),
    })
    const pu = plusUnlocked(meta)
    cards.push({
      title: MODES_TEXT.plus,
      text: MODES_TEXT.plusText,
      status: pu ? '' : MODES_TEXT.plusLocked,
      open: pu,
      caption: MODES_TEXT.start,
      act: () => h.plus(),
      confirm: true,
    })
    cards.forEach((c, i) => {
      const x = 12 + i * 154
      const y = 22
      paperRect(this.g, x, y, 148, 178, c.open ? 'night' : 'ink', c.open ? 'steel' : 'shadow')
      const t = label(c.title, c.open ? 'amber' : 'slate')
      t.position.set(x + 6, y + 5)
      this.addChild(t)
      const body = this.text(c.text, x + 6, y + 18, 136, c.open ? 'fog' : 'slate')
      if (c.status) this.text(c.status, x + 6, y + 24 + body.blockHeight, 136, c.open ? 'cyan' : 'slate')
      if (!c.open) return
      let armed = false
      const b = this.button(c.caption, x + 19, y + 158, 110, () => {
        if (c.confirm && !armed) {
          armed = true
          b.setCaption(MODES_TEXT.confirm)
          return
        }
        c.act()
      }, GO)
    })
    if (inShift) this.text(MODES_TEXT.shiftLost, 12, 204, 300, 'slate')
    this.button(MODES_TEXT.files, 12, 226, 110, () => h.files())
    this.button(MODES_TEXT.achievements, 128, 226, 110, () => h.achievements())
    this.button(MODES_TEXT.endings, 244, 226, 110, () => h.endings())
    this.button(MODES_TEXT.close, 360, 226, 108, onClose)
    const stat = label(`картотека ${filesFound(meta)}/${FILES.length} · достижения ${meta.ach.length}/${ACHIEVEMENTS.length}`, 'slate')
    stat.position.set(Math.floor((W - stat.width) / 2), 250)
    this.addChild(stat)
  }

  /** Открыть поверх ещё один слой (картотеку, достижения). */
  push(view: Container) {
    this.closeSub()
    this.sub = view
    this.addChild(view)
  }

  closeSub() {
    this.sub?.destroy({ children: true })
    this.sub = null
  }

  private openEndless() {
    this.push(new EndlessView(this.meta, (mods) => this.h.endless(mods), () => this.closeSub()))
  }
}

/** Выбор модификаторов бесконечной смены и рекорды. */
export class EndlessView extends Overlay {
  private picked = new Set<EndlessMod>()
  private multLabel = label('', 'cyan')

  constructor(meta: Meta, onStart: (mods: EndlessMod[]) => void, onBack: () => void) {
    super(MODES_TEXT.endless)
    const day = endlessDay(meta.bestDay)
    const avail = modsAvailable(day)
    paperRect(this.g, 12, 22, 290, 200, 'night', 'steel')
    const head = label(MODES_TEXT.mods, 'amber')
    head.position.set(18, 27)
    this.addChild(head)
    let y = 40
    for (const m of ENDLESS_MODS) {
      const open = avail.includes(m.id)
      const b = new Button(m.name, 130, 12, GREY, () => {
        if (this.picked.has(m.id)) this.picked.delete(m.id)
        else this.picked.add(m.id)
        b.active = this.picked.has(m.id)
        this.refresh()
      })
      b.position.set(18, y)
      b.labelY = 2
      b.enabled = open
      this.addChild(b)
      this.text(open ? `${m.text} ×${m.mult}` : `Откроется со смены ${m.from + 1}.`, 154, y + 2, 142, open ? 'fog' : 'slate')
      y += 28
    }
    this.multLabel.position.set(18, 208)
    this.addChild(this.multLabel)
    this.refresh()

    paperRect(this.g, 310, 22, 158, 200, 'night', 'steel')
    const rh = label(MODES_TEXT.records, 'amber')
    rh.position.set(316, 27)
    this.addChild(rh)
    if (!meta.endless.length) this.text(MODES_TEXT.noRecords, 316, 42, 146, 'slate')
    meta.endless.forEach((r, i) => {
      const yy = 42 + i * 34
      const t = label(`${i + 1}. ${r.score} очк. · ${r.closed} дел`, i === 0 ? 'yellow' : 'white')
      t.position.set(316, yy)
      this.addChild(t)
      const mods = r.mods.map((id) => ENDLESS_MODS.find((m) => m.id === id)?.name ?? id).join(', ') || 'без модификаторов'
      this.text(`${r.date} · смена ${r.day + 1}. ${mods.toLowerCase()}`, 316, yy + 10, 146, 'slate')
    })
    this.button(MODES_TEXT.back, 130, 240, 100, onBack)
    this.button(MODES_TEXT.start, 250, 240, 100, () => onStart([...this.picked]), GO)
  }

  private refresh() {
    const m = endlessMult([...this.picked])
    this.multLabel.texture = label(`${MODES_TEXT.mult(m)}${this.picked.has('strict') ? ' · одна жизнь' : ' · три жизни'}`, 'cyan').texture
  }
}

/** Картотека: шестьдесят личностей, открытые — с обрывками историй. */
export class FilesView extends Overlay {
  private detail = new Container()
  private marks = new Graphics()

  constructor(
    private meta: Meta,
    onClose: () => void,
  ) {
    super(`${FILES_TEXT.title} · ${filesFound(meta)} из ${FILES.length}`)
    paperRect(this.g, 248, 20, 222, 222, 'paper')
    this.addChild(this.marks, this.detail)
    FILES.forEach((f, i) => {
      const col3 = Math.floor(i / 20)
      const row = i % 20
      const x = 10 + col3 * 78
      const y = 22 + row * 11
      const bits = meta.files[f.id] ?? 0
      const met = (bits & FILE_MET) !== 0
      const b = new Button(met ? f.name : FILES_TEXT.locked, 76, 10, met ? { bg: 'night', fg: 'fog', edge: 'steel' } : { bg: 'ink', fg: 'slate', edge: 'shadow' }, () => this.show(i))
      b.position.set(x, y)
      b.labelY = 1
      this.addChild(b)
      if (met) {
        if (bits & FILE_SPARED) this.marks.rect(x + 70, y + 2, 2, 2).fill(col('green'))
        if (bits & FILE_LOST) this.marks.rect(x + 70, y + 6, 2, 2).fill(col('red'))
      }
    })
    this.button(MODES_TEXT.close, 195, 250, 90, onClose)
    const first = FILES.findIndex((f) => (meta.files[f.id] ?? 0) & FILE_MET)
    this.show(Math.max(0, first))
  }

  private show(i: number) {
    const f = FILES[i]!
    const bits = this.meta.files[f.id] ?? 0
    this.detail.removeChildren()
    const put = (t: string, y: number, color: ColorKey, w = 210): number => {
      const b = new TextBlock(t, { width: w, color })
      b.position.set(254, y)
      this.detail.addChild(b)
      return b.blockHeight
    }
    const model = modelById(f.model)
    if (!(bits & FILE_MET)) {
      put(`${FILES_TEXT.locked} · «${model.name}»`, 26, 'shadow')
      put(FILES_TEXT.lockedHint, 40, 'slate')
      return
    }
    sfx.paper()
    let y = 26
    y += put(`«${f.name}» · ${model.name}, ${model.kind}`, y, 'ink') + 6
    y += put(FILES_TEXT.says, y, 'rust') + 1
    y += put(f.says, y, 'shadow') + 6
    y += put(FILES_TEXT.spared, y, 'olive') + 1
    y += put(bits & FILE_SPARED ? f.spared : FILES_TEXT.locked, y, bits & FILE_SPARED ? 'shadow' : 'fog') + 6
    y += put(FILES_TEXT.lost, y, 'red') + 1
    put(bits & FILE_LOST ? f.lost : FILES_TEXT.locked, y, bits & FILE_LOST ? 'shadow' : 'fog')
  }
}

/** Достижения: две страницы по восемнадцать. */
export class AchView extends Overlay {
  private page = 0
  private list = new Container()

  constructor(
    private meta: Meta,
    onClose: () => void,
  ) {
    super(`${ACH_TEXT.title} · ${ACH_TEXT.got(meta.ach.length, ACHIEVEMENTS.length)}`)
    this.addChild(this.list)
    this.render()
    const pages = Math.ceil(ACHIEVEMENTS.length / 18)
    if (pages > 1) {
      this.button('ЛИСТАТЬ', 140, 250, 90, () => {
        this.page = (this.page + 1) % pages
        sfx.paper()
        this.render()
      })
    }
    this.button(MODES_TEXT.close, 250, 250, 90, onClose)
  }

  private render() {
    this.list.removeChildren()
    const g = new Graphics()
    this.list.addChild(g)
    ACHIEVEMENTS.slice(this.page * 18, this.page * 18 + 18).forEach((a, i) => {
      const x = 10 + Math.floor(i / 9) * 234
      const y = 22 + (i % 9) * 25
      const got = this.meta.ach.includes(a.id)
      paperRect(g, x, y, 226, 22, got ? 'night' : 'ink', got ? 'amber' : 'shadow')
      const t = label(got || !a.hidden ? a.title : '???', got ? 'amber' : 'slate')
      t.position.set(x + 5, y + 2)
      const b = new TextBlock(got || !a.hidden ? a.text : ACH_TEXT.hidden, { width: 216, color: got ? 'fog' : 'slate' })
      b.position.set(x + 5, y + 11)
      this.list.addChild(t, b)
    })
  }
}

/** Всплывашка сверху: новое достижение. Ничего не ловит. */
export class Toaster extends Container {
  private queue: string[] = []
  private left = 0

  constructor() {
    super()
    this.eventMode = 'none'
  }

  push(text: string) {
    this.queue.push(text)
  }

  update(dtMs: number) {
    if (this.left > 0) {
      this.left -= dtMs
      if (this.left <= 0) this.removeChildren()
      return
    }
    const next = this.queue.shift()
    if (!next) return
    const t = label(`${ACH_TEXT.toast} · ${next}`, 'yellow')
    const w = t.width + 12
    const x = Math.floor((W - w) / 2)
    const g = new Graphics()
    g.rect(x, 3, w, 15).fill(col('amber'))
    g.rect(x + 1, 4, w - 2, 13).fill(col('ink'))
    t.position.set(x + 6, 6)
    this.addChild(g, t)
    this.left = 3800
    sfx.achieve()
  }
}
