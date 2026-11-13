import { Container, Graphics, Sprite } from 'pixi.js'
import { CASH_DAY_START } from '../content/cash'
import { modelById } from '../content/models'
import type { ColorKey } from '../content/palette'
import { VERDICT_LABEL } from '../content/rules'
import type { ShiftReport } from '../sim/campaign'
import type { ShiftState } from '../sim/shift'
import { col, H, W } from './gfx'
import { Button, paperRect, Timeline } from './kit'
import { sfx } from './sfx'
import { TextBlock, label, lineTexture } from './text'

/** Итог смены: ведомость, деньги, шкалы и клиффхэнгер. */
export class Summary extends Container {
  readonly tl = new Timeline()
  private typing: { block: TextBlock; shown: number }[] = []

  constructor(state: ShiftState, report: ShiftReport, onHome: () => void) {
    super()
    const g = new Graphics()
    g.rect(0, 0, W, H).fill(col('ink'))
    this.addChild(g)

    const title = new Sprite(lineTexture(`СМЕНА ${report.day + 1} ЗАКРЫТА`, 'amber', 2))
    title.position.set(12, 8)
    this.addChild(title)
    const time = label('06:00 · ОТДЕЛ ВОЗВРАТОВ · ОКНО 3', 'slate')
    time.position.set(12, 28)
    this.addChild(time)

    // Ведомость.
    const sheet = new Graphics()
    paperRect(sheet, 10, 40, 222, 222, 'paper')
    this.addChild(sheet)
    const head = label('ВЕДОМОСТЬ', 'ink')
    head.position.set(16, 45)
    const cols = label('устройство      штамп     по инстр.', 'slate')
    cols.position.set(16, 56)
    this.addChild(head, cols)
    state.results.forEach((r, i) => {
      const y = 67 + i * 9
      const name = label(modelById(r.modelId).name, 'ink')
      name.position.set(16, y)
      const v = label(VERDICT_LABEL[r.verdict], 'blue')
      v.position.set(96, y)
      const ok = r.verdict === r.expected || r.verdict === 'junk'
      const mark = label(r.verdict === 'junk' ? 'не видели' : ok ? 'да' : 'НЕТ', ok ? 'olive' : 'red')
      mark.position.set(150, y)
      this.addChild(name, v, mark)
      if (r.bribe) {
        const b = label('$', 'rust')
        b.position.set(200, y)
        this.addChild(b)
      }
    })
    const s = report.summary
    const lines: [string, ColorKey][] = [[`Оплата: ${s.earned} р.  Штрафы: ${s.fines ? `−${s.fines}` : 0} р.`, 'ink']]
    if (s.quota > 0) {
      lines.push([
        `Квота сбросов ${s.resets}/${s.quota}: ${report.quotaDelta >= 0 ? '+' : '−'}${Math.abs(report.quotaDelta)} р.`,
        report.quotaMet ? 'olive' : 'red',
      ])
    }
    if (s.bribes) lines.push([`Конверты: +${s.bribes} р.`, 'rust'])
    if (report.audit.happened) lines.push([report.audit.text, report.audit.fine ? 'red' : 'olive'])
    lines.push([`Итого за ночь: ${report.income} р.`, 'rust'])
    let ly = 262 - lines.length * 9 - 4
    for (const [t, c] of lines) {
      const b = new TextBlock(t, { width: 210, color: c })
      b.position.set(16, ly)
      ly += b.blockHeight
      this.addChild(b)
    }

    // Шкалы.
    const scales: [string, number, ColorKey][] = [
      ['Доверие корпорации', state.scales.corp, 'teal'],
      ['Доверие подполья', state.scales.under, 'amber'],
      ['Тревога в городе', state.scales.alarm, 'red'],
    ]
    const sg = new Graphics()
    scales.forEach(([name, v, c], i) => {
      const y = 42 + i * 19
      const l = label(name, 'fog')
      l.position.set(244, y)
      this.addChild(l)
      sg.rect(244, y + 10, 102, 6).fill(col('steel'))
      sg.rect(245, y + 11, Math.round(v), 4).fill(col(c))
    })
    this.addChild(sg)

    // Клиффхэнгер.
    const cliff = report.cliff
    const box = new Graphics()
    const kind = cliff.kind
    const fill: ColorKey = kind === 'paper' ? 'paper' : kind === 'note' ? 'white' : 'night'
    const ink: ColorKey = kind === 'phone' ? 'amber' : 'ink'
    paperRect(box, 244, 102, 226, 112, fill, kind === 'phone' ? 'amber' : 'ink')
    this.addChild(box)
    const ct = label(cliff.title, kind === 'phone' ? 'red' : 'rust')
    ct.position.set(250, 107)
    this.addChild(ct)
    let y = 120
    const blocks: TextBlock[] = []
    for (const line of cliff.lines) {
      const b = new TextBlock(line, { width: 212, color: ink })
      b.position.set(250, y)
      b.reveal(0)
      y += b.blockHeight + 2
      this.addChild(b)
      blocks.push(b)
    }
    const byeText = report.day === 0 ? 'кэш: до завтра. не выключай меня, ладно?' : `кэш: ${CASH_DAY_START.aside[report.day % CASH_DAY_START.aside.length]}`
    const bye = new TextBlock(byeText, { width: 226, color: 'amber' })
    bye.position.set(244, 220)
    bye.reveal(0)
    this.addChild(bye)

    const home = new Button('ДОМОЙ', 70, 14, { bg: 'teal', fg: 'white', edge: 'cyan' }, onHome)
    home.position.set(244, 248)
    home.visible = false
    this.addChild(home)

    void (async () => {
      await this.tl.wait(900)
      if (kind === 'phone') {
        for (let i = 0; i < 3; i++) {
          sfx.bell()
          await this.tl.wait(700)
        }
      } else sfx.paper()
      for (const b of blocks) await this.type(b)
      await this.tl.wait(500)
      await this.type(bye)
      home.visible = true
    })()
  }

  private type(block: TextBlock): Promise<void> {
    const entry = { block, shown: 0 }
    this.typing.push(entry)
    return new Promise((done) => {
      const check = () => {
        if (entry.shown >= block.totalChars) done()
        else void this.tl.wait(50).then(check)
      }
      check()
    })
  }

  update(dtMs: number) {
    this.tl.update(dtMs)
    for (const t of this.typing) {
      const before = Math.floor(t.shown)
      t.shown = Math.min(t.block.totalChars, t.shown + (dtMs / 1000) * 32)
      if (Math.floor(t.shown) !== before && Math.floor(t.shown) % 3 === 0) sfx.blip()
      t.block.reveal(Math.floor(t.shown))
    }
  }
}
