import { Container, Graphics, Rectangle } from 'pixi.js'
import { modelById } from '../content/models'
import type { ColorKey } from '../content/palette'
import { SELF_SCAN } from '../content/story'
import { QUESTIONS, SEALS, STRESS_LIMIT, STRESS_WORDS, TOOL_DAY, TOOL_LABEL, type ToolId } from '../content/tools'
import { formatDate } from '../sim/dates'
import type { FieldId } from '../sim/rules'
import type { CaseFile } from '../sim/types'
import { col } from './gfx'
import { Button, paperRect, type Timeline } from './kit'
import { sfx } from './sfx'
import { TextBlock, label, measure } from './text'

/** Что папке нужно от стойки. */
export interface FolderHost {
  tl: Timeline
  addField(id: FieldId, rect: Rectangle, parent: Container, group: string): void
  removeFields(group: string): void
  say(who: 'owner' | 'device', text: string): void
  toast(text: string, color: ColorKey): void
  setLamp(on: boolean): void
  refreshInspect(): void
  /** Сканер навели на приёмщика (третий акт). */
  scanSelf(): void
}

export const FOLDER = { x: 4, y: 156, w: 168, h: 110 }
const SHORT: Record<ToolId, string> = { passport: 'ПСП', log: 'ЖУР', opros: 'ОПР', memory: 'ПАМ', lamp: 'ЛМП', stress: 'СТР', radio: 'РАД' }
const TOOLS: ToolId[] = ['passport', 'log', 'opros', 'memory', 'lamp', 'stress', 'radio']

/** Папка на столе: паспорт и инструменты приёмщика на вкладках. */
export class Folder extends Container {
  readonly tools: ToolId[]
  private tabBar = new Container()
  private body = new Container()
  private bodyMask = new Graphics()
  private c: CaseFile | null = null
  current: ToolId = 'passport'
  // Состояние проверки текущего дела.
  private asked: number[] = []
  private words: number[] = []
  private scanned = false
  private scanning = false
  private radioDone = false
  private selfScan = false
  lampOn = false

  constructor(
    private host: FolderHost,
    private day: number,
  ) {
    super()
    this.tools = TOOLS.filter((t) => TOOL_DAY[t] <= day)
    const g = new Graphics()
    paperRect(g, FOLDER.x, FOLDER.y + 10, FOLDER.w, FOLDER.h - 10, 'white')
    this.addChild(g, this.tabBar, this.body)
    this.bodyMask.rect(FOLDER.x + 1, FOLDER.y + 11, FOLDER.w - 2, FOLDER.h - 12).fill(0xffffff)
    this.addChild(this.bodyMask)
    this.body.mask = this.bodyMask
    this.drawTabs()
  }

  private drawTabs() {
    this.tabBar.removeChildren()
    const full = this.tools.reduce((a, t) => a + measure(TOOL_LABEL[t]) + 6, 0) <= FOLDER.w
    let x = FOLDER.x
    this.tools.forEach((t, i) => {
      const text = full ? TOOL_LABEL[t] : SHORT[t]
      const w = measure(text) + 6
      const active = t === this.current
      const b = new Button(text, w, 11, active ? { bg: 'white', fg: 'ink', edge: 'white' } : { bg: 'fog', fg: 'shadow', edge: 'paper' }, () => this.show(t))
      b.position.set(x, FOLDER.y + (active ? 0 : 1))
      b.labelY = 1
      this.tabBar.addChild(b)
      x += w + 1
      void i
    })
  }

  /** Новое дело: всё проверенное забывается. */
  setCase(c: CaseFile | null) {
    this.c = c
    this.asked = []
    this.words = []
    this.scanned = false
    this.scanning = false
    this.radioDone = false
    this.selfScan = false
    if (this.lampOn) this.host.setLamp(false)
    this.lampOn = false
    this.current = 'passport'
    this.drawTabs()
    this.render()
  }

  show(t: ToolId) {
    if (!this.tools.includes(t) || !this.c) return
    if (t !== this.current) sfx.paper()
    this.current = t
    this.drawTabs()
    this.render()
  }

  showIndex(i: number) {
    const t = this.tools[i]
    if (t) this.show(t)
  }

  private render() {
    this.body.removeChildren()
    this.host.removeFields('tool')
    const c = this.c
    if (!c) return
    switch (this.current) {
      case 'passport':
        return this.renderPassport(c)
      case 'log':
        return this.renderLog(c)
      case 'opros':
        return this.renderOpros(c)
      case 'memory':
        return this.renderMemory(c)
      case 'lamp':
        return this.renderLamp(c)
      case 'stress':
        return this.renderStress(c)
      case 'radio':
        return this.renderRadio(c)
    }
  }

  private put(text: string, x: number, y: number, color: ColorKey = 'ink') {
    const l = label(text, color)
    l.position.set(FOLDER.x + x, FOLDER.y + y)
    this.body.addChild(l)
    return l
  }

  private block(text: string, x: number, y: number, width: number, color: ColorKey) {
    const t = new TextBlock(text, { width, color })
    t.position.set(FOLDER.x + x, FOLDER.y + y)
    this.body.addChild(t)
    return t
  }

  private field(id: FieldId, x: number, y: number, w: number, h: number) {
    this.host.addField(id, new Rectangle(FOLDER.x + x, FOLDER.y + y, w, h), this, 'tool')
    this.host.refreshInspect()
  }

  private button(text: string, x: number, y: number, w: number, onClick: () => void, style: 'teal' | 'steel' = 'teal') {
    const b = new Button(text, w, 12, style === 'teal' ? { bg: 'teal', fg: 'white', edge: 'cyan' } : { bg: 'steel', fg: 'white', edge: 'slate' }, onClick)
    b.position.set(FOLDER.x + x, FOLDER.y + y)
    this.body.addChild(b)
    return b
  }

  // --- Вкладки ---

  private renderPassport(c: CaseFile) {
    const g = new Graphics()
    g.rect(FOLDER.x + 1, FOLDER.y + 11, FOLDER.w - 2, 10).fill(col('teal'))
    this.body.addChild(g)
    const human = !!c.escort
    this.put(human ? 'КОМИТЕТ · УЧЁТНАЯ КАРТА ЖИЛЬЦА' : '«ДОМОВОЙ» · ПАСПОРТ УСТРОЙСТВА', 4, 12, 'white')
    const rows: [string, string, FieldId][] = [
      [human ? 'Вид' : 'Модель', c.passport.model, 'p.model'],
      [human ? 'Учётный №' : 'Серийный №', c.passport.serial, 'p.serial'],
      [human ? 'Версия' : 'Прошивка', c.passport.firmware, 'p.firmware'],
      [human ? 'Учтён' : 'Выпущен', formatDate(c.passport.issued), 'p.issued'],
      [human ? 'Годен до' : 'Гарантия до', formatDate(c.passport.warrantyUntil), 'p.warranty'],
    ]
    rows.forEach(([k, v, id], i) => {
      const y = 25 + i * 13
      this.put(k, 5, y, 'slate')
      this.put(v, 64, y, 'ink')
      g.rect(FOLDER.x + 5, FOLDER.y + y + 10, FOLDER.w - 10, 1).fill(col('paper'))
      this.field(id, 63, y - 1, measure(v) + 3, 10)
    })
    this.put(modelById(c.modelId).kind, 5, 92, 'fog')
  }

  private renderLog(c: CaseFile) {
    this.put('ЖУРНАЛ СОБЫТИЙ', 5, 13, 'ink')
    this.put('дата    время  событие', 5, 23, 'slate')
    c.tools.log.forEach((e, i) => {
      const y = 33 + i * 10
      const dd = formatDate(e.day).slice(0, 5)
      const strong = e.text.startsWith('УДАР')
      this.put(dd, 5, y, 'ink')
      this.put(e.time, 37, y, 'ink')
      this.put(e.text, 66, y, strong ? 'red' : 'ink')
    })
    this.field('log', 4, 32, FOLDER.w - 8, c.tools.log.length * 10)
  }

  private renderOpros(c: CaseFile) {
    this.put('ОПРОСНИК · 3 вопроса', 5, 13, 'ink')
    const left = 3 - this.asked.length
    this.put(`осталось: ${left}`, FOLDER.w - 52, 13, left ? 'slate' : 'rust')
    QUESTIONS.forEach((q, i) => {
      const b = this.button(String(i + 1), 5 + i * 18, 23, 16, () => this.ask(i), this.asked.includes(i) ? 'steel' : 'teal')
      b.enabled = !this.asked.includes(i) && left > 0
      b.on('pointerover', () => this.host.toast(`Вопрос ${i + 1}: ${q.q}`, 'fog'))
    })
    let y = 38
    for (const i of this.asked) {
      const a = this.block(`${i + 1}. ${c.tools.answers[i]}`, 5, y, FOLDER.w - 10, 'blue')
      y += a.blockHeight
      const e = this.block(`   эталон: ${c.tools.canon[i]}`, 5, y, FOLDER.w - 10, 'slate')
      y += e.blockHeight + 2
    }
    if (this.asked.length) this.field('opros', 4, 37, FOLDER.w - 8, Math.min(y, 108) - 37)
    else this.block('Наведите на номер — увидите вопрос. Ответ сверяйте с эталоном.', 5, 40, FOLDER.w - 10, 'fog')
  }

  private ask(i: number) {
    const c = this.c
    if (!c || this.asked.includes(i) || this.asked.length >= 3) return
    this.asked.push(i)
    this.host.toast(`Вопрос: ${QUESTIONS[i]!.q}`, 'fog')
    this.host.say('device', c.tools.answers[i]!)
    this.render()
  }

  private renderMemory(c: CaseFile) {
    this.put(this.selfScan ? SELF_SCAN.title : 'СКАНЕР ПАМЯТИ', 5, 13, this.selfScan ? 'red' : 'ink')
    if (this.selfScan) {
      this.put('раздел        объём', 5, 25, 'slate')
      SELF_SCAN.parts.forEach((p, i) => {
        const y = 35 + i * 9
        this.put(p.name, 5, y, p.name === 'я' || p.name === 'смены' ? 'red' : 'ink')
        this.put(`${p.size} МБ`, 66, y, 'ink')
      })
      this.block(`${SELF_SCAN.model}. ${SELF_SCAN.note}`, 5, 37 + SELF_SCAN.parts.length * 9, FOLDER.w - 10, 'rust')
      return
    }
    // В третьем акте сканер можно навести на себя: он работает на всём, что помнит.
    if (this.day >= 14 && !this.scanning) {
      this.button(SELF_SCAN.button, FOLDER.w - 60, 25, 55, () => {
        this.selfScan = true
        sfx.mismatch()
        this.host.scanSelf()
        this.render()
      }, 'steel')
    }
    if (!this.scanned) {
      const b = this.button(this.scanning ? 'СКАНИРУЮ...' : 'СКАН', 5, 25, 70, () => void this.scan())
      b.enabled = !this.scanning
      this.block('Разделы памяти сверяются с паспортным объёмом.', 5, 42, FOLDER.w - 10, 'fog')
      return
    }
    const parts = c.tools.memory.parts
    this.put('раздел        объём', 5, 25, 'slate')
    let total = 0
    parts.forEach((p, i) => {
      const y = 35 + i * 9
      const odd = p.name === '???' || p.name === 'сл.0' || p.name === 'я'
      this.put(p.name, 5, y, odd ? 'red' : 'ink')
      this.put(`${p.size} МБ`, 66, y, 'ink')
      total += p.size
    })
    const y = 37 + parts.length * 9
    this.put(`Итого: ${total} МБ · по паспорту ${c.tools.memory.spec} МБ`, 5, y, total > c.tools.memory.spec ? 'rust' : 'ink')
    this.field('memory', 4, 34, FOLDER.w - 8, parts.length * 9 + 12)
  }

  private async scan() {
    const c = this.c
    this.scanning = true
    this.render()
    for (let i = 0; i < 4; i++) {
      sfx.blip()
      await this.host.tl.wait(300)
    }
    if (this.c !== c) return
    this.scanning = false
    this.scanned = true
    sfx.match()
    if (this.current === 'memory') this.render()
  }

  private renderLamp(c: CaseFile) {
    this.put('ЛАМПА ДЛЯ ПЛОМБ', 5, 13, 'ink')
    this.button(this.lampOn ? 'ВЫКЛЮЧИТЬ' : 'ВКЛЮЧИТЬ', 5, 25, 70, () => {
      this.lampOn = !this.lampOn
      this.host.setLamp(this.lampOn)
      sfx.click()
      this.render()
    })
    if (!this.lampOn) {
      this.block('Под лампой пломбы на корпусе светятся. Сорванная — гаснет.', 5, 42, FOLDER.w - 10, 'fog')
      return
    }
    SEALS.forEach((s, i) => {
      const ok = c.tools.seals[i]
      this.put(`Пломба «${s}»: ${ok ? 'светится' : 'НЕ СВЕТИТСЯ'}`, 5, 44 + i * 10, ok ? 'olive' : 'red')
    })
    this.field('seals', 4, 43, FOLDER.w - 8, 20)
  }

  private renderStress(c: CaseFile) {
    this.put('СТРЕСС-ТЕСТ · 3 слова', 5, 13, 'ink')
    const left = 3 - this.words.length
    this.put(`осталось: ${left}`, FOLDER.w - 52, 13, left ? 'slate' : 'rust')
    STRESS_WORDS.forEach((w, i) => {
      const b = this.button(w, 5 + (i % 4) * 40, 23 + Math.floor(i / 4) * 13, 38, () => this.stressWord(i), this.words.includes(i) ? 'steel' : 'teal')
      b.enabled = !this.words.includes(i) && left > 0
    })
    const g = new Graphics()
    this.body.addChild(g)
    this.words.forEach((wi, k) => {
      const y = 52 + k * 11
      const v = c.tools.stress[wi]!
      this.put(STRESS_WORDS[wi]!, 5, y, 'ink')
      const bx = FOLDER.x + 50
      g.rect(bx, FOLDER.y + y + 1, 82, 6).fill(col('paper'))
      g.rect(bx + 1, FOLDER.y + y + 2, Math.round(v * 0.8), 4).fill(col(v > STRESS_LIMIT ? 'red' : 'teal'))
      g.rect(bx + 1 + STRESS_LIMIT * 0.8, FOLDER.y + y, 1, 8).fill(col('ink'))
      this.put(String(v), 136, y, v > STRESS_LIMIT ? 'red' : 'ink')
    })
    if (this.words.length) this.field('stress', 4, 51, FOLDER.w - 8, this.words.length * 11)
    this.put(`черта — ${STRESS_LIMIT}`, 5, 96, 'fog')
  }

  private stressWord(i: number) {
    const c = this.c
    if (!c || this.words.includes(i) || this.words.length >= 3) return
    this.words.push(i)
    const v = c.tools.stress[i]!
    if (v > STRESS_LIMIT) {
      sfx.mismatch()
      this.host.say('device', 'НЕ ГОВОРИТЕ ЭТО СЛОВО.')
    } else sfx.blip()
    this.render()
  }

  private renderRadio(c: CaseFile) {
    this.put('РАДИОПЕРЕХВАТ', 5, 13, 'ink')
    if (!this.radioDone) {
      const b = this.button(this.scanning ? 'СЛУШАЮ...' : 'ПОИСК', 5, 25, 70, () => void this.listen())
      b.enabled = !this.scanning
      this.block('Ловит, с кем прибор переговаривается в эфире.', 5, 42, FOLDER.w - 10, 'fog')
      return
    }
    const n = c.tools.radio.length
    this.put(`Связей: ${n}`, 5, 26, n >= 2 ? 'red' : 'ink')
    c.tools.radio.forEach((s, i) => this.put(`позывной «${s}»`, 12, 37 + i * 9, 'ink'))
    if (!n) this.put('эфир чист', 12, 37, 'fog')
    this.field('radio', 4, 25, FOLDER.w - 8, 12 + Math.max(1, n) * 9)
  }

  private async listen() {
    const c = this.c
    this.scanning = true
    this.render()
    for (let i = 0; i < 5; i++) {
      sfx.blip()
      await this.host.tl.wait(280)
    }
    if (this.c !== c) return
    this.scanning = false
    this.radioDone = true
    if (this.current === 'radio') this.render()
  }
}
