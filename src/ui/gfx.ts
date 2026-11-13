import { Rectangle, Texture, TextureSource } from 'pixi.js'
import { PAL, type ColorKey } from '../content/palette'

TextureSource.defaultOptions.scaleMode = 'nearest'

export const W = 480
export const H = 270

export function css(c: ColorKey | number): string {
  const v = typeof c === 'number' ? c : PAL[c]
  return `#${v.toString(16).padStart(6, '0')}`
}

export function col(c: ColorKey): number {
  return PAL[c]
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingEnabled = false
  return [c, g]
}

export function texFrom(canvas: HTMLCanvasElement): Texture {
  return Texture.from(canvas)
}

/** Кусок текстуры без копирования: для машинки, которая печатает строку по буквам. */
export function subTexture(t: Texture, w: number, h?: number): Texture {
  return new Texture({ source: t.source, frame: new Rectangle(0, 0, Math.max(1, Math.min(w, t.width)), h ?? t.height) })
}
