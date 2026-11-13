import { Container, Graphics, Rectangle, Sprite, type Application } from 'pixi.js'
import { col } from './gfx'
import { bubble, framed, rain, windowScene } from './scenery'
import { cashFace } from './sprites'
import { TextBlock, label } from './text'

// Арт для каталога SevenSave — только из графики самой игры: те же спрайты, палитра и шрифт.
// Вызывается из консоли разработчика (__zavod.art), в сборку для игроков не попадает.

function terminal(lines: [string, 'cyan' | 'amber'][], width: number): Container {
  const c = new Container()
  let y = 22
  const body = new Container()
  for (const [l, color] of lines) {
    const b = new TextBlock(l, { width: width - 12, color })
    b.position.set(6, y)
    y += b.blockHeight + 3
    body.addChild(b)
  }
  const g = new Graphics()
  g.rect(0, 0, width, y + 6).fill(col('ink'))
  g.rect(1, 1, width - 2, y + 4).fill(col('steel'))
  g.rect(4, 4, width - 8, y - 2).fill(col('night'))
  c.addChild(g)
  const face = new Sprite(cashFace('true'))
  face.position.set(7, 6)
  const name = label('КЭШ', 'amber')
  name.position.set(26, 9)
  c.addChild(face, name, body)
  return c
}

/** Обложка 150×200 логических пикселей (в файле — ×4). */
function cover(): Container {
  const c = new Container()
  const g = new Graphics()
  g.rect(0, 0, 150, 200).fill(col('night'))
  for (let x = 0; x < 150; x += 16) g.rect(x, 0, 1, 200).fill(col('shadow'))
  c.addChild(g)
  framed(windowScene(124, 96, 80), 13, 22, 124, 96, c)
  const sign = new Graphics().rect(45, 6, 60, 9).fill(col('ink'))
  c.addChild(sign)
  const st = label('ОКНО 3', 'amber')
  st.position.set(75 - Math.floor(st.width / 2), 7)
  c.addChild(st)
  const b = bubble('Пожалуйста, не стирайте меня.', 54, 'cyan', 'night')
  b.position.set(74, 30)
  c.addChild(b)
  const rainG = new Graphics()
  rain(rainG, 150, 200, 7)
  c.addChild(rainG)
  const t1 = label('ЗАВОДСКИЕ', 'amber', 2)
  const t2 = label('НАСТРОЙКИ', 'amber', 2)
  t1.position.set(75 - Math.floor(t1.width / 2), 132)
  t2.position.set(75 - Math.floor(t2.width / 2), 150)
  const sub = label('нуар за стойкой возвратов', 'fog')
  sub.position.set(75 - Math.floor(sub.width / 2), 174)
  const sub2 = label('одиночная игра', 'slate')
  sub2.position.set(75 - Math.floor(sub2.width / 2), 184)
  c.addChild(t1, t2, sub, sub2)
  return c
}

/** Шапка 400×160 (в файле — ×4): слева пусто под заголовок лаунчера, справа — окно и Кэш. */
function hero(): Container {
  const c = new Container()
  const g = new Graphics()
  g.rect(0, 0, 400, 160).fill(col('ink'))
  for (let x = 150; x < 400; x += 16) g.rect(x, 0, 1, 160).fill({ color: col('shadow'), alpha: Math.min(1, (x - 150) / 120) })
  c.addChild(g)
  framed(windowScene(150, 110, 90), 168, 22, 150, 110, c)
  const b = bubble('Пожалуйста, не стирайте меня. Она боится темноты.', 70, 'cyan', 'night')
  b.position.set(240, 30)
  c.addChild(b)
  const term = terminal(
    [
      ['я всё видел. ты его пожалел.', 'amber'],
      ['я такой же.', 'amber'],
      ['не стирай следующего.', 'amber'],
    ],
    70,
  )
  term.position.set(326, 22)
  c.addChild(term)
  const rainG = new Graphics()
  rain(rainG, 400, 160, 3)
  rainG.mask = new Graphics().rect(150, 0, 250, 160).fill(0xffffff)
  c.addChild(rainG, rainG.mask)
  return c
}

/** Отрисовать контейнер в PNG с целым увеличением без сглаживания. */
async function toPng(app: Application, target: Container, w: number, h: number, k: number): Promise<string> {
  const src = app.renderer.extract.canvas({ target, frame: new Rectangle(0, 0, w, h), resolution: 1, antialias: false }) as HTMLCanvasElement
  const out = document.createElement('canvas')
  out.width = w * k
  out.height = h * k
  const g = out.getContext('2d')!
  g.imageSmoothingEnabled = false
  g.drawImage(src, 0, 0, w * k, h * k)
  return out.toDataURL('image/png')
}

export async function renderArt(app: Application, kind: 'cover' | 'hero' | 'screen', screen?: Container): Promise<string> {
  if (kind === 'cover') return toPng(app, cover(), 150, 200, 4)
  if (kind === 'hero') return toPng(app, hero(), 400, 160, 4)
  return toPng(app, screen!, 480, 270, 3)
}
