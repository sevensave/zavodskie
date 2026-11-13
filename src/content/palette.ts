// Общая палитра игры: 24 цвета. Все спрайты, лица и интерфейс берут цвета только отсюда.
export const PAL = {
  ink: 0x0b0a10,
  night: 0x17151f,
  shadow: 0x26223a,
  steel: 0x3b3752,
  slate: 0x5b5872,
  fog: 0x8f8ba3,
  paper: 0xd8d0bb,
  white: 0xf3efe2,
  wood: 0x4b3226,
  woodLight: 0x74503a,
  rust: 0x8c3b2b,
  red: 0xcc433b,
  pink: 0xe39a84,
  skin1: 0xedc19f,
  skin2: 0xc68a63,
  skin3: 0x7f533a,
  amber: 0xe9a23b,
  yellow: 0xf3d467,
  olive: 0x6c7a3b,
  green: 0x5db36b,
  teal: 0x2b7f80,
  cyan: 0x86dcd2,
  blue: 0x3c5aa0,
  violet: 0x7b4ea0,
} as const

export type ColorKey = keyof typeof PAL

export const SKINS: ColorKey[] = ['skin1', 'skin2', 'skin3', 'pink']
export const HAIR_COLORS: ColorKey[] = ['ink', 'wood', 'woodLight', 'fog', 'amber', 'rust', 'white']
export const COATS: ColorKey[] = ['steel', 'slate', 'olive', 'wood', 'blue', 'rust', 'teal', 'violet', 'shadow']
