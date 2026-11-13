// Рисует иконку приложения (build/icon.png, 512×512) из пиксельной карты 32×32: терминал с лицом Кэша.
// Без зависимостей: PNG собирается вручную через zlib.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const P = { '.': null, k: 0x0b0a10, n: 0x17151f, s: 0x3b3752, l: 0x5b5872, a: 0xe9a23b, y: 0xf3d467, r: 0xcc433b, t: 0x2b7f80 }
const map = [
  '................................',
  '................................',
  '...kkkkkkkkkkkkkkkkkkkkkkkkkk...',
  '...kllllllllllllllllllllllllk...',
  '...klkkkkkkkkkkkkkkkkkkkkkksk...',
  '...klknnnnnnnnnnnnnnnnnnnnksk...',
  '...klknnnnnnnnnnnnnnnnnnnnksk...',
  '...klknnnaaaaaaaaaaaaaannnksk...',
  '...klknnnannnnnnnnnnnnannnksk...',
  '...klknnnannnnnnnnnnnnannnksk...',
  '...klknnnannnnnnnnyyynannnksk...',
  '...klknnnannaaannnyyynannnksk...',
  '...klknnnannnnnnnnyyynannnksk...',
  '...klknnnannnnnnnnnnnnannnksk...',
  '...klknnnannnnnnnnnnnnannnksk...',
  '...klknnnannaaaaaaaannannnksk...',
  '...klknnnannnnnnnnnnnnannnksk...',
  '...klknnnaaaaaaaaaaaaaannnksk...',
  '...klknnnnnnnnnnnnnnnnnnnnksk...',
  '...klknnnnnnnnnnnnnnnnnnnnksk...',
  '...klkkkkkkkkkkkkkkkkkkkkkksk...',
  '...klllllllllllllllllllllllsk...',
  '...klsssssssssssssssssssssssk...',
  '...klsskkkkkkkkkkkkkkkksssrsk...',
  '...klsssssssssssssssssssssssk...',
  '...kkkkkkkkkkkkkkkkkkkkkkkkkk...',
  '..........kssssssssk............',
  '........kkkkkkkkkkkkkk..........',
  '........kttttttttttttk..........',
  '........kkkkkkkkkkkkkk..........',
  '................................',
  '................................',
]
const N = 32
const S = 16
const W = N * S
const raw = Buffer.alloc((W * 4 + 1) * W)
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0
  for (let x = 0; x < W; x++) {
    const ch = map[Math.floor(y / S)][Math.floor(x / S)]
    const c = P[ch]
    const o = y * (W * 4 + 1) + 1 + x * 4
    if (c === null || c === undefined) continue
    raw[o] = (c >> 16) & 255
    raw[o + 1] = (c >> 8) & 255
    raw[o + 2] = c & 255
    raw[o + 3] = 255
  }
}
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc = (buf) => {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(W, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(new URL('../build/icon.png', import.meta.url), png)
console.log('build/icon.png', png.length, 'байт')
