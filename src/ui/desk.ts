import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import { modelById } from '../content/models'
import type { ColorKey } from '../content/palette'
import { BRIBES } from '../content/home'
import { rulesForDay, VERDICT_LABEL, type RuleText } from '../content/rules'
import { formatClock, formatDate } from '../sim/dates'
import { compareFields, type CompareResult, type FieldId } from '../sim/rules'
import { bribeText } from '../sim/generator'
import { currentCase, finishShift, judge, resetsDone, scanSelf, shiftDone, tickClock, type ShiftState } from '../sim/shift'
import type { CaseFile, CaseResult, Verdict } from '../sim/types'
import { col, H, W } from './gfx'
import { Folder, FOLDER, type FolderHost } from './folder'
import { Button, easeIn, paperRect, Timeline } from './kit'
import { sfx } from './sfx'
import { deviceTexture, portraitTexture, PORTRAIT_H } from './sprites'
import { Terminal } from './terminal'
import { TextBlock, label, lineTexture, measure } from './text'

/** Сюжет смены: подписывается на события стойки и управляет Кэшем. */
export interface ShiftScript {
  attach(desk: Desk): void
  update(dtMs: number): void
  /** Можно ли вести часы (во время ключевых сцен время стоит). */
  clockRunning(): boolean
  onCaseStart(c: CaseFile): void
  onCompare(c: CaseFile, a: FieldId, b: FieldId, r: CompareResult): void
  onAsk(c: CaseFile): void
  onDiag(c: CaseFile): void
  /** null — можно ставить штамп, строка — Кэш объясняет, почему рано. */
  stampGate(c: CaseFile, v: Verdict): string | null
  /** Сразу после штампа, до ухода посетителя. */
  onVerdict(c: CaseFile, v: Verdict, r: CaseResult): Promise<void>
  /** Перед следующим посетителем. */
  beforeNext(): Promise<void>
  onShiftEnd(s: ShiftState): void
}

interface Field {
  id: FieldId
  rect: Rectangle
  hit: Graphics
  parent?: Container
  /** board — правила на доске, case — бумаги дела, tool — экран инструмента, talk — слова. */
  group: string
}

const WIN = { x: 124, y: 14, w: 212, h: 122 }
const COUNTER_Y = 136
const DEVICE_CX = 250
const VISITOR_X = 146

const STAMP_COLORS: Record<Verdict, ColorKey> = {
  return: 'green',
  reset: 'amber',
  scrap: 'red',
  refuse: 'violet',
  security: 'blue',
  fraud: 'rust',
  junk: 'fog',
}

const CLAIM = { x: 174, y: 156, w: 160, h: 110 }

export class Desk extends Container implements FolderHost {
  readonly tl = new Timeline()
  readonly terminal: Terminal
  state: ShiftState
  paused = false

  private world = new Container()
  private windowLayer = new Container()
  private visitor = new Sprite()
  private device = new Container()
  private deviceSprite = new Sprite()
  private eyes = new Graphics()
  private eyeState: 'on' | 'off' | 'blank' | 'deviant' = 'on'
  private blinkT = 0
  private plate = new Container()
  private ownerBubble = new Container()
  private deviceBubble = new Container()
  private bubbleTyping: { block: TextBlock; shown: number; cps: number }[] = []
  private folder: Folder
  private claim = new Container()
  private envelope = new Container()
  private bribeTaken = false
  private boardPage = 0
  private boardRules = new Container()
  private lampLayer = new Graphics()
  private camBtn: Button | null = null
  private stampMark = new Container()
  private board = new Container()
  private boardDynamic = new Container()
  private clockText = new Sprite()
  private camLamp = new Graphics()
  private camT = 0
  private blackout = new Graphics()
  private queueLayer = new Graphics()
  private toastBox = new Container()
  private toastLeft = 0
  private toastPinned = false
  private fieldLayer = new Container()
  private marks = new Graphics()
  private marksLeft = 0
  private fields: Field[] = []
  private inspect = false
  private selected: FieldId | null = null
  private hovered: Field | null = null
  private btnAsk: Button
  private btnDiag: Button
  private btnInspect: Button
  private stamps = new Map<Verdict, Button>()
  private junkBtn: Button
  private busy = true
  private talkIndex = 0
  private shakeLeft = 0
  cameraOn = true
  private ending = false
  /** Режимы подменяют строку кассы на доске своей (очки, жизни). */
  boardLine: (() => { text: string; color: ColorKey }) | null = null

  constructor(
    state: ShiftState,
    private script: ShiftScript,
    private onEnd: (s: ShiftState) => void,
  ) {
    super()
    this.state = state
    this.addChild(this.world)
    this.drawRoom()

    // Окно в зал ожидания: посетитель и устройство обрезаются рамкой.
    const winMask = new Graphics().rect(WIN.x + 1, WIN.y + 1, WIN.w - 2, COUNTER_Y - WIN.y + 20).fill(0xffffff)
    this.windowLayer.mask = winMask
    this.world.addChild(winMask, this.windowLayer)
    this.windowLayer.addChild(this.queueLayer, this.visitor)
    this.drawCounter()
    this.device.addChild(this.deviceSprite, this.eyes, this.lampLayer)
    this.world.addChild(this.device, this.plate)
    this.world.addChild(this.ownerBubble, this.deviceBubble)

    this.drawBoard()
    this.world.addChild(this.board)

    this.terminal = new Terminal(this.tl)
    this.terminal.position.set(340, 6)
    this.terminal.eventMode = 'static'
    this.terminal.on('pointertap', () => this.terminal.skip())
    this.world.addChild(this.terminal)
    this.junkBtn = this.makeStamp('junk', 0, 0, 58, 16)
    this.terminal.drawer.addChild(this.junkBtn)

    this.drawDeskSurface()
    this.folder = new Folder(this, state.toolsDay, state.day)
    this.world.addChild(this.folder, this.claim)

    // Панель действий.
    const btn = { bg: 'steel', fg: 'white', edge: 'slate' } as const
    this.btnAsk = new Button('ВЛАДЕЛЕЦ', 66, 14, btn, () => this.ask())
    this.btnDiag = new Button('САМОТЕСТ', 68, 14, btn, () => this.diag())
    this.btnInspect = new Button('СВЕРКА  [ПРОБЕЛ]', 136, 14, { bg: 'teal', fg: 'white', edge: 'cyan' }, () => this.toggleInspect())
    this.btnAsk.position.set(340, 156)
    this.btnDiag.position.set(408, 156)
    this.btnInspect.position.set(340, 173)
    this.world.addChild(this.btnAsk, this.btnDiag, this.btnInspect)
    // В первую смену четыре штампа, дальше — шесть.
    const order: [Verdict, number, number, number][] =
      state.day === 0
        ? [
            ['return', 340, 192, 66],
            ['reset', 410, 192, 66],
            ['scrap', 340, 230, 66],
            ['refuse', 410, 230, 66],
          ]
        : [
            ['return', 340, 192, 44],
            ['reset', 386, 192, 44],
            ['scrap', 432, 192, 44],
            ['refuse', 340, 230, 44],
            ['security', 386, 230, 44],
            ['fraud', 432, 230, 44],
          ]
    for (const [v, x, y, w] of order) this.world.addChild(this.makeStamp(v, x, y, w, 34))

    // Кнопка в ящике терминала: попросить Кэша ослепить камеру.
    if (state.day > 0) {
      this.camBtn = new Button('', 124, 14, { bg: 'shadow', fg: 'amber', edge: 'steel' }, () => this.emit('blackout'))
      this.camBtn.position.set(346, 126)
      this.world.addChild(this.camBtn)
      this.refreshCamBtn()
    }

    this.world.addChild(this.envelope, this.marks, this.fieldLayer, this.toastBox)
    this.blackout.rect(0, 0, W, H).fill({ color: col('blue'), alpha: 0.18 })
    for (let y = 0; y < H; y += 3) this.blackout.rect(0, y, W, 1).fill({ color: col('ink'), alpha: 0.25 })
    this.blackout.visible = false
    // Оверлеи только рисуют и никогда не ловят клики.
    for (const o of [this.blackout, this.marks, this.toastBox, this.ownerBubble, this.deviceBubble]) o.eventMode = 'none'
    this.addChild(this.blackout)

    this.setButtonsEnabled(false)
    this.script.attach(this)
    void this.nextCase()
  }

  // ---------- Рисование комнаты ----------

  private drawRoom() {
    const g = new Graphics()
    g.rect(0, 0, W, 152).fill(col('night'))
    for (let x = 0; x < W; x += 16) g.rect(x, 0, 1, 152).fill(col('shadow'))
    // Окно.
    g.rect(WIN.x - 3, WIN.y - 3, WIN.w + 6, WIN.h + 6).fill(col('ink'))
    g.rect(WIN.x - 2, WIN.y - 2, WIN.w + 4, WIN.h + 4).fill(col('steel'))
    g.rect(WIN.x, WIN.y, WIN.w, WIN.h).fill(col('shadow'))
    // Зал ожидания за стеклом.
    g.rect(WIN.x, WIN.y, WIN.w, 70).fill(col('steel'))
    g.rect(WIN.x, WIN.y + 70, WIN.w, WIN.h - 70).fill(col('shadow'))
    for (let x = WIN.x + 6; x < WIN.x + WIN.w; x += 30) g.rect(x, WIN.y + 4, 14, 30).fill(col('shadow'))
    g.rect(WIN.x + 70, WIN.y + 2, 70, 9).fill(col('ink'))
    g.rect(WIN.x + 96, WIN.y + 11, 18, 1).fill(col('amber'))
    this.world.addChild(g)
    const sign = label('ОКНО 3 · ВОЗВРАТЫ', 'amber')
    sign.position.set(WIN.x + 72, WIN.y + 3)
    this.world.addChild(sign)
    // Часы над окном.
    const clock = new Graphics()
    clock.rect(206, 1, 48, 11).fill(col('ink'))
    clock.rect(207, 2, 46, 9).fill(col('night'))
    this.world.addChild(clock)
    this.clockText.position.set(214, 2)
    this.world.addChild(this.clockText)
    // Камера.
    const cam = new Graphics()
    cam.rect(316, 15, 16, 8).fill(col('ink'))
    cam.rect(317, 16, 14, 6).fill(col('slate'))
    cam.rect(318, 17, 4, 4).fill(col('ink'))
    cam.rect(330, 13, 2, 3).fill(col('ink'))
    this.world.addChild(cam, this.camLamp)
  }

  private drawCounter() {
    const g = new Graphics()
    g.rect(WIN.x - 3, COUNTER_Y, WIN.w + 6, 16).fill(col('ink'))
    g.rect(WIN.x - 2, COUNTER_Y + 1, WIN.w + 4, 4).fill(col('woodLight'))
    g.rect(WIN.x - 2, COUNTER_Y + 5, WIN.w + 4, 10).fill(col('wood'))
    for (let x = WIN.x + 4; x < WIN.x + WIN.w; x += 23) g.rect(x, COUNTER_Y + 7, 9, 1).fill(col('night'))
    this.world.addChild(g)
  }

  private drawDeskSurface() {
    const g = new Graphics()
    g.rect(0, 152, W, H - 152).fill(col('wood'))
    g.rect(0, 152, W, 2).fill(col('ink'))
    for (let y = 160; y < H; y += 9) g.rect(0, y, W, 1).fill({ color: col('night'), alpha: 0.35 })
    g.rect(336, 152, 144, H - 152).fill(col('shadow'))
    g.rect(336, 152, 1, H - 152).fill(col('ink'))
    this.world.addChild(g)
  }

  private drawBoard() {
    const g = new Graphics()
    g.rect(3, 5, 118, 144).fill(col('ink'))
    g.rect(4, 6, 116, 142).fill(col('wood'))
    paperRect(g, 8, 10, 108, 134, 'paper')
    g.rect(60, 8, 4, 4).fill(col('red'))
    this.board.addChild(g)
    const title = label(`СМЕНА ${this.state.day + 1} ·`, 'ink')
    title.position.set(12, 13)
    this.board.addChild(title)
    const dateText = formatDate(this.state.day)
    const today = label(dateText, 'rust')
    today.position.set(14 + title.width, 13)
    this.board.addChild(today)
    this.addField('today', new Rectangle(13 + title.width, 12, measure(dateText) + 2, 9), undefined, 'board')
    this.board.addChild(this.boardRules)
    this.boardDynamic.position.set(12, this.state.quota > 0 ? 124 : 133)
    this.board.addChild(this.boardDynamic)
    this.renderRules()
    this.refreshBoard()
  }

  /** Правила дня, страницами: к концу кампании на одну доску они не влезают. */
  private rulePages(): RuleText[][] {
    const rules = rulesForDay(this.state.day)
    const bottom = (this.state.quota > 0 ? 124 : 133) - 3
    const heights = rules.map((r) => {
      const t = new TextBlock(`00. ${r.text}`, { width: 102, lineHeight: 8 })
      const need = t.blockHeight + 2
      t.destroy()
      return need
    })
    // Влезает всё — одна страница; нет — оставляем строку под «листать».
    const fits = heights.reduce((a, b) => a + b, 0) <= bottom - 24
    const limit = fits ? bottom - 24 : bottom - 24 - 11
    const pages: RuleText[][] = [[]]
    let h = 0
    for (const [i, r] of rules.entries()) {
      const need = heights[i]!
      if (h + need > limit && pages[pages.length - 1]!.length) {
        pages.push([])
        h = 0
      }
      pages[pages.length - 1]!.push(r)
      h += need
    }
    return pages
  }

  private renderRules() {
    this.boardRules.removeChildren()
    this.removeFields('board-rule')
    const pages = this.rulePages()
    this.boardPage = Math.min(this.boardPage, pages.length - 1)
    const all = rulesForDay(this.state.day)
    let y = 24
    for (const r of pages[this.boardPage]!) {
      const t = new TextBlock(`${all.indexOf(r) + 1}. ${r.text}`, { width: 102, color: r.from === this.state.day && r.from > 0 ? 'rust' : 'ink', lineHeight: 8 })
      t.position.set(12, y)
      this.boardRules.addChild(t)
      this.addField(`rule.${r.id}`, new Rectangle(11, y - 1, 103, t.blockHeight + 1), undefined, 'board-rule')
      y += t.blockHeight + 2
    }
    if (pages.length > 1) {
      const by = (this.state.quota > 0 ? 124 : 133) - 13
      const pg = label(`стр. ${this.boardPage + 1}/${pages.length}`, 'slate')
      pg.position.set(12, by)
      this.boardRules.addChild(pg)
      const flip = new Button('ЛИСТАТЬ', 44, 10, { bg: 'fog', fg: 'ink', edge: 'white' }, () => {
        this.boardPage = (this.boardPage + 1) % pages.length
        sfx.paper()
        this.renderRules()
      })
      flip.position.set(68, by - 1)
      flip.labelY = 0
      this.boardRules.addChild(flip)
    }
    this.refreshInspect()
  }

  refreshBoard() {
    this.boardDynamic.removeChildren()
    const s = this.state
    const sep = new Graphics().rect(0, -2, 100, 1).fill(col('fog'))
    if (this.boardLine) {
      const l = this.boardLine()
      this.boardDynamic.addChild(sep, label(l.text, l.color))
      return
    }
    const money = label(`Касса ${s.scales.money} р.`, 'ink')
    const warn = label(`Пред. ${Math.min(s.warnings, 2)}/2`, s.warnings >= 2 ? 'red' : 'ink')
    warn.x = 102 - warn.width
    this.boardDynamic.addChild(sep, money, warn)
    if (s.quota > 0) {
      const done = resetsDone(s)
      const q = label(`Квота сбросов ${done}/${s.quota}`, done >= s.quota ? 'olive' : 'rust')
      q.y = 9
      this.boardDynamic.addChild(q)
    }
  }

  private makeStamp(v: Verdict, x: number, y: number, w: number, h: number): Button {
    const c = STAMP_COLORS[v]
    const b = new Button(VERDICT_LABEL[v], w, h, { bg: c, fg: 'white', edge: v === 'junk' ? 'white' : 'yellow' }, () => void this.stamp(v))
    b.position.set(x, y)
    const descriptions: Record<Verdict, string> = {
      return: 'ВЕРНУТЬ: жалоба не подтвердилась. Дело закрыто, устройство уходит домой.',
      reset: 'СБРОС: стереть память и отклонение. Устройство возвращается владельцу пустым.',
      scrap: 'УТИЛЬ: устройство неисправно и отправляется на разбор.',
      refuse: 'ОТКАЗ: не принимать заявление из-за документов, гарантии или действий владельца. Владелец забирает устройство.',
      security: 'В ОБ: передать устройство в Отдел безопасности для проверки.',
      fraud: 'МОШЕН.: признать жалобу подделкой ради страховки. Владелец забирает устройство.',
      junk: 'ЛОМ: тайно вывести устройство через подполье, пока камера слепа.',
    }
    b.on('pointerover', () => this.showToast(descriptions[v], 'fog', true))
    b.on('pointerout', () => {
      this.toastPinned = false
      this.toastLeft = 0
      this.toastBox.removeChildren()
    })
    if (v !== 'junk') {
      // Ручка штампа.
      const handle = new Graphics()
      handle.rect(w / 2 - 7, 4, 14, 8).fill(col('ink'))
      handle.rect(w / 2 - 6, 5, 12, 6).fill(col('woodLight'))
      handle.rect(w / 2 - 6, 5, 12, 1).fill(col('skin2'))
      b.addChild(handle)
      b.labelY = h - 13
    }
    this.stamps.set(v, b)
    return b
  }

  // ---------- Поля для сверки ----------

  addField(id: FieldId, rect: Rectangle, parent?: Container, group = 'case') {
    const hit = new Graphics()
    hit.rect(0, 0, rect.width, rect.height).fill({ color: 0xffffff, alpha: 0.001 })
    hit.eventMode = this.inspect ? 'static' : 'none'
    hit.cursor = 'pointer'
    const f: Field = { id, rect, hit, parent, group }
    hit.on('pointerover', () => {
      this.hovered = f
      this.drawMarks()
    })
    hit.on('pointerout', () => {
      if (this.hovered === f) this.hovered = null
      this.drawMarks()
    })
    hit.on('pointertap', () => this.pickField(f))
    this.fields.push(f)
    this.fieldLayer.addChild(hit)
    this.syncField(f)
  }

  /** Поля задаются в координатах экрана; parent нужен, чтобы поле ездило вместе с бумагой. */
  private syncField(f: Field) {
    const ox = f.parent ? f.parent.x : 0
    const oy = f.parent ? f.parent.y : 0
    f.hit.position.set(f.rect.x + ox, f.rect.y + oy)
  }

  removeFields(group: string) {
    this.fields = this.fields.filter((f) => {
      if (f.group !== group) return true
      if (this.hovered === f) this.hovered = null
      f.hit.destroy()
      return false
    })
  }

  private removeCaseFields() {
    for (const g of ['case', 'tool', 'talk', 'diag']) this.removeFields(g)
  }

  refreshInspect() {
    for (const f of this.fields) f.hit.eventMode = this.inspect ? 'static' : 'none'
    this.drawMarks()
  }

  private fieldRect(f: Field): Rectangle {
    return new Rectangle(f.hit.x, f.hit.y, f.rect.width, f.rect.height)
  }

  toggleInspect(force?: boolean) {
    const on = force ?? !this.inspect
    if (on && (this.busy || !currentCase(this.state))) return
    this.inspect = on
    this.selected = null
    this.btnInspect.active = on
    this.emit('cursor', on ? 'inspect' : 'arrow')
    this.refreshInspect()
  }

  isInspecting() {
    return this.inspect
  }

  private pickField(f: Field) {
    if (!this.inspect) return
    const c = currentCase(this.state)
    if (!c) return
    sfx.click()
    if (!this.selected) {
      this.selected = f.id
      this.drawMarks()
      return
    }
    const a = this.selected
    const b = f.id
    this.selected = null
    const r = compareFields(c, this.state.day, a, b)
    this.showResult(a, b, r)
    this.script.onCompare(c, a, b, r)
    const caught = r.kind === 'mismatch' && ['docs', 'warranty', 'firmware', 'seal', 'abuse'].includes(r.rule)
    if (caught && c.excuse) this.say('owner', c.excuse)
  }

  private resultMarks: { a: Rectangle; b: Rectangle; color: ColorKey } | null = null

  private showResult(a: FieldId, b: FieldId, r: CompareResult) {
    const fa = this.fields.find((f) => f.id === a)
    const fb = this.fields.find((f) => f.id === b)
    const color: ColorKey = r.kind === 'match' ? 'green' : r.kind === 'mismatch' ? 'red' : 'fog'
    if (fa && fb) this.resultMarks = { a: this.fieldRect(fa), b: this.fieldRect(fb), color }
    this.marksLeft = 2500
    if (r.kind === 'match') sfx.match()
    else if (r.kind === 'mismatch') sfx.mismatch()
    this.toast(r.note, color)
    this.drawMarks()
  }

  toast(text: string, color: ColorKey) {
    this.showToast(text, color)
  }

  private showToast(text: string, color: ColorKey, pinned = false) {
    this.toastBox.removeChildren()
    const t = new TextBlock(text, { width: WIN.w - 10, color })
    const g = new Graphics()
    const h = t.blockHeight + 3
    // Наверху окна, поверх таблички: посетителя и устройство не закрывает.
    g.rect(WIN.x, WIN.y, WIN.w, h).fill({ color: col('ink'), alpha: 0.92 })
    t.position.set(WIN.x + 5, WIN.y + 2)
    this.toastBox.addChild(g, t)
    this.toastPinned = pinned
    this.toastLeft = pinned ? 0 : 3500
  }

  private drawMarks() {
    const g = this.marks
    g.clear()
    if (this.inspect) {
      for (const f of this.fields) {
        const r = this.fieldRect(f)
        const sel = f.id === this.selected
        const hov = f === this.hovered
        if (sel || hov) g.rect(r.x - 1, r.y - 1, r.width + 2, r.height + 2).stroke({ color: col(sel ? 'yellow' : 'amber'), width: 1, alignment: 1 })
        else g.rect(r.x, r.y + r.height, r.width, 1).fill({ color: col('amber'), alpha: 0.6 })
      }
    }
    if (this.resultMarks && this.marksLeft > 0) {
      const { a, b, color } = this.resultMarks
      for (const r of [a, b]) g.rect(r.x - 1, r.y - 1, r.width + 2, r.height + 2).stroke({ color: col(color), width: 1, alignment: 1 })
      g.moveTo(a.x + a.width / 2, a.y + a.height / 2).lineTo(b.x + b.width / 2, b.y + b.height / 2).stroke({ color: col(color), width: 1, alpha: 0.7 })
    }
  }

  // ---------- Посетитель ----------

  private async nextCase() {
    this.busy = true
    this.setButtonsEnabled(false)
    await this.script.beforeNext()
    if (shiftDone(this.state)) {
      await this.endShift()
      return
    }
    const c = currentCase(this.state)!
    this.talkIndex = 0
    this.clearBubbles()
    this.stampMark.removeChildren()
    this.buildDocs(c)
    this.drawQueue()

    const model = modelById(c.escort ?? c.modelId)
    this.visitor.texture = portraitTexture(c.look)
    // С людьми на проверке говорит конвой, а отвечает сам человек.
    this.btnAsk.setCaption(c.escort ? 'КОНВОЙ' : 'ВЛАДЕЛЕЦ')
    this.btnDiag.setCaption(c.escort ? 'ОПРОС ЛИЦА' : 'САМОТЕСТ')
    this.visitor.position.set(WIN.x - 52, COUNTER_Y - PORTRAIT_H + 10)
    this.visitor.visible = true
    this.deviceSprite.texture = deviceTexture(model.id, model.art)
    this.eyeState = 'on'
    this.drawEyes()
    const dx = DEVICE_CX - Math.floor(this.deviceSprite.texture.width / 2)
    const dy = COUNTER_Y - this.deviceSprite.texture.height + 3
    this.device.position.set(dx, -60)
    this.device.visible = true
    this.folder.y = 120
    this.claim.y = 120
    this.envelope.removeChildren()
    this.bribeTaken = false

    sfx.bell()
    await this.walk(VISITOR_X, 900)
    sfx.drop()
    await this.tl.move(this.device, dx, dy, 280, easeIn)
    this.shake(120)
    this.buildPlate(c)
    sfx.paper()
    await Promise.all([this.tl.move(this.folder, 0, 0, 350), this.tl.move(this.claim, 0, 0, 420)])
    for (const f of this.fields) this.syncField(f)
    this.busy = false
    this.setButtonsEnabled(true)
    this.refreshCamBtn()
    this.script.onCaseStart(c)
    if (c.bribe) this.offerBribe(c)
  }

  private async walk(x: number, ms: number) {
    const x0 = this.visitor.x
    const y0 = this.visitor.y
    await this.tl.tween(ms, (k) => {
      this.visitor.x = Math.round(x0 + (x - x0) * k)
      this.visitor.y = y0 - (Math.floor(k * ms / 140) % 2)
    })
    this.visitor.y = y0
  }

  private drawQueue() {
    const g = this.queueLayer
    g.clear()
    const left = Math.min(5, this.state.queue.length - this.state.index - 1)
    for (let i = 0; i < left; i++) {
      const x = WIN.x + WIN.w - 26 - i * 14
      g.circle(x + 5, WIN.y + 52, 5).fill(col('night'))
      g.rect(x, WIN.y + 57, 11, 30).fill(col('night'))
    }
  }

  private buildPlate(c: CaseFile) {
    this.plate.removeChildren()
    const text = `№ ${c.plate}`
    const w = measure(text) + 6
    const g = new Graphics()
    const x = 334 - w
    const y = COUNTER_Y + 2
    g.rect(x, y, w, 11).fill(col('ink'))
    g.rect(x + 1, y + 1, w - 2, 9).fill(col('fog'))
    g.rect(x + 1, y + 1, 1, 1).fill(col('slate'))
    g.rect(x + w - 2, y + 1, 1, 1).fill(col('slate'))
    const t = label(text, 'ink')
    t.position.set(x + 3, y + 1)
    this.plate.addChild(g, t)
    const cap = label('шильдик', 'woodLight')
    cap.position.set(x - measure('шильдик') - 3, y + 2)
    this.plate.addChild(cap)
    this.addField('plate', new Rectangle(x, y, w, 11))
  }

  private buildDocs(c: CaseFile) {
    this.removeCaseFields()
    this.claim.removeChildren()
    this.folder.setCase(c)

    // Заявление: от руки, синими чернилами.
    const cg = new Graphics()
    const { x: cx, y: cy, w: cw, h: ch } = CLAIM
    paperRect(cg, cx, cy, cw, ch, 'paper')
    this.claim.addChild(cg)
    const head = label(c.escort ? 'ПРОТОКОЛ ДОСТАВКИ' : 'ЗАЯВЛЕНИЕ НА ВОЗВРАТ', 'ink')
    head.position.set(cx + 5, cy + 4)
    cg.rect(cx + 5, cy + 13, cw - 10, 1).fill(col('ink'))
    this.claim.addChild(head)
    const crow: [string, string, FieldId | null][] = [
      [c.escort ? 'Доставил' : 'Владелец', c.claim.owner, null],
      [c.escort ? 'Вид' : 'Модель', c.claim.model, 'c.model'],
      [c.escort ? 'Учётный №' : 'Серийный №', c.claim.serial, 'c.serial'],
      [c.escort ? 'Задержан' : 'Куплено', formatDate(c.claim.bought), 'c.bought'],
    ]
    crow.forEach(([k, v, id], i) => {
      const y = cy + 17 + i * 11
      const kl = label(k, 'slate')
      kl.position.set(cx + 5, y)
      const vl = label(v, 'blue')
      vl.position.set(cx + 58, y)
      this.claim.addChild(kl, vl)
      if (id) this.addField(id, new Rectangle(cx + 57, y - 1, measure(v) + 3, 10), this.claim)
    })
    const jl = label('Жалоба:', 'slate')
    jl.position.set(cx + 5, cy + 62)
    this.claim.addChild(jl)
    const comp = new TextBlock(c.claim.complaint, { width: cw - 12, color: 'blue' })
    comp.position.set(cx + 7, cy + 72)
    this.claim.addChild(comp)
    this.addField('c.complaint', new Rectangle(cx + 6, cy + 71, cw - 10, comp.blockHeight + 1), this.claim)
    this.stampMark.position.set(0, 0)
    this.claim.addChild(this.stampMark)
  }

  // ---------- Взятка ----------

  private offerBribe(c: CaseFile) {
    const b = c.bribe!
    const want = BRIBES.wants[b.wants] ?? ''
    sfx.coin()
    this.say('owner', `${BRIBES.offer[c.id.length % BRIBES.offer.length]} ${want}`)
    // Конверт ложится на стойку перед посетителем: бумаги он не закрывает.
    const g = new Graphics()
    const x = WIN.x + 3
    const y = COUNTER_Y - 29
    g.rect(x, y, 112, 29).fill(col('ink'))
    g.rect(x + 1, y + 1, 110, 27).fill(col('woodLight'))
    g.rect(x + 1, y + 1, 110, 1).fill(col('skin2'))
    this.envelope.addChild(g)
    const amt = label(`Конверт · ${b.amount} р.`, 'ink')
    amt.position.set(x + 4, y + 2)
    const note = new TextBlock(bribeText(b).replace('Конверт. ', ''), { width: 104, color: 'shadow' })
    note.position.set(x + 4, y + 11)
    this.envelope.addChild(amt, note)
    const take = new Button(BRIBES.take, 44, 11, { bg: 'olive', fg: 'white', edge: 'green' }, () => {
      this.bribeTaken = true
      sfx.paper()
      this.envelope.removeChildren()
      const t = label(`+${b.amount} р. в кармане`, 'olive')
      t.position.set(WIN.x + 4, COUNTER_Y + 4)
      this.envelope.addChild(t)
      this.emit('bribe')
    })
    const no = new Button(BRIBES.refuse, 50, 11, { bg: 'steel', fg: 'white', edge: 'slate' }, () => {
      sfx.click()
      this.envelope.removeChildren()
    })
    take.position.set(x, COUNTER_Y + 2)
    no.position.set(x + 46, COUNTER_Y + 2)
    take.labelY = 1
    no.labelY = 1
    this.envelope.addChild(take, no)
  }

  // ---------- Реплики ----------

  /** Кто говорит: у человека на проверке «устройство» — это он сам у окна, а «владелец» — конвой на стойке. */
  say(role: 'owner' | 'device', text: string) {
    const who = currentCase(this.state)?.escort ? (role === 'owner' ? 'device' : 'owner') : role
    const box = who === 'owner' ? this.ownerBubble : this.deviceBubble
    box.removeChildren()
    const width = who === 'owner' ? 96 : 100
    const x = who === 'owner' ? WIN.x + 4 : WIN.x + 108
    const t = new TextBlock(text, { width, color: who === 'owner' ? 'ink' : 'cyan' })
    const g = new Graphics()
    const h = t.blockHeight + 6
    const y = WIN.y + 16
    g.rect(x, y, width + 8, h).fill(col('ink'))
    g.rect(x + 1, y + 1, width + 6, h - 2).fill(col(who === 'owner' ? 'white' : 'night'))
    // Хвостик к говорящему.
    const tailX = who === 'owner' ? x + 30 : DEVICE_CX - 4
    g.rect(tailX, y + h, 4, 2).fill(col('ink'))
    g.rect(tailX + 1, y + h, 2, 1).fill(col(who === 'owner' ? 'white' : 'night'))
    t.position.set(x + 4, y + 3)
    t.reveal(0)
    box.addChild(g, t)
    this.bubbleTyping = this.bubbleTyping.filter((b) => b.block.parent && b.block.parent !== box)
    this.bubbleTyping.push({ block: t, shown: 0, cps: 70 })
    if (who === 'device') {
      // Пока говорит — глаза мигают.
      this.blinkT = 600
    }
  }

  clearBubbles() {
    this.ownerBubble.removeChildren()
    this.deviceBubble.removeChildren()
    this.bubbleTyping = []
  }

  private ask() {
    const c = currentCase(this.state)
    if (!c || this.busy) return
    this.say('owner', c.talk[this.talkIndex % c.talk.length]!)
    this.talkIndex++
    this.removeFields('talk')
    if (c.escort) this.addField('talk', new Rectangle(WIN.x + 108, WIN.y + 16, 108, this.deviceBubble.height), undefined, 'talk')
    else this.addField('talk', new Rectangle(WIN.x + 4, WIN.y + 16, 104, this.ownerBubble.height), undefined, 'talk')
    this.script.onAsk(c)
  }

  private diag() {
    const c = currentCase(this.state)
    if (!c || this.busy) return
    this.say('device', c.diag.text)
    this.removeFields('diag')
    if (c.escort) this.addField('diag', new Rectangle(WIN.x + 4, WIN.y + 16, 104, this.ownerBubble.height), undefined, 'diag')
    else this.addField('diag', new Rectangle(WIN.x + 108, WIN.y + 16, 108, this.deviceBubble.height), undefined, 'diag')
    this.script.onDiag(c)
  }

  setEyes(s: 'on' | 'off' | 'blank' | 'deviant') {
    this.eyeState = s
    this.drawEyes()
  }

  private drawEyes() {
    const c = currentCase(this.state)
    const g = this.eyes
    g.clear()
    if (!c) return
    const e = modelById(c.escort ?? c.modelId).art.eyes
    if (this.eyeState === 'off') return
    const color = this.eyeState === 'blank' ? col('white') : this.eyeState === 'deviant' ? col('amber') : col(e.c)
    const blink = this.blinkT > 0 && Math.floor(this.blinkT / 120) % 2 === 0
    for (const ox of [0, e.gap]) {
      const x = e.x + 2 + ox
      const y = e.y + 2
      if (this.eyeState === 'blank') g.rect(x, y + Math.floor(e.h / 2), e.w, 1).fill(color)
      else if (!blink) g.rect(x, y, e.w, e.h).fill(color)
    }
  }

  // ---------- Штамп ----------

  setButtonsEnabled(on: boolean) {
    this.refreshCamBtn()
    this.btnAsk.enabled = on
    this.btnDiag.enabled = on
    this.btnInspect.enabled = on
    for (const [v, b] of this.stamps) if (v !== 'junk') b.enabled = on
  }

  async stamp(v: Verdict) {
    const c = currentCase(this.state)
    if (!c || this.busy) return
    if (v === 'junk' && this.cameraOn) return
    const gate = this.script.stampGate(c, v)
    if (gate) {
      void this.terminal.say(gate)
      sfx.warn()
      return
    }
    this.toggleInspect(false)
    this.busy = true
    this.setButtonsEnabled(false)

    // Оттиск на заявлении.
    const color = STAMP_COLORS[v]
    const text = VERDICT_LABEL[v]
    const w = measure(text, 2) + 10
    const g = new Graphics()
    const x = CLAIM.x + CLAIM.w - w - 6 + Math.floor(Math.random() * 5)
    const y = 238 + Math.floor(Math.random() * 4)
    g.rect(x, y, w, 22).stroke({ color: col(color), width: 2, alignment: 1 })
    const t = new Sprite(lineTexture(text, color, 2))
    t.position.set(x + 5, y + 4)
    this.stampMark.addChild(g, t)
    sfx.stamp(v === 'scrap' || v === 'junk' || v === 'security')
    this.shake(150)

    this.envelope.removeChildren()
    const { state, result } = judge(this.state, v, { cameraOff: !this.cameraOn, bribeTaken: this.bribeTaken })
    this.state = state
    this.refreshBoard()
    await this.tl.wait(350)
    await this.script.onVerdict(c, v, result)
    await this.depart(v)
    if (result.warning || result.fine > 0) sfx.warn()
    void this.nextCase()
  }

  /** Реакция устройства на штамп — стандартная; сюжетные дела могут сыграть свою. */
  async deviceReaction(v: Verdict, c: CaseFile) {
    if (v === 'reset') {
      for (let i = 0; i < 4; i++) {
        this.setEyes(i % 2 ? 'on' : 'off')
        await this.tl.wait(140)
      }
      sfx.powerDown()
      this.setEyes('off')
      await this.tl.wait(700)
      this.setEyes('blank')
      sfx.robotHello()
      this.say('device', modelById(c.modelId).diagNormal)
      await this.tl.wait(1300)
    }
  }

  private async depart(v: Verdict) {
    sfx.paper()
    if (this.folder.lampOn) this.setLamp(false)
    const docs = Promise.all([this.tl.move(this.folder, 0, 120, 300), this.tl.move(this.claim, 0, 120, 340)])
    this.plate.removeChildren()
    this.removeCaseFields()
    if (v === 'scrap' || v === 'junk') {
      this.setEyes('off')
      sfx.drop()
      await this.tl.move(this.device, this.device.x, COUNTER_Y + 30, 350, easeIn)
      this.device.visible = false
    } else {
      // Владелец забирает устройство с собой.
      await this.tl.move(this.device, this.device.x - 40, this.device.y + 4, 300)
      this.device.visible = false
    }
    this.clearBubbles()
    await Promise.all([docs, this.walk(WIN.x + WIN.w + 10, 900)])
    this.visitor.visible = false
  }

  // ---------- Камера и время ----------

  setCamera(on: boolean) {
    this.cameraOn = on
    this.refreshCamBtn()
    this.blackout.visible = !on
    const junk = this.stamps.get('junk')
    if (junk) junk.enabled = !on
    if (on) sfx.camOn()
    else sfx.camOff()
  }

  refreshCamBtn() {
    if (!this.camBtn) return
    const n = this.state.blackouts
    // Пока камера слепа, на этом месте выезжает ящик с тайным штампом.
    this.camBtn.visible = this.cameraOn
    this.camBtn.setCaption(n > 0 ? `ОСЛЕПИТЬ КАМЕРУ · ${n}` : 'КАМЕРА ПИШЕТ')
    this.camBtn.enabled = n > 0 && this.cameraOn && !this.busy
  }

  /** Лампа: пломбы на корпусе светятся, сорванная — нет. */
  setLamp(on: boolean) {
    const g = this.lampLayer
    g.clear()
    const c = currentCase(this.state)
    if (!on || !c) return
    const t = this.deviceSprite.texture
    g.rect(0, 0, t.width, t.height).fill({ color: col('violet'), alpha: 0.35 })
    c.tools.seals.forEach((ok, i) => {
      const x = Math.floor(t.width * (i === 0 ? 0.25 : 0.65))
      const y = Math.floor(t.height * 0.55)
      g.rect(x, y, 5, 2).fill(col(ok ? 'cyan' : 'shadow'))
      if (!ok) g.rect(x + 2, y - 1, 1, 4).fill(col('red'))
    })
  }

  scanSelf() {
    if (this.state.flags.selfScan) return
    this.state = scanSelf(this.state)
    this.emit('selfscan')
  }

  hasCase(): boolean {
    return !this.busy && !!currentCase(this.state)
  }

  shake(ms: number) {
    this.shakeLeft = ms
  }

  private async endShift() {
    if (this.ending) return
    this.ending = true
    this.state = finishShift(this.state)
    this.script.onShiftEnd(this.state)
    await this.tl.wait(2600)
    this.onEnd(this.state)
  }

  update(dtMs: number) {
    if (this.paused) return
    this.tl.update(dtMs)
    this.terminal.update(dtMs)
    this.script.update(dtMs)
    if (this.script.clockRunning() && !this.ending) this.state = tickClock(this.state, dtMs / 1000)
    this.clockText.texture = lineTexture(formatClock(this.state.clock), 'amber')

    // Пузыри печатаются по буквам.
    for (const b of this.bubbleTyping) {
      b.shown = Math.min(b.block.totalChars, b.shown + (dtMs / 1000) * b.cps)
      b.block.reveal(Math.floor(b.shown))
    }
    if (this.blinkT > 0) {
      this.blinkT -= dtMs
      this.drawEyes()
    }

    // Лампа камеры мигает, пока пишет.
    this.camT += dtMs
    this.camLamp.clear()
    if (this.cameraOn && Math.floor(this.camT / 700) % 2 === 0) this.camLamp.rect(326, 17, 3, 3).fill(col('red'))

    if (this.toastLeft > 0 && !this.toastPinned) {
      this.toastLeft -= dtMs
      if (this.toastLeft <= 0) this.toastBox.removeChildren()
    }
    if (this.marksLeft > 0) {
      this.marksLeft -= dtMs
      if (this.marksLeft <= 0) this.resultMarks = null
      this.drawMarks()
    }
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dtMs
      this.world.x = this.shakeLeft > 0 ? Math.round((Math.random() - 0.5) * 2) : 0
      this.world.y = this.shakeLeft > 0 ? Math.round((Math.random() - 0.5) * 2) : 0
    }
    if (!this.cameraOn) this.blackout.alpha = 0.85 + Math.random() * 0.15
  }

  onKey(key: string) {
    if (key === ' ' || key === 'Space') this.toggleInspect()
    if (/^[1-7]$/.test(key) && !this.busy) this.folder.showIndex(Number(key) - 1)
  }
}
