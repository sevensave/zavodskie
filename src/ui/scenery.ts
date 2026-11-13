import { Container, Graphics, Sprite } from 'pixi.js'
import { modelById } from '../content/models'
import { PEOPLE } from '../content/story'
import { col } from './gfx'
import { deviceTexture, portraitTexture } from './sprites'
import { TextBlock } from './text'

// Декорации из графики самой игры: окно приёма под дождём. Нужны главному меню и арту для каталога.

export function rain(g: Graphics, w: number, h: number, seed: number) {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < (w * h) / 90; i++) {
    const x = Math.floor(rnd() * w)
    const y = Math.floor(rnd() * h)
    g.rect(x, y, 1, 3 + Math.floor(rnd() * 3)).fill({ color: col('slate'), alpha: 0.35 })
  }
}

/** Окно приёма: зал за стеклом, очередь, посетитель и прибор на стойке. */
export function windowScene(w: number, h: number, counterY: number): Container {
  const c = new Container()
  const g = new Graphics()
  g.rect(0, 0, w, h).fill(col('steel'))
  g.rect(0, Math.floor(h * 0.55), w, h).fill(col('shadow'))
  for (let x = 6; x < w; x += 30) g.rect(x, 4, 14, 30).fill(col('shadow'))
  for (let i = 0; i < 5; i++) {
    const x = w - 26 - i * 14
    g.circle(x + 5, counterY - 48, 5).fill(col('night'))
    g.rect(x, counterY - 43, 11, 30).fill(col('night'))
  }
  c.addChild(g)
  const visitor = new Sprite(portraitTexture(PEOPLE.lanskoy.look))
  visitor.position.set(Math.floor(w * 0.16), counterY - visitor.height + 10)
  c.addChild(visitor)
  const m = modelById('timosha')
  const dev = new Sprite(deviceTexture(m.id, m.art))
  dev.position.set(Math.floor(w * 0.58) - Math.floor(dev.width / 2), counterY - dev.height + 3)
  c.addChild(dev)
  const counter = new Graphics()
  counter.rect(0, counterY, w, 4).fill(col('woodLight'))
  counter.rect(0, counterY + 4, w, h - counterY).fill(col('wood'))
  for (let x = 4; x < w; x += 23) counter.rect(x, counterY + 6, 9, 1).fill(col('night'))
  c.addChild(counter)
  return c
}

export function bubble(text: string, width: number, color: 'cyan' | 'ink', bg: 'night' | 'white'): Container {
  const c = new Container()
  const t = new TextBlock(text, { width, color })
  const g = new Graphics()
  g.rect(0, 0, width + 8, t.blockHeight + 6).fill(col('ink'))
  g.rect(1, 1, width + 6, t.blockHeight + 4).fill(col(bg))
  t.position.set(4, 3)
  c.addChild(g, t)
  return c
}

export function framed(inner: Container, x: number, y: number, w: number, h: number, parent: Container) {
  const g = new Graphics()
  g.rect(x - 3, y - 3, w + 6, h + 6).fill(col('ink'))
  g.rect(x - 2, y - 2, w + 4, h + 4).fill(col('steel'))
  const mask = new Graphics().rect(x, y, w, h).fill(0xffffff)
  inner.position.set(x, y)
  inner.mask = mask
  parent.addChild(g, inner, mask)
}
