import { Container, Graphics, Sprite } from 'pixi.js'
import { col, H, W } from './gfx'
import { Button, Timeline } from './kit'
import { TextBlock, lineTexture } from './text'

/** Титульная карточка: «смена N», что случилось ночью дома, финальные слова. */
export class Card extends Container {
  readonly tl = new Timeline()

  constructor(title: string, lines: string[], button: string, onGo: () => void) {
    super()
    const g = new Graphics()
    g.rect(0, 0, W, H).fill(col('ink'))
    this.addChild(g)
    const t = new Sprite(lineTexture(title, 'amber', 2))
    t.position.set(Math.floor((W - t.width) / 2), 70)
    this.addChild(t)
    let y = 100
    for (const l of lines) {
      const b = new TextBlock(l, { width: 300, color: 'fog', align: 'center' })
      b.position.set(90, y)
      y += b.blockHeight + 4
      this.addChild(b)
    }
    const go = new Button(button, 110, 14, { bg: 'teal', fg: 'white', edge: 'cyan' }, onGo)
    go.position.set(185, Math.max(y + 12, 170))
    this.addChild(go)
  }

  update(dtMs: number) {
    this.tl.update(dtMs)
  }
}
