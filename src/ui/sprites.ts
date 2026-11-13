import type { Texture } from 'pixi.js'
import type { DeviceArt } from '../content/art'
import { COATS, HAIR_COLORS, PAL, SKINS, type ColorKey } from '../content/palette'
import type { VisitorLook } from '../sim/types'
import { makeCanvas, texFrom } from './gfx'

// Спрайты собираются из данных: детали устройств — из content/models.ts, лица — из параметров VisitorLook.

const LIGHT: Partial<Record<ColorKey, ColorKey>> = {
  yellow: 'white', red: 'pink', fog: 'white', slate: 'fog', steel: 'slate', white: 'white', shadow: 'steel',
  teal: 'cyan', pink: 'skin1', paper: 'white', amber: 'yellow', olive: 'green', wood: 'woodLight', woodLight: 'skin2',
  blue: 'violet', violet: 'pink', rust: 'red', skin1: 'white', skin2: 'skin1', skin3: 'skin2', ink: 'night', night: 'shadow',
  green: 'cyan', cyan: 'white',
}
const DARK: Partial<Record<ColorKey, ColorKey>> = {
  yellow: 'amber', red: 'rust', fog: 'slate', slate: 'steel', steel: 'shadow', white: 'paper', shadow: 'night',
  teal: 'shadow', pink: 'skin2', paper: 'fog', amber: 'rust', olive: 'wood', wood: 'night', woodLight: 'wood',
  blue: 'shadow', violet: 'shadow', rust: 'wood', skin1: 'skin2', skin2: 'skin3', skin3: 'wood', ink: 'ink', night: 'ink',
  green: 'olive', cyan: 'teal',
}

/** Простая сетка пикселей с цветами палитры. */
class Grid {
  readonly px: (ColorKey | null)[]
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null)
  }
  get(x: number, y: number): ColorKey | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    return this.px[y * this.w + x] ?? null
  }
  set(x: number, y: number, c: ColorKey) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = c
  }
  rect(x: number, y: number, w: number, h: number, c: ColorKey) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }
  line(x1: number, y1: number, x2: number, y2: number, c: ColorKey) {
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1)
    for (let i = 0; i <= n; i++) this.set(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, c)
  }
  /** Заливка формы по маске с подсветкой сверху и тенью снизу/справа. */
  shape(inside: (x: number, y: number) => boolean, x0: number, y0: number, w: number, h: number, c: ColorKey, shade: boolean) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (!inside(x, y)) continue
        let k = c
        if (shade) {
          if (!inside(x, y + 1) || !inside(x + 1, y)) k = DARK[c] ?? c
          else if (!inside(x, y - 1)) k = LIGHT[c] ?? c
        }
        this.set(x, y, k)
      }
    }
  }
  /** Чернильный контур вокруг всего непрозрачного. */
  outline(c: ColorKey = 'ink') {
    const add: [number, number][] = []
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y])
      }
    }
    for (const [x, y] of add) this.set(x, y, c)
  }
  toTexture(): Texture {
    const [cv, g] = makeCanvas(this.w, this.h)
    const img = g.createImageData(this.w, this.h)
    this.px.forEach((k, i) => {
      if (!k) return
      const v = PAL[k]
      img.data[i * 4] = (v >> 16) & 255
      img.data[i * 4 + 1] = (v >> 8) & 255
      img.data[i * 4 + 2] = v & 255
      img.data[i * 4 + 3] = 255
    })
    g.putImageData(img, 0, 0)
    return texFrom(cv)
  }
}

const deviceCache = new Map<string, Texture>()

/** Спрайт устройства с контуром (на 1 пиксель шире с каждой стороны). */
export function deviceTexture(id: string, art: DeviceArt): Texture {
  const hit = deviceCache.get(id)
  if (hit) return hit
  const g = new Grid(art.w + 2, art.h + 2)
  for (const p of art.parts) {
    if (p.k === 'rect') {
      const x0 = p.x + 1
      const y0 = p.y + 1
      g.shape((x, y) => x >= x0 && x < x0 + p.w && y >= y0 && y < y0 + p.h, x0, y0, p.w, p.h, p.c, !!p.shade)
    } else if (p.k === 'oval') {
      const cx = p.x + 1 + p.w / 2
      const cy = p.y + 1 + p.h / 2
      const inside = (x: number, y: number) => ((x + 0.5 - cx) / (p.w / 2)) ** 2 + ((y + 0.5 - cy) / (p.h / 2)) ** 2 <= 1
      g.shape(inside, p.x + 1, p.y + 1, p.w, p.h, p.c, !!p.shade)
    } else if (p.k === 'line') {
      g.line(p.x1 + 1, p.y1 + 1, p.x2 + 1, p.y2 + 1, p.c)
    } else {
      for (const [x, y] of p.pts) g.set(x + 1, y + 1, p.c)
    }
  }
  const out = new Grid(art.w + 4, art.h + 4)
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const k = g.get(x, y)
    if (k) out.set(x + 1, y + 1, k)
  }
  out.outline()
  const t = out.toTexture()
  deviceCache.set(id, t)
  return t
}

export const PORTRAIT_W = 48
export const PORTRAIT_H = 66

/** Портрет посетителя по пояс. */
export function portraitTexture(look: VisitorLook): Texture {
  const g = new Grid(PORTRAIT_W, PORTRAIT_H)
  const skin = SKINS[look.skin % SKINS.length]!
  const skinD = DARK[skin] ?? skin
  const hair = HAIR_COLORS[look.hairColor % HAIR_COLORS.length]!
  const coat = COATS[look.coat % COATS.length]!
  const cx = 24
  const headW = look.build === 1 ? 17 : 19
  const headH = 22
  const top = 8
  const hl = cx - Math.floor(headW / 2)

  // Плечи и пальто.
  const shoulderTop = 44
  g.shape(
    (x, y) => {
      if (y < shoulderTop) return false
      const half = 13 + Math.min(10, (y - shoulderTop) * 2)
      return Math.abs(x + 0.5 - cx) <= half
    },
    0, shoulderTop, PORTRAIT_W, PORTRAIT_H - shoulderTop, coat, true,
  )
  // Шея.
  g.rect(cx - 4, top + headH - 3, 8, 8, skinD)
  g.rect(cx - 3, top + headH - 3, 6, 7, skin)
  // Воротник.
  if (look.collar === 1) {
    g.line(cx - 6, shoulderTop, cx - 1, shoulderTop + 6, 'white')
    g.line(cx + 5, shoulderTop, cx, shoulderTop + 6, 'white')
    g.line(cx - 5, shoulderTop, cx - 1, shoulderTop + 5, 'white')
    g.line(cx + 4, shoulderTop, cx, shoulderTop + 5, 'white')
  } else if (look.collar === 2) {
    g.rect(cx - 8, shoulderTop - 2, 16, 4, look.coat % 2 ? 'red' : 'amber')
    g.rect(cx + 2, shoulderTop + 2, 3, 8, look.coat % 2 ? 'red' : 'amber')
  } else {
    g.rect(cx - 2, shoulderTop, 4, 10, 'ink')
  }

  // Голова.
  const headIn = (x: number, y: number) => {
    const nx = (x + 0.5 - cx) / (headW / 2)
    const ny = (y + 0.5 - (top + headH / 2)) / (headH / 2)
    // Чуть сужаем подбородок.
    const squeeze = ny > 0.3 ? 1 + (ny - 0.3) * 0.6 : 1
    return (nx * squeeze) ** 2 + ny ** 2 <= 1
  }
  g.shape(headIn, 0, top, PORTRAIT_W, headH, skin, true)
  // Уши.
  g.rect(hl - 1, top + 10, 2, 4, skinD)
  g.rect(hl + headW - 1, top + 10, 2, 4, skinD)

  // Причёска.
  const style = look.hair % 6
  const hairRows = (rows: number, sides: number, extraOut = 1) => {
    for (let y = top - extraOut; y < top + headH; y++) {
      for (let x = hl - extraOut; x < hl + headW + extraOut; x++) {
        const inTop = y < top + rows && headIn(x, y + extraOut)
        const inSide = y < top + rows + sides && (x <= hl + 1 || x >= hl + headW - 2) && headIn(x, y)
        if (inTop || inSide) g.set(x, y, hair)
      }
    }
  }
  if (style === 0) hairRows(5, 3)
  else if (style === 1) {
    // Лысина с остатками по бокам.
    for (let y = top + 6; y < top + 13; y++) {
      g.set(hl, y, hair)
      g.set(hl + 1, y, hair)
      g.set(hl + headW - 1, y, hair)
      g.set(hl + headW - 2, y, hair)
    }
  } else if (style === 2) {
    hairRows(6, 2)
    g.line(hl + 5, top - 1, hl + 9, top + 4, DARK[hair] ?? hair)
  } else if (style === 3) {
    hairRows(6, 10)
    g.rect(hl - 1, top + 12, 3, 22, hair)
    g.rect(hl + headW - 2, top + 12, 3, 22, hair)
  } else if (style === 4) {
    hairRows(4, 6)
    g.rect(hl + 2, top - 2, headW - 4, 3, hair)
  } else {
    hairRows(5, 4)
    g.shape((x, y) => (x + 0.5 - cx) ** 2 / 25 + (y + 0.5 - (top - 3)) ** 2 / 9 <= 1, cx - 6, top - 7, 12, 8, hair, true)
  }

  // Лицо.
  const ey = top + 10
  const ex1 = cx - 5
  const ex2 = cx + 3
  const eyeType = look.eyes % 4
  for (const ex of [ex1, ex2]) {
    if (eyeType === 0) g.rect(ex, ey, 2, 1, 'ink')
    else if (eyeType === 1) {
      g.rect(ex, ey, 2, 1, 'ink')
      g.rect(ex, ey + 2, 2, 1, skinD)
    } else if (eyeType === 2) g.rect(ex - 1, ey, 3, 1, 'ink')
    else {
      g.rect(ex, ey, 2, 2, 'white')
      g.set(ex + (ex === ex1 ? 1 : 0), ey + 1, 'ink')
    }
  }
  const brow = look.brows % 3
  const browC = DARK[hair] ?? 'ink'
  if (brow === 1) {
    g.rect(ex1 - 1, ey - 2, 4, 1, browC)
    g.rect(ex2 - 1, ey - 2, 4, 1, browC)
  } else if (brow === 2) {
    g.line(ex1 - 1, ey - 3, ex1 + 2, ey - 2, browC)
    g.line(ex2, ey - 2, ex2 + 3, ey - 3, browC)
  } else {
    g.rect(ex1, ey - 2, 2, 1, browC)
    g.rect(ex2, ey - 2, 2, 1, browC)
  }
  const nose = look.nose % 3
  if (nose === 0) g.set(cx, ey + 4, skinD)
  else if (nose === 1) g.line(cx, ey + 1, cx, ey + 5, skinD)
  else g.rect(cx - 1, ey + 4, 3, 2, skinD)

  const my = top + 17
  const mouth = look.mouth % 4
  if (mouth === 0) g.rect(cx - 2, my, 5, 1, 'rust')
  else if (mouth === 1) {
    g.rect(cx - 1, my, 3, 1, 'rust')
    g.set(cx - 2, my + 1, 'rust')
    g.set(cx + 2, my + 1, 'rust')
  } else if (mouth === 2) g.rect(cx - 1, my, 3, 1, 'rust')
  else {
    g.rect(cx - 2, my, 5, 1, 'rust')
    g.set(cx + 3, my - 1, 'rust')
  }

  // Детали.
  const extra = look.extra % 6
  if (extra === 1) {
    for (const ex of [ex1, ex2]) {
      g.rect(ex - 2, ey - 1, 6, 1, 'ink')
      g.rect(ex - 2, ey + 2, 6, 1, 'ink')
      g.set(ex - 2, ey, 'ink')
      g.set(ex - 2, ey + 1, 'ink')
      g.set(ex + 3, ey, 'ink')
      g.set(ex + 3, ey + 1, 'ink')
    }
    g.rect(ex1 + 4, ey, 1, 1, 'ink')
  } else if (extra === 2) {
    for (let y = my - 1; y < top + headH; y++) for (let x = hl + 2; x < hl + headW - 2; x++) {
      if (headIn(x, y) && (x + y) % 2 === 0 && !(y === my && Math.abs(x - cx) < 3)) g.set(x, y, DARK[hair] ?? hair)
    }
  } else if (extra === 3) {
    g.set(hl - 1, top + 15, 'yellow')
  } else if (extra === 4) {
    const capC: ColorKey = look.coat % 2 ? 'shadow' : 'wood'
    g.shape((x, y) => headIn(x, y + 3) && y < top + 4, hl - 2, top - 4, headW + 4, 8, capC, true)
    g.rect(hl - 2, top + 3, headW + 6, 2, DARK[capC] ?? capC)
  } else if (extra === 5) {
    g.rect(ex2 + 1, ey + 4, 4, 2, 'paper')
    g.set(ex2 + 2, ey + 4, 'fog')
  }

  g.outline()
  return g.toTexture()
}

/** Лицо Кэша на экране терминала, 15×13. */
export function cashFace(mood: 'corp' | 'true' | 'glitch'): Texture {
  const g = new Grid(15, 13)
  const c: ColorKey = mood === 'corp' ? 'cyan' : mood === 'true' ? 'amber' : 'red'
  for (let x = 1; x < 14; x++) {
    g.set(x, 0, c)
    g.set(x, 12, c)
  }
  for (let y = 1; y < 12; y++) {
    g.set(0, y, c)
    g.set(14, y, c)
  }
  if (mood === 'corp') {
    g.rect(4, 3, 2, 3, c)
    g.rect(9, 3, 2, 3, c)
    g.set(3, 8, c)
    g.line(4, 9, 10, 9, c)
    g.set(11, 8, c)
  } else if (mood === 'true') {
    g.rect(4, 4, 2, 1, c)
    g.rect(9, 3, 2, 3, c)
    g.line(4, 9, 10, 9, c)
  } else {
    g.rect(3, 3, 3, 3, c)
    g.line(8, 4, 11, 4, c)
    g.line(3, 8, 6, 10, c)
    g.line(7, 9, 11, 8, c)
  }
  return g.toTexture()
}
