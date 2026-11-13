import { Container, Sprite, Texture } from 'pixi.js'
import type { ColorKey } from '../content/palette'
import { css, makeCanvas, subTexture, texFrom } from './gfx'
import { installFont } from './font'

// Пиксельный текст. Tiny5 лежит на ровной сетке: при 8px один пиксель шрифта — один пиксель экрана.
// Каждую букву рисуем крупно (×8) и снимаем по центрам клеток, а строки собираем из этих битмапов.
// Так буквы не зависят от сглаживания и хинтинга системы: на Windows (ClearType, масштаб 125–150%)
// прямая отрисовка 8px с порогом рвала глифы.

export const FONT = 'Tiny5'
export const LINE = 9
const BASE = 7
const M = 8

interface Glyph {
  w: number
  bits: Uint8Array
}

const glyphs = new Map<string, Glyph>()
let glyphCtx: CanvasRenderingContext2D | null = null

function glyph(ch: string): Glyph {
  const hit = glyphs.get(ch)
  if (hit) return hit
  if (!glyphCtx) glyphCtx = makeCanvas(16 * M, LINE * M)[1]
  const g = glyphCtx
  g.font = `${8 * M}px ${FONT}`
  const w = Math.max(0, Math.round(g.measureText(ch).width / M))
  const cw = Math.max(1, w + 2) * M
  if (g.canvas.width < cw) g.canvas.width = cw
  g.font = `${8 * M}px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.clearRect(0, 0, g.canvas.width, g.canvas.height)
  g.fillStyle = '#fff'
  g.fillText(ch, 0, BASE * M)
  const img = g.getImageData(0, 0, cw, LINE * M).data
  const bw = w + 1
  const bits = new Uint8Array(bw * LINE)
  for (let y = 0; y < LINE; y++)
    for (let x = 0; x < bw; x++) {
      const px = x * M + M / 2
      const py = y * M + M / 2
      bits[y * bw + x] = img[(py * cw + px) * 4 + 3]! >= 128 ? 1 : 0
    }
  const out = { w, bits }
  glyphs.set(ch, out)
  return out
}

export async function loadFont(): Promise<void> {
  await installFont()
  glyphs.clear()
}

export function measure(text: string, scale = 1): number {
  let w = 0
  for (const ch of text) w += glyph(ch).w
  return w * scale
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
  const w = Math.max(1, measure(text, scale) + scale)
  const h = LINE * scale
  const [c, g] = makeCanvas(w, h)
  const img = g.createImageData(c.width, c.height)
  const rgb = parseInt(css(color).slice(1), 16)
  const r = (rgb >> 16) & 255
  const gg = (rgb >> 8) & 255
  const b = rgb & 255
  let x0 = 0
  for (const ch of text) {
    const gl = glyph(ch)
    const bw = gl.w + 1
    for (let y = 0; y < LINE; y++)
      for (let x = 0; x < bw; x++) {
        if (!gl.bits[y * bw + x]) continue
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = (x0 + x) * scale + sx
            const py = y * scale + sy
            if (px >= c.width) continue
            const i = (py * c.width + px) * 4
            img.data[i] = r
            img.data[i + 1] = gg
            img.data[i + 2] = b
            img.data[i + 3] = 255
          }
      }
    x0 += gl.w
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
