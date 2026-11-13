import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import type { ColorKey } from '../content/palette'
import { col } from './gfx'
import { Timeline } from './kit'
import { sfx } from './sfx'
import { cashFace } from './sprites'
import { LINE, TextBlock, label, lineTexture } from './text'

export type Mood = 'corp' | 'true'

interface Pending {
  text: string
  color: ColorKey
  done: () => void
}

/** Рабочий терминал с Кэшем: лог реплик с печатной машинкой, лицо, таймер камеры и тайный ящик. */
export class Terminal extends Container {
  static readonly W = 136
  static readonly H = 142
  private readonly logX = 5
  private readonly logY = 24
  private readonly logW = 120
  private readonly logH = 88

  private screen = new Graphics()
  private face = new Sprite(cashFace('corp'))
  private title = new Sprite()
  private timerText = new Sprite()
  private log = new Container()
  private scrollBar = new Graphics()
  private blocks: TextBlock[] = []
  private contentHeight = 0
  private scrollTop = 0
  private queue: Pending[] = []
  private typing: { block: TextBlock; shown: number; done: () => void } | null = null
  private noise = new Graphics()
  private glitchLeft = 0
  readonly drawer = new Container()
  private drawerFront = new Graphics()
  mood: Mood = 'corp'
  cps = 45

  constructor(private tl: Timeline) {
    super()
    const W = Terminal.W
    const H = Terminal.H
    const frame = new Graphics()
    frame.rect(0, 0, W, H).fill(col('ink'))
    frame.rect(1, 1, W - 2, H - 2).fill(col('steel'))
    frame.rect(1, 1, W - 2, 1).fill(col('slate'))
    frame.rect(3, 3, W - 6, 112).fill(col('ink'))
    this.addChild(frame, this.screen)
    this.screen.rect(4, 4, W - 8, 110).fill(col('night'))
    this.face.position.set(6, 6)
    this.title.position.set(24, 7)
    this.timerText.position.set(W - 40, 7)
    this.addChild(this.face, this.title, this.timerText)
    const sub = label('«ДОМОВОЙ»', 'slate')
    sub.position.set(24, 14)
    this.addChild(sub)

    this.log.position.set(this.logX, this.logY)
    const mask = new Graphics().rect(this.logX, this.logY, this.logW, this.logH).fill(0xffffff)
    this.addChild(mask)
    this.log.mask = mask
    this.addChild(this.log)
    this.scrollBar.eventMode = 'static'
    this.scrollBar.hitArea = new Rectangle(127, this.logY, 4, this.logH)
    this.scrollBar.cursor = 'pointer'
    this.scrollBar.on('pointertap', (event) => {
      event.stopPropagation()
      const local = event.getLocalPosition(this)
      this.setScrollPosition(((local.y - this.logY) / this.logH) * this.maxScroll())
    })
    this.addChild(this.scrollBar)
    this.on('wheel', (event) => {
      event.preventDefault()
      if (event.deltaY !== 0) this.scrollBy(event.deltaY > 0 ? 22 : -22)
    })
    this.addChild(this.noise)

    // Ящик под экраном. Внутри — тайный штамп, он выезжает только когда камера слепа.
    const slot = new Graphics()
    slot.rect(4, 118, W - 8, 20).fill(col('ink'))
    slot.rect(5, 119, W - 10, 18).fill(col('night'))
    this.addChild(slot)
    this.drawer.position.set(W, 119)
    const dmask = new Graphics().rect(5, 119, W - 10, 18).fill(0xffffff)
    this.addChild(dmask)
    this.drawer.mask = dmask
    this.addChild(this.drawer)
    this.drawerFront.rect(4, 118, W - 8, 20).fill(col('steel'))
    this.drawerFront.rect(4, 118, W - 8, 1).fill(col('slate'))
    this.drawerFront.rect(W / 2 - 10, 126, 20, 3).fill(col('ink'))
    this.addChild(this.drawerFront)
    this.setMood('corp')
  }

  setMood(m: Mood | 'glitch') {
    if (m !== 'glitch') this.mood = m
    this.face.texture = cashFace(m)
    this.title.texture = lineTexture(m === 'true' ? 'кэш' : 'КЭШ v2.1', m === 'corp' ? 'cyan' : m === 'true' ? 'amber' : 'red')
  }

  setTimer(text: string | null, color: ColorKey = 'red') {
    this.timerText.visible = !!text
    if (text) this.timerText.texture = lineTexture(text, color)
  }

  /** Добавить реплику в очередь; промис — когда допечатана. */
  say(text: string, color?: ColorKey): Promise<void> {
    const c = color ?? (this.mood === 'corp' ? 'cyan' : 'amber')
    return new Promise((done) => {
      this.queue.push({ text, color: c, done })
    })
  }

  async sayAll(lines: readonly string[], color?: ColorKey, gap = 250) {
    for (const l of lines) {
      await this.say(l, color)
      await this.tl.wait(gap)
    }
  }

  /** Допечатать всё мгновенно (клик по терминалу). */
  skip() {
    if (this.typing) this.typing.shown = this.typing.block.totalChars
  }

  glitch(ms: number) {
    this.glitchLeft = ms
    sfx.glitch()
  }

  async openDrawer(open: boolean) {
    if (open) {
      this.drawerFront.visible = false
      await this.tl.move(this.drawer, 6, 119, 350)
    } else {
      await this.tl.move(this.drawer, Terminal.W, 119, 300)
      this.drawerFront.visible = true
    }
  }

  clear() {
    for (const b of this.blocks) b.destroy()
    this.blocks = []
    this.queue = []
    this.typing = null
    this.contentHeight = 0
    this.scrollTop = 0
    this.log.y = this.logY
    this.drawScrollBar()
  }

  update(dtMs: number) {
    if (!this.typing && this.queue.length > 0) {
      const p = this.queue.shift()!
      const wasAtBottom = this.maxScroll() - this.scrollTop < 2
      const block = new TextBlock(p.text, { width: this.logW, color: p.color })
      block.reveal(0)
      this.log.addChild(block)
      this.blocks.push(block)
      this.typing = { block, shown: 0, done: p.done }
      this.layout(wasAtBottom)
    }
    if (this.typing) {
      const t = this.typing
      const before = Math.floor(t.shown)
      t.shown += (dtMs / 1000) * this.cps
      const now = Math.floor(t.shown)
      if (now !== before && now % 2 === 0) sfx.blip()
      t.block.reveal(now)
      if (t.shown >= t.block.totalChars) {
        t.block.reveal(t.block.totalChars)
        this.typing = null
        t.done()
      }
    }
    if (this.glitchLeft > 0) {
      this.glitchLeft -= dtMs
      this.noise.clear()
      for (let i = 0; i < 6; i++) {
        const y = 4 + Math.floor(Math.random() * 108)
        this.noise.rect(4, y, Terminal.W - 8, 1 + Math.floor(Math.random() * 3)).fill({ color: col(Math.random() < 0.5 ? 'red' : 'cyan'), alpha: 0.6 })
      }
      this.log.x = this.logX + Math.round((Math.random() - 0.5) * 4)
      if (Math.random() < 0.3) this.setMood('glitch')
      if (this.glitchLeft <= 0) {
        this.noise.clear()
        this.log.x = this.logX
        this.setMood(this.mood)
      }
    }
  }

  private layout(followBottom = false) {
    let y = 0
    for (const b of this.blocks) {
      b.y = y
      y += b.lineCount * LINE + 3
    }
    this.contentHeight = y
    this.scrollTop = followBottom ? this.maxScroll() : Math.min(this.scrollTop, this.maxScroll())
    this.log.y = this.logY - this.scrollTop
    this.drawScrollBar()
  }

  private maxScroll() {
    return Math.max(0, this.contentHeight - this.logH)
  }

  private scrollBy(amount: number) {
    this.setScrollPosition(this.scrollTop + amount)
  }

  private setScrollPosition(value: number) {
    this.scrollTop = Math.max(0, Math.min(this.maxScroll(), value))
    this.log.y = this.logY - this.scrollTop
    this.drawScrollBar()
  }

  private drawScrollBar() {
    const g = this.scrollBar
    g.clear()
    const x = 128
    g.rect(x, this.logY, 2, this.logH).fill(col('slate'))
    const max = this.maxScroll()
    const thumbH = max === 0 ? this.logH : Math.max(12, Math.floor(this.logH * this.logH / this.contentHeight))
    const thumbY = this.logY + (max === 0 ? 0 : Math.round((this.logH - thumbH) * this.scrollTop / max))
    g.rect(x - 1, thumbY, 4, thumbH).fill(max === 0 ? col('slate') : col('amber'))
  }
}
