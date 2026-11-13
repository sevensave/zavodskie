import { Container, Graphics, Sprite } from 'pixi.js'
import { HOME_TEXT, type BillId } from '../content/home'
import { billsFor, type Campaign } from '../sim/campaign'
import { formatDate } from '../sim/dates'
import { col, H, W } from './gfx'
import { Button, paperRect, Timeline } from './kit'
import { sfx } from './sfx'
import { TextBlock, label, lineTexture } from './text'

/** Утро дома: газета о вчерашнем и счета «Домового». */
export class Home extends Container {
  readonly tl = new Timeline()
  private paid = new Set<BillId>()
  private billsLayer = new Container()
  private rain = new Graphics()
  private t = 0

  constructor(
    private c: Campaign,
    private onSleep: (paid: BillId[]) => void,
  ) {
    super()
    this.drawRoom()
    this.drawPaper()
    // По умолчанию отмечено всё, на что хватает денег, в порядке важности.
    let budget = c.money
    for (const id of ['door', 'food', 'heat', 'kesh', 'link'] as BillId[]) {
      const b = billsFor(c).find((x) => x.id === id)!
      if (budget >= b.price) {
        budget -= b.price
        this.paid.add(id)
      }
    }
    this.addChild(this.billsLayer)
    this.drawBills()
  }

  private drawRoom() {
    const g = new Graphics()
    g.rect(0, 0, W, H).fill(col('night'))
    g.rect(0, 200, W, 70).fill(col('wood'))
    g.rect(0, 200, W, 2).fill(col('ink'))
    // Окно с рассветом и дождём.
    g.rect(318, 14, 150, 110).fill(col('ink'))
    g.rect(320, 16, 146, 106).fill(col('blue'))
    g.rect(320, 80, 146, 42).fill(col('violet'))
    g.rect(320, 104, 146, 18).fill(col('pink'))
    for (let i = 0; i < 9; i++) {
      const h = 20 + ((i * 37) % 45)
      g.rect(322 + i * 16, 122 - h, 14, h).fill(col('shadow'))
      for (let k = 0; k < 4; k++) if ((i + k) % 3 === 0) g.rect(326 + i * 16, 122 - h + 4 + k * 6, 2, 2).fill(col('yellow'))
    }
    g.rect(392, 16, 2, 106).fill(col('ink'))
    g.rect(320, 68, 146, 2).fill(col('ink'))
    // Дверь с «Привратником».
    g.rect(14, 60, 54, 140).fill(col('ink'))
    g.rect(16, 62, 50, 138).fill(col('woodLight'))
    g.rect(52, 110, 10, 16).fill(col('steel'))
    g.rect(54, 112, 6, 3).fill(col('red'))
    this.addChild(g, this.rain)
    const title = new Sprite(lineTexture(HOME_TEXT.title, 'amber', 2))
    title.position.set(80, 8)
    this.addChild(title)
    const greet = new TextBlock(HOME_TEXT.greeting[this.c.day % HOME_TEXT.greeting.length]!, { width: 220, color: 'fog' })
    greet.position.set(80, 28)
    this.addChild(greet)
  }

  private drawPaper() {
    const r = this.c.last
    const g = new Graphics()
    paperRect(g, 80, 50, 226, 148, 'paper')
    this.addChild(g)
    const name = label('УТРЕННИЙ СЕМИГРАД', 'ink', 2)
    name.position.set(86, 54)
    const date = label(`${formatDate(this.c.day)} · цена 1 р. · подписка 30 р./мес.`, 'slate')
    date.position.set(86, 72)
    g.rect(86, 81, 214, 1).fill(col('ink'))
    this.addChild(name, date)
    let y = 85
    for (const n of r?.news ?? []) {
      const h = new TextBlock(n.head, { width: 214, color: 'ink' })
      h.position.set(86, y)
      y += h.blockHeight + 1
      const sub = new TextBlock(n.sub, { width: 214, color: 'slate' })
      sub.position.set(86, y)
      y += sub.blockHeight + 6
      this.addChild(h, sub)
    }
    if (r?.audit.happened) {
      const a = new TextBlock(`Из конторы: ${r.audit.text}`, { width: 214, color: 'rust' })
      a.position.set(86, Math.max(y, 170))
      this.addChild(a)
    }
  }

  private drawBills() {
    const L = this.billsLayer
    L.removeChildren()
    const g = new Graphics()
    paperRect(g, 318, 130, 154, 134, 'white')
    L.addChild(g)
    const head = label('СЧЕТА «ДОМОВОГО»', 'ink')
    head.position.set(324, 134)
    L.addChild(head)
    const bills = billsFor(this.c)
    let total = 0
    bills.forEach((b, i) => {
      const y = 146 + i * 17
      const on = this.paid.has(b.id)
      if (on) total += b.price
      const n = label(b.name, b.unpaid ? 'red' : 'ink')
      n.position.set(324, y)
      const p = label(`${b.price} р.${b.unpaid ? ' · долг!' : ''}`, b.unpaid ? 'red' : 'slate')
      p.position.set(324, y + 8)
      L.addChild(n, p)
      const btn = new Button(on ? HOME_TEXT.paid : HOME_TEXT.pay, 52, 12, on ? { bg: 'olive', fg: 'white', edge: 'green' } : { bg: 'steel', fg: 'white', edge: 'slate' }, () => {
        if (on) this.paid.delete(b.id)
        else if (this.c.money - total >= b.price) this.paid.add(b.id)
        else {
          sfx.warn()
          return
        }
        sfx.click()
        this.drawBills()
      })
      btn.position.set(414, y + 2)
      L.addChild(btn)
    })
    const left = this.c.money - total
    const m = label(`${HOME_TEXT.balance}: ${this.c.money} р. → ${left} р.`, left < 10 ? 'red' : 'ink')
    m.position.set(324, 233)
    L.addChild(m)
    const go = new Button(HOME_TEXT.sleep, 140, 14, { bg: 'teal', fg: 'white', edge: 'cyan' }, () => this.onSleep([...this.paid]))
    go.position.set(324, 245)
    L.addChild(go)
  }

  update(dtMs: number) {
    this.tl.update(dtMs)
    this.t += dtMs
    const g = this.rain
    g.clear()
    for (let i = 0; i < 24; i++) {
      const x = 322 + ((i * 53 + Math.floor(this.t / 9)) % 142)
      const y = 18 + ((i * 29 + Math.floor(this.t / 4)) % 100)
      g.rect(x, y, 1, 3).fill({ color: col('cyan'), alpha: 0.4 })
    }
  }
}
