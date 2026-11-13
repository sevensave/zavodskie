import cyrillic from '../renderer/src/fonts/tiny5-cyrillic-400-normal.woff2?inline'
import latin from '../renderer/src/fonts/tiny5-latin-400-normal.woff2?inline'

// Шрифт встроен в бандл и ставится из памяти: ссылка из CSS в собранной игре (file://) могла
// не подхватиться, и тогда вместо Tiny5 рисовался системный шрифт в 8 пикселей — каша.

function bytes(dataUrl: string): ArrayBuffer {
  const raw = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out.buffer
}

const RANGES: [string, string][] = [
  [latin, 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
  [cyrillic, 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'],
]

let ready: Promise<void> | null = null

export function installFont(): Promise<void> {
  ready ??= (async () => {
    for (const [src, unicodeRange] of RANGES) {
      const face = new FontFace('Tiny5', bytes(src), { unicodeRange })
      await face.load()
      document.fonts.add(face)
    }
    await document.fonts.ready
    if (!document.fonts.check('8px Tiny5', 'Жж')) console.warn('Шрифт Tiny5 не загрузился')
  })()
  return ready
}
