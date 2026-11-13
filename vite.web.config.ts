// Та же игра в обычном браузере: для быстрой проверки без Electron. Сохранения — в localStorage.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __DEV__: 'true' },
  server: { port: 5299, strictPort: true },
})
