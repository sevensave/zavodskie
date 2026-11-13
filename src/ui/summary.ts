import { Container, Graphics, Sprite } from 'pixi.js'
import type { Cliffhanger } from '../content/cash'
import { VERDICT_LABEL } from '../content/rules'
import { SHIFT_END as END_TEXT } from '../content/cash'
import { modelById } from '../content/models'
import type { ColorKey } from '../content/palette'
import { summarize, type ShiftState } from '../sim/shift'
import { col, H, W } from './gfx'
import { Button, paperRect, Timeline } from './kit'
import { sfx } from './sfx'
import { TextBlock, label, lineTexture } from './text'

/** Итог смены: ведомость, шкалы и клиффхэнгер. */
export class Summary extends Container {
  readonly tl = new Timeline()
  private typing: { block: TextBlock; shown: number }[] = []

  constructor(state: ShiftState, cliff: Cliffhanger, actions: { again: () => void; quit?: () => void }) {
    super()
    const g = new Graphics()
    g.rect(0, 0, W, H).fill(col('ink'))
    this.addChild(g)

    const title = new Sprite(lineTexture(END_TEXT.title, 'amber', 2))
    title.position.set(12, 8)
    this.addChild(title)
    const time = label('06:00 · ОТДЕЛ ВОЗВРАТОВ · ОКНО 3', 'slate')
    time.position.set(12, 28)
    this.addChild(time)

    // Ведомость.
    const sheet = new Graphics()
    paperRect(sheet, 10, 40, 222, 220, 'paper')
    this.addChild(sheet)
    const head = label('ВЕДОМОСТЬ', 'ink')
    head.position.set(16, 45)
    this.addChild(head)
    const cols = label('устройство      штамп     по инстр.', 'slate')
    cols.position.set(16, 56)
    this.addChild(cols)
    state.results.forEach((r, i) => {
      const y = 67 + i * 10
      const name = label(modelById(r.modelId).name, 'ink')
      name.position.set(16, y)
      const v = label(VERDICT_LABEL[r.verdict], 'blue')
      v.position.set(96, y)
      const ok = r.verdict === r.expected || r.verdict === 'junk'
      const mark = label(r.verdict === 'junk' ? 'не видели' : ok ? 'да' : 'НЕТ', ok ? 'olive' : 'red')
      mark.position.set(150, y)
      this.addChild(name, v, mark)
    })
    const sum = summarize(state)
    const total = sum.earned - sum.fines
    const lines: [string, ColorKey][] = [
      [`Закрыто дел: ${sum.closed}`, 'ink'],
      [`Оплата: ${sum.earned} р.   Штрафы: ${sum.fines ? `−${sum.fines}` : 0} р.`, 'ink'],
      [`Итого на руки: ${total} р.`, 'rust'],
    ]
    lines.forEach(([t, c], i) => {
      const l = label(t, c)
      l.position.set(16, 222 + i * 10)
      this.addChild(l)
    })

    // Шкалы.
    const scales: [string, number, ColorKey][] = [
      ['Доверие корпорации', state.scales.corp, 'teal'],
      ['Доверие подполья', state.scales.under, 'amber'],
      ['Тревога в городе', state.scales.alarm, 'red'],
    ]
    const sg = new Graphics()
    scales.forEach(([name, v, c], i) => {
      const y = 46 + i * 20
      const l = label(name, 'fog')
      l.position.set(244, y)
      this.addChild(l)
      sg.rect(244, y + 10, 102, 6).fill(col('steel'))
      sg.rect(245, y + 11, Math.round(v), 4).fill(col(c))
    })
    this.addChild(sg)

    // Клиффхэнгер.
    const box = new Graphics()
    const kind = cliff.kind
    const fill: ColorKey = kind === 'paper' ? 'paper' : kind === 'note' ? 'white' : 'night'
    const ink: ColorKey = kind === 'phone' ? 'amber' : 'ink'
    paperRect(box, 244, 112, 226, 104, fill, kind === 'phone' ? 'amber' : 'ink')
    this.addChild(box)
    const ct = label(cliff.title, kind === 'phone' ? 'red' : 'rust')
    ct.position.set(250, 117)
    this.addChild(ct)
    let y = 130
    const blocks: TextBlock[] = []
    for (const line of cliff.lines) {
      const b = new TextBlock(line, { width: 212, color: ink })
      b.position.set(250, y)
      b.reveal(0)
      y += b.blockHeight + 2
      this.addChild(b)
      blocks.push(b)
    }
    const bye = new TextBlock(`кэш: ${END_TEXT.cashBye}`, { width: 226, color: 'amber' })
    bye.position.set(244, 222)
    bye.reveal(0)
    this.addChild(bye)
    const soon = label(END_TEXT.nextSoon, 'slate')
    soon.position.set(244, 238)
    soon.visible = false
    this.addChild(soon)

    const again = new Button('ЕЩЁ РАЗ', 70, 14, { bg: 'teal', fg: 'white', edge: 'cyan' }, actions.again)
    again.position.set(244, 250)
    again.visible = false
    this.addChild(again)
    let quit: Button | null = null
    if (actions.quit) {
      quit = new Button('ВЫЙТИ', 60, 14, { bg: 'steel', fg: 'white', edge: 'slate' }, actions.quit)
      quit.position.set(320, 250)
      quit.visible = false
      this.addChild(quit)
    }

    void (async () => {
      await this.tl.wait(900)
      if (kind === 'phone') {
        for (let i = 0; i < 3; i++) {
          sfx.bell()
          await this.tl.wait(700)
        }
      } else sfx.paper()
      for (const b of blocks) await this.type(b)
      await this.tl.wait(700)
      await this.type(bye)
      soon.visible = true
      again.visible = true
      if (quit) quit.visible = true
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
