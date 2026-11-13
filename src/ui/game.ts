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
import { isMuted, setMood, setMuted, sfx, tickAmbience, unlockAudio } from './sfx'
import { Shift1Script } from './shift1script'
import { saveSlot } from './storage'
import { ModeScript } from './modescript'
import { AchView, FilesView, ModesView, Toaster } from './metaviews'
import { ACHIEVEMENTS } from '../content/achievements'
import { MODES_TEXT, type EndlessMod } from '../content/modes'
import { applyMeta, emptyMeta, META_VERSION, type Meta, type MetaEvent } from '../sim/meta'
import { dailyCode, dailyKesh, dailyKey, dailyScore, endlessDay, endlessScore, setupDaily, setupEndless } from '../sim/modes'
import { Summary } from './summary'
import { TitleScene } from './title'
import { Home } from './home'
import { loadSlot } from './storage'
import { label, loadFont } from './text'
import { MENU_TEXT } from '../content/menu'

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
  const savedCampaign = await loadCampaign()
  /** Есть ли кампания на диске: от этого зависит «Продолжить» в главном меню. */
  let hasSave = !!savedCampaign
  let campaign: Campaign = savedCampaign ?? newCampaign(`ночь-${Math.floor(Math.random() * 1e9)}`)
  const saveCampaign = () => {
    hasSave = true
    void saveSlot('campaign', campaign)
  }
  const loaded = await loadSlot<Gallery>('gallery')
  let gallery: Gallery = loaded && loaded.v === 1 ? loaded : emptyGallery()
  const settings = (await loadSlot<{ muted?: boolean }>('settings')) ?? {}
  setMuted(!!settings.muted)
  const loadedMeta = await loadSlot<Meta>('meta')
  let meta: Meta = loadedMeta && loadedMeta.v === META_VERSION ? { ...emptyMeta(), ...loadedMeta } : emptyMeta()
  const toaster = new Toaster()
  /** Учесть событие в мете: картотека, рекорды, достижения. */
  const award = (e: MetaEvent) => {
    const r = applyMeta(meta, e)
    meta = r.meta
    void saveSlot('meta', meta)
    for (const id of r.unlocked) toaster.push(ACHIEVEMENTS.find((a) => a.id === id)!.title)
  }
  /** Чем сейчас занята стойка: кампанией или режимом. */
  let mode: 'campaign' | 'daily' | 'endless' = 'campaign'

  let modesView: ModesView | null = null
  const closeModes = () => {
    modesView?.destroy({ children: true })
    modesView = null
  }
  const leaveMenus = () => {
    closeModes()
    setPaused(false)
  }
  const openModes = () => {
    if (modesView) return
    const now = new Date()
    const key = dailyKey(now)
    const today = { key, label: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}` }
    const view: ModesView = new ModesView(
      meta,
      today,
      {
        daily: () => {
          leaveMenus()
          startDaily()
        },
        endless: (mods) => {
          leaveMenus()
          startEndless(mods)
        },
        plus: () => {
          leaveMenus()
          campaign = newCampaign(`ночь-${Math.floor(Math.random() * 1e9)}`, 1)
          saveCampaign()
          award({ kind: 'plus' })
          setScene(new Card(MODES_TEXT.plus, ['Обучение вы уже прошли. Ночь вторая.', 'Все инструменты на столе. Квоты выше. Люди — не те, что в прошлый раз.'], 'К СТОЙКЕ', () => route()))
        },
        files: () => view.push(new FilesView(meta, () => view.closeSub())),
        achievements: () => view.push(new AchView(meta, () => view.closeSub())),
        endings: () => view.push(new GalleryView(gallery, () => view.closeSub())),
      },
      closeModes,
      !!desk,
    )
    modesView = view
    app.stage.addChildAt(view, app.stage.children.length - 1)
  }
  const toggleSound = () => {
    setMuted(!isMuted())
    void saveSlot('settings', { muted: isMuted() })
    return isMuted()
  }
  const pause = buildPause(
    () => setPaused(false),
    () => {
      setPaused(false)
      showTitle()
    },
    () => !!desk,
    toggleSound,
  )
  app.stage.addChildAt(pause, app.stage.children.length - 1)
  app.stage.addChildAt(toaster, app.stage.children.length - 1)

  const setScene = (s: Scene) => {
    if (scene) scene.destroy({ children: true })
    scene = s
    root.addChild(s)
    desk = s instanceof Desk ? s : null
    cursor.texture = cursors.arrow
    // Фон: за стойкой — по акту, дома — холодильник, на концовке — мотив, на карточках — тише.
    if (desk) {
      const day = desk.state.day
      setMood({ kind: 'shift', act: day >= 14 ? 2 : day >= 7 ? 1 : 0, machines: mode === 'campaign' && campaign.branch === 'machines' && day > BRANCH_DAY })
    } else if (s instanceof Home) setMood({ kind: 'home' })
    else if (s instanceof EndingScene) setMood({ kind: 'ending' })
    else setMood({ kind: 'quiet' })
  }

  /** Главное меню: продолжить, новая игра, режимы, настройки. */
  function showTitle() {
    mode = 'campaign'
    setScene(
      new TitleScene(hasSave ? campaign : null, __APP_VERSION__, {
        play: () => route(),
        fresh: () => {
          campaign = newCampaign(`ночь-${Math.floor(Math.random() * 1e9)}`)
          saveCampaign()
          route()
        },
        modes: openModes,
        toggleSound,
        fullscreen,
        quit: window.zavod ? () => window.zavod?.quit() : undefined,
      }),
    )
  }

  /** Куда идти из сохранения: на смену, домой или к финальной карточке. */
  function route() {
    mode = 'campaign'
    if (campaignOver(campaign)) {
      if (!campaign.ending) campaign = { ...campaign, phase: 'ending', ending: 'utilized' }
      if (!gallery.seen.includes(campaign.ending!)) {
        gallery = { ...gallery, seen: [...gallery.seen, campaign.ending!] }
        void saveSlot('gallery', gallery)
      }
      // Концовку в мете считаем один раз, а не при каждой загрузке.
      if (!campaign.flags.metaEnded) {
        campaign = { ...campaign, flags: { ...campaign.flags, metaEnded: true } }
        saveCampaign()
        award({ kind: 'ending', c: campaign, seen: gallery.seen })
      }
      setScene(
        new EndingScene(
          campaign,
          gallery,
          () => {
            campaign = newCampaign(`ночь-${Math.floor(Math.random() * 1e9)}`)
            saveCampaign()
            route()
          },
          openModes,
        ),
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
    saveCampaign()
    award({ kind: 'home', c: campaign })
    if (campaignOver(campaign)) return route()
    const lines = events.length ? events : ['Ночь прошла тихо. Даже холодильник молчал.']
    const act = ACT_CARDS[campaign.day]
    const turn = campaign.branch && campaign.day === BRANCH_DAY + 2 ? BRANCH_CARDS[campaign.branch] : null
    const head = act ?? turn
    const card = () => setScene(new Card(`СМЕНА ${campaign.day + 1} · ${formatDate(campaign.day)}`, lines, 'К СТОЙКЕ', startShiftScene))
    if (head) {
      setScene(new Card(head.title, head.lines, 'ДАЛЬШЕ', card))
      sfx.sting()
    } else card()
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
    saveCampaign()
    award({ kind: 'shift', mode: 'campaign', s, c: campaign })
    setScene(new Summary(s, campaign.last!, () => route(), campaign.branch))
  }

  function startDaily() {
    mode = 'daily'
    const key = dailyKey(new Date())
    const state = setupDaily(key)
    const d = new Desk(state, new ModeScript(state.day, dailyKesh(key), 'daily'), (s) => {
      const score = dailyScore(s)
      const code = dailyCode(key, s)
      award({ kind: 'shift', mode: 'daily', s })
      award({ kind: 'daily', key, score, code })
      const [, mm, dd] = key.split('-')
      setScene(new Card(MODES_TEXT.dailyTitle(`${dd}.${mm}`), MODES_TEXT.dailyLines(score, code, meta.daily[key]?.score ?? score), MODES_TEXT.toCampaign, () => route()))
    })
    d.on('cursor', (k: 'arrow' | 'inspect') => (cursor.texture = cursors[k]))
    setScene(d)
  }

  function startEndless(mods: EndlessMod[]) {
    mode = 'endless'
    const day = endlessDay(meta.bestDay)
    const seed = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const state = setupEndless(seed, day, mods)
    const kesh = (['sincere', 'provocateur', 'manipulator'] as const)[Math.floor(Math.random() * 3)]!
    const script = new ModeScript(day, kesh, 'endless', mods)
    const d = new Desk(state, script, (s) => {
      const now = new Date()
      const record = {
        score: endlessScore(script.closed, mods),
        closed: script.closed,
        mods,
        day,
        date: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`,
      }
      award({ kind: 'shift', mode: 'endless', s })
      award({ kind: 'endless', record })
      const why = script.outOfLives ? MODES_TEXT.endlessWhyLives : MODES_TEXT.endlessWhyClock
      setScene(new Card(MODES_TEXT.endlessTitle, MODES_TEXT.endlessLines(record.closed, record.score, meta.endless[0]?.score ?? record.score, why), MODES_TEXT.toCampaign, () => route()))
    })
    d.on('cursor', (k: 'arrow' | 'inspect') => (cursor.texture = cursors[k]))
    setScene(d)
  }

  function setPaused(on: boolean) {
    pause.visible = on
    if (desk) desk.paused = on
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modesView) closeModes()
      else if (!(scene instanceof TitleScene)) setPaused(!pause.visible)
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
      get meta() {
        return meta
      },
      get mode() {
        return mode
      },
      daily: () => startDaily(),
      endless: (mods: EndlessMod[] = []) => startEndless(mods),
      modes: () => openModes(),
      /** Арт для каталога лаунчера: обложка, шапка или снимок текущего экрана (PNG data URL). */
      art: async (kind: 'cover' | 'hero' | 'screen') => (await import('./art')).renderArt(app, kind, root),
      /** Открыть всё для проверки режимов. */
      unlock() {
        meta = { ...meta, bestDay: Math.max(meta.bestDay, 21), finished: Math.max(meta.finished, 1) }
        void saveSlot('meta', meta)
      },
    }
  }

  app.ticker.add((t) => {
    const dt = Math.min(100, t.deltaMS) * speed
    scene?.update(dt)
    toaster.update(Math.min(100, t.deltaMS))
    tickAmbience(Math.min(100, t.deltaMS))
  })

  showTitle()
  void window.zavod?.checkUpdate().then((u) => {
    if (u) console.info(`Вышла версия ${u.version}: ${u.url}`)
  })
  void sfx
}

function fullscreen() {
  if (window.zavod) window.zavod.toggleFullscreen()
  else if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

function buildPause(resume: () => void, toMenu: () => void, inShift: () => boolean, toggleSound: () => boolean): Container {
  const c = new Container()
  const g = new Graphics()
  c.addChild(g)
  const t = label('ПЕРЕРЫВ', 'amber', 2)
  t.position.set(240 - t.width / 2, 78)
  c.addChild(t)
  const style = { bg: 'steel', fg: 'white', edge: 'slate' } as const
  const b1 = new Button('ПРОДОЛЖИТЬ', 124, 14, style, resume)
  const b6 = new Button(MENU_TEXT.sound(isMuted()), 124, 14, style, () => b6.setCaption(MENU_TEXT.sound(toggleSound())))
  const b2 = new Button(MENU_TEXT.fullscreen, 124, 14, style, fullscreen)
  // Посреди смены выход в меню теряет её: сохранение пишется в конце смены, поэтому просим нажать дважды.
  let armed = false
  const b3: Button = new Button(MENU_TEXT.toMenu, 124, 14, style, () => {
    if (inShift() && !armed) {
      armed = true
      b3.setCaption(MENU_TEXT.toMenuSure)
      return
    }
    armed = false
    b3.setCaption(MENU_TEXT.toMenu)
    toMenu()
  })
  const list = [b1, b6, b2, b3]
  if (window.zavod) list.push(new Button(MENU_TEXT.quit, 124, 14, style, () => window.zavod?.quit()))
  const boxH = 36 + list.length * 18
  g.rect(0, 0, W, H).fill({ color: col('ink'), alpha: 0.85 })
  g.rect(165, 70, 150, boxH).fill(col('ink'))
  g.rect(166, 71, 148, boxH - 2).fill(col('night'))
  list.forEach((b, i) => {
    b.position.set(178, 100 + i * 18)
    c.addChild(b)
  })
  c.visible = false
  return c
}
