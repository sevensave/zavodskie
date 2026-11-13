import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import { AGENT_REVEAL, BRANCH_NOTE, ENDING_TEXT, ENDINGS, KESH_REVEAL, endingById } from '../content/endings'
import type { Campaign } from '../sim/campaign'
import type { EndingId } from '../sim/types'
import { col, H, W } from './gfx'
import { Button, paperRect, Timeline } from './kit'
import { sfx } from './sfx'
import { TextBlock, label, lineTexture } from './text'

/** Галерея концовок хранится отдельно от кампании: новая игра её не стирает. */
export interface Gallery {
  v: 1
  seen: EndingId[]
}

export function emptyGallery(): Gallery {
  return { v: 1, seen: [] }
}

/** Сцена концовки: текст печатается по строке, потом открывается правда забега. */
export class EndingScene extends Container {
  readonly tl = new Timeline()
  private typing: { block: TextBlock; shown: number }[] = []
  private overlay: Container | null = null

  constructor(
    c: Campaign,
    private gallery: Gallery,
    onAgain: () => void,
    onModes?: () => void,
  ) {
    super()
    const e = endingById(c.ending!)
    const g = new Graphics()
    g.rect(0, 0, W, H).fill(col('ink'))
    g.rect(30, 44, 420, 1).fill(col('steel'))
    this.addChild(g)
    const n = ENDINGS.findIndex((x) => x.id === e.id) + 1
    const top = label(`${ENDING_TEXT.title} № ${n} · СМЕНА ${Math.min(c.day + 1, 21)}`, 'slate')
    top.position.set(Math.floor((W - top.width) / 2), 10)
    const title = new Sprite(lineTexture(e.title, 'amber', 2))
    title.position.set(Math.floor((W - title.width) / 2), 22)
    this.addChild(top, title)

    let y = 52
    const blocks: TextBlock[] = []
    for (const l of e.lines) {
      const b = new TextBlock(l, { width: 420, color: 'fog' })
      b.position.set(30, y)
      b.reveal(0)
      y += b.blockHeight + 4
      this.addChild(b)
      blocks.push(b)
    }
    y += 6
    const reveal: string[] = [KESH_REVEAL[c.kesh], AGENT_REVEAL[c.agent]]
    if (c.branch) reveal.push(BRANCH_NOTE[c.branch])
    for (const l of reveal) {
      const b = new TextBlock(l, { width: 420, color: 'amber' })
      b.position.set(30, y)
      b.reveal(0)
      y += b.blockHeight + 2
      this.addChild(b)
      blocks.push(b)
    }

    const style = { bg: 'teal', fg: 'white', edge: 'cyan' } as const
    const gal = new Button(ENDING_TEXT.gallery, 100, 14, { bg: 'steel', fg: 'white', edge: 'slate' }, () => this.openGallery())
    const again = new Button(ENDING_TEXT.again, 100, 14, style, onAgain)
    const modes = new Button('РЕЖИМЫ', 100, 14, { bg: 'steel', fg: 'white', edge: 'slate' }, () => onModes?.())
    gal.position.set(70, 248)
    modes.position.set(190, 248)
    again.position.set(310, 248)
    gal.visible = again.visible = modes.visible = false
    this.addChild(gal, modes, again)

    void (async () => {
      sfx.motif()
      await this.tl.wait(700)
      sfx.paper()
      for (const b of blocks) {
        await this.type(b)
        await this.tl.wait(250)
      }
      gal.visible = again.visible = true
      modes.visible = !!onModes
    })()
  }

  private openGallery() {
    if (this.overlay) return
    this.overlay = new GalleryView(this.gallery, () => {
      this.overlay?.destroy({ children: true })
      this.overlay = null
    })
    this.addChild(this.overlay)
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
      t.shown = Math.min(t.block.totalChars, t.shown + (dtMs / 1000) * 40)
      if (Math.floor(t.shown) !== before && Math.floor(t.shown) % 4 === 0) sfx.blip()
      t.block.reveal(Math.floor(t.shown))
    }
  }
}

/** Галерея: девять карточек. Открытые — с названием, закрытые — с подсказкой. */
export class GalleryView extends Container {
  constructor(gallery: Gallery, onClose: () => void) {
    super()
    const g = new Graphics()
    g.rect(0, 0, W, H).fill(col('ink'))
    this.addChild(g)
    // Сам слой ловит клики, чтобы под ним ничего не нажималось; дети — кнопка и карточки.
    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, W, H)
    const head = label(`${ENDING_TEXT.gallery} · ${ENDING_TEXT.found(gallery.seen.length)}`, 'amber')
    head.position.set(Math.floor((W - head.width) / 2), 8)
    this.addChild(head)
    ENDINGS.forEach((e, i) => {
      const x = 12 + (i % 3) * 154
      const y = 22 + Math.floor(i / 3) * 74
      const seen = gallery.seen.includes(e.id)
      paperRect(g, x, y, 148, 68, seen ? 'paper' : 'night', seen ? 'ink' : 'steel')
      const num = label(String(i + 1), seen ? 'rust' : 'slate')
      num.position.set(x + 5, y + 4)
      const t = label(seen ? e.title : ENDING_TEXT.locked, seen ? 'ink' : 'fog')
      t.position.set(x + 16, y + 4)
      const b = new TextBlock(seen ? e.blurb : e.hint, { width: 136, color: seen ? 'shadow' : 'slate' })
      b.position.set(x + 6, y + 17)
      this.addChild(num, t, b)
    })
    const close = new Button(ENDING_TEXT.close, 90, 14, { bg: 'steel', fg: 'white', edge: 'slate' }, onClose)
    close.position.set(195, 250)
    this.addChild(close)
  }
}
