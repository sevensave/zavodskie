// Строгая политика безопасности запрещает eval: Pixi подключает свой вариант шейдеров без него.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js'
import type { BillId } from '../content/home'
import { ACT_CARDS, BRANCH_CARDS } from '../content/story'
import { BRANCH_DAY, campaignOver, closeShift, decideBranch, HUMANS_DAY, newCampaign, payBills, SAVE_VERSION, setupShift, type Campaign } from '../sim/campaign'
import type { Branch } from '../sim/types'
import { emptyGallery, EndingScene, GalleryView, type Gallery } from './ending'
import { formatDate } from '../sim/dates'
import type { ShiftState } from '../sim/shift'
import { Card } from './card'
import { DayScript } from './dayscript'
import { Desk } from './desk'
import { col, H, W } from './gfx'
import { Button } from './kit'
import { sfx, unlockAudio } from './sfx'
import { Shift1Script } from './shift1script'
import { saveSlot } from './storage'
import { Summary } from './summary'
import { Home } from './home'
import { loadSlot } from './storage'
import { label, loadFont } from './text'

declare const __DEV__: boolean
declare const __APP_VERSION__: string

type Scene = Container & { update(dtMs: number): void }

async function loadCampaign(): Promise<Campaign | null> {
  const c = await loadSlot<Campaign>('campaign')
  // Старые сохранения (до кампании) не переносим: в них только итог первой смены.
  return c && c.v === SAVE_VERSION ? c : null
}

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
  let campaign: Campaign = (await loadCampaign()) ?? newCampaign(`ночь-${Math.floor(Math.random() * 1e9)}`)
  const loaded = await loadSlot<Gallery>('gallery')
  let gallery: Gallery = loaded && loaded.v === 1 ? loaded : emptyGallery()
  let galleryView: GalleryView | null = null
  const openGallery = () => {
    if (galleryView) return
    galleryView = new GalleryView(gallery, () => {
      galleryView?.destroy({ children: true })
      galleryView = null
    })
    app.stage.addChildAt(galleryView, app.stage.children.length - 1)
  }
  const pause = buildPause(
    () => setPaused(false),
    () => {
      setPaused(false)
      campaign = newCampaign(`ночь-${Math.floor(Math.random() * 1e9)}`)
      void saveSlot('campaign', campaign)
      route()
    },
    openGallery,
  )
  app.stage.addChildAt(pause, app.stage.children.length - 1)

  const setScene = (s: Scene) => {
    if (scene) scene.destroy({ children: true })
    scene = s
    root.addChild(s)
    desk = s instanceof Desk ? s : null
    cursor.texture = cursors.arrow
  }

  /** Куда идти из сохранения: на смену, домой или к финальной карточке. */
  function route() {
    if (campaignOver(campaign)) {
      if (!campaign.ending) campaign = { ...campaign, phase: 'ending', ending: 'utilized' }
      if (!gallery.seen.includes(campaign.ending!)) {
        gallery = { ...gallery, seen: [...gallery.seen, campaign.ending!] }
        void saveSlot('gallery', gallery)
      }
      setScene(
        new EndingScene(campaign, gallery, () => {
          campaign = newCampaign(`ночь-${Math.floor(Math.random() * 1e9)}`)
          void saveSlot('campaign', campaign)
          route()
        }),
      )
      return
    }
    if (campaign.phase === 'home') {
      setScene(new Home(campaign, (paid) => goToShift(paid)))
      return
    }
    startShiftScene()
  }

  function goToShift(paid: BillId[]) {
    const { campaign: next, events } = payBills(campaign, paid)
    campaign = next
    void saveSlot('campaign', campaign)
    if (campaignOver(campaign)) return route()
    const lines = events.length ? events : ['Ночь прошла тихо. Даже холодильник молчал.']
    const act = ACT_CARDS[campaign.day]
    const turn = campaign.branch && campaign.day === BRANCH_DAY + 2 ? BRANCH_CARDS[campaign.branch] : null
    const head = act ?? turn
    const card = () => setScene(new Card(`СМЕНА ${campaign.day + 1} · ${formatDate(campaign.day)}`, lines, 'К СТОЙКЕ', startShiftScene))
    if (head) setScene(new Card(head.title, head.lines, 'ДАЛЬШЕ', card))
    else card()
  }

  function startShiftScene() {
    const state = setupShift(campaign)
    const script = campaign.day === 0 ? new Shift1Script() : new DayScript(campaign.day, campaign.kesh, campaign.branch)
    const d = new Desk(state, script, (s) => finish(s))
    d.on('cursor', (k: 'arrow' | 'inspect') => (cursor.texture = cursors[k]))
    setScene(d)
  }

  function finish(s: ShiftState) {
    campaign = closeShift(campaign, s)
    void saveSlot('campaign', campaign)
    setScene(new Summary(s, campaign.last!, () => route(), campaign.branch))
  }

  function setPaused(on: boolean) {
    pause.visible = on
    if (desk) desk.paused = on
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setPaused(!pause.visible)
      return
    }
    if (pause.visible) return
    if (e.key === ' ') e.preventDefault()
    desk?.onKey(e.key)
    if (__DEV__ && e.key === 'F2') speed = speed === 1 ? 8 : 1
  })

  // Для проверки из консоли браузера в режиме разработки.
  if (__DEV__) {
    ;(window as unknown as { __zavod: unknown }).__zavod = {
      app,
      get desk() {
        return desk
      },
      get scene() {
        return scene
      },
      get campaign() {
        return campaign
      },
      /** Перепрыгнуть на смену N (с нуля): для проверки поздних инструментов. */
      jump(day: number, branch?: Branch) {
        const b = day > BRANCH_DAY ? (branch ?? campaign.branch ?? decideBranch(campaign.scales)) : null
        campaign = { ...campaign, day, phase: 'shift', ending: undefined, branch: b }
        route()
      },
      /** Сразу к концовке: для проверки сцены и галереи. */
      end(id: Campaign['ending']) {
        campaign = { ...campaign, phase: 'ending', ending: id }
        route()
      },
      humansDay: HUMANS_DAY,
    }
  }

  app.ticker.add((t) => {
    const dt = Math.min(100, t.deltaMS) * speed
    scene?.update(dt)
  })

  route()
  void window.zavod?.checkUpdate().then((u) => {
    if (u) console.info(`Вышла версия ${u.version}: ${u.url}`)
  })
  void sfx
}

function buildPause(resume: () => void, restart: () => void, gallery: () => void): Container {
  const c = new Container()
  const g = new Graphics()
  g.rect(0, 0, W, H).fill({ color: col('ink'), alpha: 0.85 })
  g.rect(170, 80, 140, 128).fill(col('ink'))
  g.rect(171, 81, 138, 126).fill(col('night'))
  c.addChild(g)
  const t = label('ПЕРЕРЫВ', 'amber', 2)
  t.position.set(240 - t.width / 2, 88)
  c.addChild(t)
  const style = { bg: 'steel', fg: 'white', edge: 'slate' } as const
  const b1 = new Button('ПРОДОЛЖИТЬ', 110, 14, style, resume)
  b1.position.set(185, 112)
  const b2 = new Button('ПОЛНЫЙ ЭКРАН', 110, 14, style, () => {
    if (window.zavod) window.zavod.toggleFullscreen()
    else if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  })
  b2.position.set(185, 130)
  // Новая игра стирает кампанию: просим нажать дважды.
  let armed = false
  const b3 = new Button('НОВАЯ ИГРА', 110, 14, style, () => {
    if (!armed) {
      armed = true
      b3.setCaption('ТОЧНО? ЕЩЁ РАЗ')
      return
    }
    armed = false
    b3.setCaption('НОВАЯ ИГРА')
    restart()
  })
  b3.position.set(185, 148)
  const b5 = new Button('КОНЦОВКИ', 110, 14, style, gallery)
  b5.position.set(185, 166)
  c.addChild(b1, b2, b3, b5)
  if (window.zavod) {
    const b4 = new Button('ВЫЙТИ', 110, 14, style, () => window.zavod?.quit())
    b4.position.set(185, 184)
    c.addChild(b4)
  }
  c.visible = false
  return c
}
