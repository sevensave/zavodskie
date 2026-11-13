import { Container, Graphics, Sprite } from 'pixi.js'
import { MENU_TEXT } from '../content/menu'
import type { Campaign } from '../sim/campaign'
import { formatDate } from '../sim/dates'
import { col, H, W } from './gfx'
import { Button } from './kit'
import { bubble, framed, rain, windowScene } from './scenery'
import { isMuted } from './sfx'
import { label, lineTexture } from './text'

export interface TitleActions {
  /** Продолжить сохранённую кампанию (или начать первую, если сохранения нет). */
  play(): void
  /** Стереть кампанию и начать заново. */
  fresh(): void
  modes(): void
  toggleSound(): boolean
  fullscreen(): void
  quit?: () => void
}

function saveLine(c: Campaign | null): [string, 'cyan' | 'slate'] {
  if (!c) return [MENU_TEXT.noSave, 'slate']
  const plus = c.plus ? MENU_TEXT.savePlus : ''
  if (c.phase === 'ending') return [MENU_TEXT.saveEnding + plus, 'cyan']
  const line = c.phase === 'home' ? MENU_TEXT.saveHome(c.day + 1, formatDate(c.day), c.money) : MENU_TEXT.saveShift(c.day + 1, formatDate(c.day), c.money)
  return [line + plus, 'cyan']
}

/** Главное меню: окно приёма под дождём, сохранение и кнопки. */
export class TitleScene extends Container {
  private rainG = new Graphics()
  private rainMask = new Graphics()
  private t = 0
  private seed = 1

  constructor(saved: Campaign | null, version: string, act: TitleActions) {
    super()
    const g = new Graphics()
    g.rect(0, 0, W, H).fill(col('ink'))
    for (let x = 220; x < W; x += 16) g.rect(x, 0, 1, H).fill({ color: col('shadow'), alpha: Math.min(1, (x - 220) / 120) })
    this.addChild(g)

    framed(windowScene(200, 150, 124), 256, 50, 200, 150, this)
    const b = bubble(MENU_TEXT.bubble, 64, 'cyan', 'night')
    b.position.set(372, 60)
    this.addChild(b)
    this.rainMask.rect(220, 0, W - 220, H).fill(0xffffff)
    this.rainG.mask = this.rainMask
    this.addChild(this.rainG, this.rainMask)
    this.drawRain()

    const t1 = new Sprite(lineTexture(MENU_TEXT.title1, 'amber', 2))
    const t2 = new Sprite(lineTexture(MENU_TEXT.title2, 'amber', 2))
    t1.position.set(30, 34)
    t2.position.set(30, 52)
    const sub = label(MENU_TEXT.sub, 'fog')
    sub.position.set(30, 76)
    const [line, color] = saveLine(saved)
    const save = label(line, color)
    save.position.set(30, 90)
    this.addChild(t1, t2, sub, save)

    const style = { bg: 'steel', fg: 'white', edge: 'slate' } as const
    const main = { bg: 'teal', fg: 'white', edge: 'cyan' } as const
    const buttons: Button[] = []
    buttons.push(new Button(saved ? MENU_TEXT.cont : MENU_TEXT.start, 130, 14, main, act.play))
    if (saved) {
      // Новая игра стирает кампанию: просим нажать дважды.
      let armed = false
      const fresh: Button = new Button(MENU_TEXT.fresh, 130, 14, style, () => {
        if (!armed) {
          armed = true
          fresh.setCaption(MENU_TEXT.freshSure)
          return
        }
        act.fresh()
      })
      buttons.push(fresh)
    }
    buttons.push(new Button(MENU_TEXT.modes, 130, 14, style, act.modes))
    const sound: Button = new Button(MENU_TEXT.sound(isMuted()), 130, 14, style, () => sound.setCaption(MENU_TEXT.sound(act.toggleSound())))
    buttons.push(sound)
    buttons.push(new Button(MENU_TEXT.fullscreen, 130, 14, style, act.fullscreen))
    if (act.quit) buttons.push(new Button(MENU_TEXT.quit, 130, 14, style, act.quit))
    buttons.forEach((btn, i) => {
      btn.position.set(30, 110 + i * 18)
      this.addChild(btn)
    })

    const foot = label(MENU_TEXT.footer(version), 'slate')
    foot.position.set(30, H - 16)
    this.addChild(foot)
  }

  private drawRain() {
    this.rainG.clear()
    rain(this.rainG, W, H, this.seed)
  }

  update(dtMs: number) {
    this.t += dtMs
    if (this.t >= 140) {
      this.t = 0
      this.seed = (this.seed % 9) + 1
      this.drawRain()
    }
  }
}
