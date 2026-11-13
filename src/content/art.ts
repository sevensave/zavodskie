import type { ColorKey } from './palette'

// Описание пиксельных спрайтов данными. Рисует их src/ui/sprites.ts.
export type ArtPart =
  | { k: 'rect'; x: number; y: number; w: number; h: number; c: ColorKey; shade?: boolean }
  | { k: 'oval'; x: number; y: number; w: number; h: number; c: ColorKey; shade?: boolean }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; c: ColorKey }
  | { k: 'dots'; pts: readonly (readonly [number, number])[]; c: ColorKey }

/** Глаза рисуются поверх спрайта отдельно: они моргают, гаснут и пустеют после сброса. */
export interface EyeSpec {
  x: number
  y: number
  gap: number
  w: number
  h: number
  c: ColorKey
}

export interface DeviceArt {
  w: number
  h: number
  parts: readonly ArtPart[]
  eyes: EyeSpec
}
