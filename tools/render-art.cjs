// Арт для каталога SevenSave из самой игры: обложка, шапка, иконка и снимки экрана.
// Нужен запущенный `npm run web` (адрес — первым аргументом, по умолчанию http://localhost:5299).
// Запуск: npx electron tools/render-art.cjs [адрес] [папка]
// Картинки ложатся PNG в папку (по умолчанию art/); в JPEG их переводит sips при выкладке в каталог.
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const url = process.argv[2] || 'http://localhost:5299'
const outDir = resolve(process.argv[3] || 'art')

// Что снять: подготовка экрана в странице, потом снимок корня сцены (480×270 ×3).
const SHOTS = [
  // Первая смена: робот просит не стирать, Кэш ведёт сверку.
  { name: 'shot-shift1', prep: `__zavod.jump(0); await __play(0, { diag: true, ask: true })` },
  // Второй акт: все бумаги на столе, сканер памяти.
  { name: 'shot-act2', prep: `__zavod.jump(9); await __play(0, { diag: true, tab: 4, scan: true })` },
  // Третий акт под машинами: к окну привели человека.
  { name: 'shot-act3', prep: `__zavod.jump(17, 'machines'); await __play(0, { diag: true, ask: true, tab: 3 })` },
  // Утро дома: газета и счета.
  { name: 'shot-home', prep: `__zavod.jump(4); await __finishShift(); await __step(40); __zavod.scene.children.find((c) => c.constructor.name === 'Button')?.emit('pointertap'); await __step(30)` },
]

const HELPERS = `
window.__step = async (n) => { for (let i = 0; i < n; i++) { __zavod.scene.update(100); await new Promise((r) => setTimeout(r, 1)) } }
window.__waitCase = async () => { for (let i = 0; i < 600; i++) { if (__zavod.desk && __zavod.desk.hasCase()) return; await __step(1) } }
window.__play = async (skip, o) => {
  const R = await import('/@fs${resolve(__dirname, '../src/sim/rules.ts')}')
  const S = await import('/@fs${resolve(__dirname, '../src/sim/shift.ts')}')
  for (let k = 0; k < skip; k++) {
    await __waitCase()
    const s = __zavod.desk.state
    const p = __zavod.desk.stamp(R.instructed(S.currentCase(s), s.day).verdict)
    await __step(120); await p
  }
  await __waitCase()
  await __step(30)
  const d = __zavod.desk
  if (o.tab) { d.onKey(String(o.tab)); await __step(3) }
  if (o.scan) { const f = d.children[0].children.find((c) => c.constructor.name === 'Folder'); await __step(1); f && f.scan && f.scan(); await __step(40) }
  if (o.ask) { d.ask(); await __step(25) }
  if (o.diag) { d.diag(); await __step(40) }
}
window.__finishShift = async () => {
  const R = await import('/@fs${resolve(__dirname, '../src/sim/rules.ts')}')
  const S = await import('/@fs${resolve(__dirname, '../src/sim/shift.ts')}')
  for (let k = 0; k < 20; k++) {
    await __waitCase()
    if (!__zavod.desk || !__zavod.desk.hasCase()) break
    const s = __zavod.desk.state
    const p = __zavod.desk.stamp(R.instructed(S.currentCase(s), s.day).verdict)
    await __step(120); await p
  }
  for (let i = 0; i < 200 && __zavod.scene.constructor.name !== 'Summary'; i++) await __step(1)
}
0
`

app.whenReady().then(async () => {
  mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({ width: 960, height: 540, show: false, webPreferences: { backgroundThrottling: false } })
  const save = (name, dataUrl) => {
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'))
    console.log(`${name}.png`)
  }
  const load = async () => {
    await win.loadURL(url)
    await win.webContents.executeJavaScript(`new Promise((r) => { const t = setInterval(() => { if (window.__zavod && __zavod.scene) { clearInterval(t); r() } }, 100) })`)
    await win.webContents.executeJavaScript(HELPERS)
  }
  try {
    await load()
    save('cover', await win.webContents.executeJavaScript(`__zavod.art('cover')`))
    save('hero', await win.webContents.executeJavaScript(`__zavod.art('hero')`))
    for (const s of SHOTS) {
      await load()
      await win.webContents.executeJavaScript(`(async () => { ${s.prep} })()`)
      save(s.name, await win.webContents.executeJavaScript(`__zavod.art('screen')`))
    }
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  }
  app.quit()
})
