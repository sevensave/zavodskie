/** Детерминированный генератор (mulberry32). Одинаковый сид — одинаковая ночь. */
export class Rng {
  private s: number

  constructor(seed: number | string) {
    this.s = typeof seed === 'number' ? seed >>> 0 : hashString(seed)
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Целое от a до b включительно. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick из пустого списка')
    return arr[Math.floor(this.next() * arr.length)] as T
  }

  /** Выбор по весам: { ключ: вес }. */
  weighted<K extends string>(weights: Readonly<Record<K, number>>): K {
    const entries = Object.entries(weights) as [K, number][]
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let r = this.next() * total
    for (const [k, w] of entries) {
      r -= w
      if (r < 0) return k
    }
    return entries[entries.length - 1]![0]
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }

  /** Отдельный поток для подзадачи: не сбивает основной. */
  fork(tag: string): Rng {
    return new Rng((hashString(tag) ^ Math.floor(this.next() * 4294967296)) >>> 0)
  }
}

export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
