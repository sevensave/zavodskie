// Строгая политика безопасности запрещает eval: Pixi подключает свой вариант шейдеров без него.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js'
import { METLA, SHIFT1_GENERATED, TIMOSHA } from '../content/shift1'
import { startShift, summarize, type ShiftState } from '../sim/shift'
import { Desk } from './desk'
import { col, H, W } from './gfx'
import { Button } from './kit'
import { sfx, unlockAudio } from './sfx'
import { Shift1Script } from './shift1script'
import { saveSlot } from './storage'
import { Summary } from './summary'
import { label, loadFont } from './text'

declare const __DEV__: boolean
declare const __APP_VERSION__: string

type Scene = Container & { update(dtMs: number): void }

const SAVE_VERSION = 1

/** Курсоры рисуются в игре, чтобы оставаться пиксельными при любом масштабе. */
function cursorTexture(kind: 'arrow' | 'inspect'): Texture {
  const g = new Graphics()
  if (kind === 'arrow') {
    const rows = ['X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWXXX', 'XWXWX', 'XX XWX', '   XX']
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === 'X') g.rect(x, y, 1, 1).fill(col('ink'))
      if (ch === 'W') g.rect(x, y, 1, 1).fill(col('white'))
    }))
  } else {
    g.circle(4, 4, 4).stroke({ color: col('ink'), width: 2 })
    g.circle(4, 4, 3).stroke({ color: col('yellow'), width: 1 })
    g.rect(7, 7, 2, 2).fill(col('ink'))
    g.rect(8, 8, 3, 3).fill(col('ink'))
    g.rect(9, 9, 1, 1).fill(col('amber'))
  }
  return gameApp!.renderer.generateTexture({ target: g, resolution: 1 })
}

let gameApp: Application | null = null

export async function boot(host: HTMLElement) {
  const app = new Application()
  gameApp = app
  await app.init({ width: W, height: H, background: col('ink'), antialias: false, resolution: 1, roundPixels: true })
  await loadFont()
  host.appendChild(app.canvas)

  // Целочисленный масштаб в физических пикселях экрана.
  const fit = () => {
    const dpr = window.devicePixelRatio || 1
    const k = Math.max(1, Math.floor(Math.min((innerWidth * dpr) / W, (innerHeight * dpr) / H)))
    app.canvas.style.width = `${(W * k) / dpr}px`
    app.canvas.style.height = `${(H * k) / dpr}px`
  }
  fit()
  addEventListener('resize', fit)

  const root = new Container()
  app.stage.addChild(root)
  // Сцена не должна быть интерактивной целиком: в Pixi режим 'static' наследуется детьми,
  // и любой верхний слой (например, затемнение слепой камеры) начинал бы перехватывать клики.
  app.stage.eventMode = 'passive'
  const backdrop = new Graphics().rect(0, 0, W, H).fill({ color: 0, alpha: 0.001 })
  backdrop.eventMode = 'static'
  backdrop.hitArea = new Rectangle(0, 0, W, H)
  app.stage.addChildAt(backdrop, 0)

  const cursors = { arrow: cursorTexture('arrow'), inspect: cursorTexture('inspect') }
  const cursor = new Sprite(cursors.arrow)
  cursor.eventMode = 'none'
  app.stage.addChild(cursor)
  backdrop.on('globalpointermove', (e) => {
    cursor.position.set(Math.round(e.global.x) - (cursor.texture === cursors.inspect ? 4 : 0), Math.round(e.global.y) - (cursor.texture === cursors.inspect ? 4 : 0))
  })
  app.canvas.addEventListener('pointerleave', () => (cursor.visible = false))
  app.canvas.addEventListener('pointerenter', () => (cursor.visible = true))
  addEventListener('pointerdown', () => unlockAudio())
  addEventListener('keydown', () => unlockAudio())

  let scene: Scene | null = null
  let desk: Desk | null = null
  let speed = 1
  const pause = buildPause(() => setPaused(false))
  app.stage.addChildAt(pause, app.stage.children.length - 1)

  const setScene = (s: Scene) => {
    if (scene) scene.destroy({ children: true })
    scene = s
    root.addChild(s)
    desk = s instanceof Desk ? s : null
    cursor.texture = cursors.arrow
  }

  const startDay1 = () => {
    const seed = `ночь-${Math.floor(Math.random() * 1e9)}`
    const state = startShift(seed, 0, [TIMOSHA, METLA], SHIFT1_GENERATED)
    const script = new Shift1Script()
    const d = new Desk(state, script, (s) => void finish(s, script))
    d.on('cursor', (k: 'arrow' | 'inspect') => (cursor.texture = cursors[k]))
    setScene(d)
  }

  const finish = async (s: ShiftState, script: Shift1Script) => {
    await saveSlot('campaign', {
      v: SAVE_VERSION,
      version: __APP_VERSION__,
      completedShift: s.day + 1,
      scales: s.scales,
      summary: summarize(s),
      seed: s.seed,
      savedAt: new Date().toISOString(),
    })
    setScene(new Summary(s, script.cliffhanger(), { again: startDay1, quit: window.zavod ? () => window.zavod?.quit() : undefined }))
  }

  function setPaused(on: boolean) {
    pause.visible = on
    if (desk) desk.paused = on
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (desk) setPaused(!pause.visible)
      return
    }
    if (pause.visible) return
    if (e.key === ' ') {
      e.preventDefault()
      desk?.onKey(' ')
    }
    if (__DEV__ && e.key === 'F2') speed = speed === 1 ? 8 : 1
  })

  // Для проверки из консоли браузера в режиме разработки.
  if (__DEV__) (window as unknown as { __zavod: unknown }).__zavod = { app, get desk() { return desk }, get scene() { return scene } }

  app.ticker.add((t) => {
    const dt = Math.min(100, t.deltaMS) * speed
    scene?.update(dt)
  })

  startDay1()
  void window.zavod?.checkUpdate().then((u) => {
    if (u) console.info(`Вышла версия ${u.version}: ${u.url}`)
  })
  void sfx
}

function buildPause(resume: () => void): Container {
  const c = new Container()
  const g = new Graphics()
  g.rect(0, 0, W, H).fill({ color: col('ink'), alpha: 0.85 })
  g.rect(170, 90, 140, 90).fill(col('ink'))
  g.rect(171, 91, 138, 88).fill(col('night'))
  c.addChild(g)
  const t = label('ПЕРЕРЫВ', 'amber', 2)
  t.position.set(240 - t.width / 2, 98)
  c.addChild(t)
  const style = { bg: 'steel', fg: 'white', edge: 'slate' } as const
  const b1 = new Button('ПРОДОЛЖИТЬ', 110, 14, style, resume)
  b1.position.set(185, 122)
  const b2 = new Button('ПОЛНЫЙ ЭКРАН', 110, 14, style, () => {
    if (window.zavod) window.zavod.toggleFullscreen()
    else if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  })
  b2.position.set(185, 140)
  c.addChild(b1, b2)
  if (window.zavod) {
    const b3 = new Button('ВЫЙТИ', 110, 14, style, () => window.zavod?.quit())
    b3.position.set(185, 158)
    c.addChild(b3)
  }
  c.visible = false
  return c
}
