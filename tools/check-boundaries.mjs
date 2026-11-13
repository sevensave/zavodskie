// Границы слоёв: src/sim и src/content не знают про Pixi, DOM и src/ui.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../src/', import.meta.url).pathname
const rules = [
  { dir: 'sim', banned: [/from 'pixi\.js'/, /from '\.\.\/ui\//, /\bdocument\./, /\bwindow\./] },
  { dir: 'content', banned: [/from 'pixi\.js'/, /from '\.\.\/ui\//, /\bdocument\./, /\bwindow\./] },
]
let bad = 0
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
for (const r of rules) {
  for (const file of walk(join(root, r.dir))) {
    const text = readFileSync(file, 'utf8')
    for (const re of r.banned) {
      if (re.test(text)) {
        console.error(`${file.replace(root, 'src/')}: нельзя ${re}`)
        bad++
      }
    }
  }
}
if (bad) process.exit(1)
console.log('границы слоёв в порядке')
