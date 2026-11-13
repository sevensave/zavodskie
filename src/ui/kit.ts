import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import type { ColorKey } from '../content/palette'
import { col } from './gfx'
import { sfx } from './sfx'
import { lineTexture, measure } from './text'

// Время сцены: всё анимированное ждёт его, а не setTimeout, чтобы пауза останавливала мир.
type Job = { left: number; total: number; step?: (k: number) => void; done: () => void }

export class Timeline {
  private jobs: Job[] = []
  speed = 1

  update(dtMs: number) {
    const dt = dtMs * this.speed
    for (const j of this.jobs.slice()) {
      j.left -= dt
      const k = Math.min(1, 1 - j.left / j.total)
      j.step?.(k)
      if (j.left <= 0) {
        this.jobs.splice(this.jobs.indexOf(j), 1)
        j.done()
      }
    }
  }

  wait(ms: number): Promise<void> {
    return new Promise((done) => this.jobs.push({ left: ms, total: Math.max(1, ms), done }))
  }

  tween(ms: number, step: (k: number) => void): Promise<void> {
    return new Promise((done) => this.jobs.push({ left: ms, total: Math.max(1, ms), step, done }))
  }

  /** Плавно сдвинуть объект; координаты округляются до целого пикселя. */
  move(obj: { x: number; y: number }, x: number, y: number, ms: number, ease: (k: number) => number = easeOut): Promise<void> {
    const x0 = obj.x
    const y0 = obj.y
    return this.tween(ms, (k) => {
      const e = ease(k)
      obj.x = Math.round(x0 + (x - x0) * e)
      obj.y = Math.round(y0 + (y - y0) * e)
    })
  }

  clear() {
    this.jobs = []
  }
}

export const easeOut = (k: number) => 1 - (1 - k) ** 3
export const easeIn = (k: number) => k * k * k
export const linear = (k: number) => k

export interface ButtonStyle {
  bg: ColorKey
  fg: ColorKey
  edge: ColorKey
}

export class Button extends Container {
  private g = new Graphics()
  private text: Sprite
  private hover = false
  private down = false
  private _enabled = true
  private _active = false
  private _labelY: number | null = null

  constructor(
    private caption: string,
    readonly w: number,
    readonly h: number,
    private style: ButtonStyle,
    private onClick: () => void,
  ) {
    super()
    this.text = new Sprite(lineTexture(caption, style.fg))
    this.addChild(this.g, this.text)
    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, w, h)
    this.on('pointerover', () => {
      this.hover = true
      this.redraw()
    })
    this.on('pointerout', () => {
      this.hover = false
      this.down = false
      this.redraw()
    })
    this.on('pointerdown', () => {
      this.down = true
      this.redraw()
    })
    this.on('pointerup', () => {
      this.down = false
      this.redraw()
    })
    this.on('pointertap', () => {
      if (!this._enabled) return
      sfx.click()
      this.onClick()
    })
    this.redraw()
  }

  set enabled(v: boolean) {
    this._enabled = v
    this.redraw()
  }
  get enabled() {
    return this._enabled
  }

  set active(v: boolean) {
    this._active = v
    this.redraw()
  }

  /** Сдвинуть подпись по вертикали (у штампов сверху ручка). */
  set labelY(v: number) {
    this._labelY = v
    this.redraw()
  }

  setCaption(caption: string) {
    this.caption = caption
    this.redraw()
  }

  private redraw() {
    const s = this.style
    const pressed = (this.down && this._enabled) || this._active
    const bg = !this._enabled ? 'steel' : this.hover && !pressed ? s.edge : s.bg
    const fg = !this._enabled ? 'slate' : this._active ? 'ink' : s.fg
    this.g.clear()
    this.g.rect(0, 0, this.w, this.h).fill(col('ink'))
    this.g.rect(1, 1, this.w - 2, this.h - 2).fill(col(this._active ? s.fg : bg))
    if (!pressed) this.g.rect(1, this.h - 2, this.w - 2, 1).fill(col('ink'))
    this.text.texture = lineTexture(this.caption, fg)
    this.text.x = Math.floor((this.w - measure(this.caption)) / 2)
    this.text.y = (this._labelY ?? Math.floor((this.h - 8) / 2)) + (pressed ? 1 : 0)
  }
}

/** Рамка-бумажка: заливка, контур и тень. */
export function paperRect(g: Graphics, x: number, y: number, w: number, h: number, fill: ColorKey, edge: ColorKey = 'ink') {
  g.rect(x + 1, y + 1, w, h).fill({ color: col('ink'), alpha: 0.5 })
  g.rect(x, y, w, h).fill(col(edge))
  g.rect(x + 1, y + 1, w - 2, h - 2).fill(col(fill))
}
