import { Container, Sprite, Texture } from 'pixi.js'
import type { ColorKey } from '../content/palette'
import { css, makeCanvas, subTexture, texFrom } from './gfx'

// Пиксельный текст: рисуем шрифтом Tiny5 в canvas и обрезаем полупрозрачные края до 0/255,
// чтобы буквы ложились ровно в сетку 480×270.

export const FONT = 'Tiny5'
export const LINE = 9
const BASE = 7

let measureCtx: CanvasRenderingContext2D | null = null

function ctx(scale: number): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = makeCanvas(4, 4)[1]
  measureCtx.font = `${8 * scale}px ${FONT}`
  return measureCtx
}

export async function loadFont(): Promise<void> {
  await Promise.all([document.fonts.load(`8px ${FONT}`, 'Аа'), document.fonts.load(`8px ${FONT}`, 'Aa0')])
}

export function measure(text: string, scale = 1): number {
  return Math.ceil(ctx(scale).measureText(text).width)
}

export function wrap(text: string, maxWidth: number, scale = 1): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(' ')
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (measure(next, scale) <= maxWidth || !line) line = next
      else {
        out.push(line)
        line = w
      }
    }
    out.push(line)
  }
  return out
}

const cache = new Map<string, Texture>()

/** Одна строка текста как текстура. Кэшируется: статичные подписи рисуются один раз. */
export function lineTexture(text: string, color: ColorKey, scale = 1, cached = true): Texture {
  const key = `${scale}|${color}|${text}`
  if (cached) {
    const hit = cache.get(key)
    if (hit) return hit
  }
  const w = Math.max(1, measure(text, scale) + 1)
  const h = LINE * scale
  const [c, g] = makeCanvas(w, h)
  g.font = `${8 * scale}px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#fff'
  g.fillText(text, 0, BASE * scale)
  const img = g.getImageData(0, 0, c.width, c.height)
  const rgb = parseInt(css(color).slice(1), 16)
  const r = (rgb >> 16) & 255
  const gg = (rgb >> 8) & 255
  const b = rgb & 255
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3]!
    img.data[i] = r
    img.data[i + 1] = gg
    img.data[i + 2] = b
    img.data[i + 3] = a >= 110 ? 255 : 0
  }
  g.putImageData(img, 0, 0)
  const t = texFrom(c)
  if (cached) cache.set(key, t)
  return t
}

export interface TextOpts {
  color?: ColorKey
  scale?: number
  width?: number
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
}

/** Блок текста с переносами. Может печататься по буквам (reveal). */
export class TextBlock extends Container {
  private lines: { tex: Texture; sprite: Sprite; len: number; widths: number[] }[] = []
  readonly lineCount: number
  readonly totalChars: number
  readonly blockWidth: number
  readonly blockHeight: number

  constructor(text: string, opts: TextOpts = {}) {
    super()
    const scale = opts.scale ?? 1
    const color = opts.color ?? 'white'
    const lh = opts.lineHeight ?? LINE * scale
    const rows = opts.width ? wrap(text, opts.width, scale) : text.split('\n')
    let maxW = 0
    rows.forEach((row, i) => {
      const tex = lineTexture(row, color, scale)
      const sprite = new Sprite(tex)
      const w = tex.width
      maxW = Math.max(maxW, w)
      sprite.y = i * lh
      if (opts.width && opts.align === 'center') sprite.x = Math.floor((opts.width - w) / 2)
      if (opts.width && opts.align === 'right') sprite.x = opts.width - w
      this.addChild(sprite)
      const widths: number[] = []
      for (let k = 0; k <= row.length; k++) widths.push(measure(row.slice(0, k), scale))
      this.lines.push({ tex, sprite, len: row.length, widths })
    })
    this.lineCount = rows.length
    this.totalChars = this.lines.reduce((a, l) => a + l.len, 0)
    this.blockWidth = opts.width ?? maxW
    this.blockHeight = rows.length * lh
  }

  /** Показать первые n букв (для печатной машинки). */
  reveal(n: number): void {
    let left = n
    for (const l of this.lines) {
      if (left >= l.len) {
        l.sprite.texture = l.tex
        l.sprite.visible = true
      } else if (left <= 0) {
        l.sprite.visible = false
      } else {
        l.sprite.visible = true
        l.sprite.texture = subTexture(l.tex, l.widths[left] ?? l.tex.width)
      }
      left -= l.len
    }
  }
}

export function label(text: string, color: ColorKey = 'white', scale = 1): Sprite {
  return new Sprite(lineTexture(text, color, scale))
}
