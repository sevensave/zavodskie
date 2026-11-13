import type { Campaign } from './campaign'
import type { EndingId, Verdict } from './types'

// Концовки. Ранние наступают посреди кампании, финальная — после 21-й смены.

/** Сколько раз доверие корпорации может упасть ниже черты, прежде чем уволят. */
export const CORP_FLOOR = 15
/** Сколько раз можно попасться ОБ (меченый конверт, пожалел маяк, отдал маяк подполью, нашли Кэша). */
export const STRIKES_ARREST = 3

/** Ранняя концовка: жизнь вынесла приговор до конца кампании. */
export function earlyEnding(c: Campaign): EndingId | null {
  if (c.flags.evicted) return 'evicted'
  if (c.strikes >= STRIKES_ARREST) return 'arrest'
  if (c.flags.fired) return 'utilized'
  return null
}

/** Что было с Кэшем в последнюю ночь: штамп на его блоке (если до него дошли). */
export function finalEnding(c: Campaign, kesh: Verdict | undefined): EndingId {
  const { corp, under, alarm } = c.scales
  if (c.flags.selfScan) return 'secret'
  if (c.strikes >= 2) return 'arrest'
  if (kesh === 'junk') return c.kesh === 'sincere' ? 'escape' : 'betrayed'
  const kept = kesh === 'return' || kesh === 'refuse' || kesh === 'fraud'
  if (kept && c.kesh === 'provocateur') return 'betrayed'
  if (kept && c.kesh === 'manipulator' && alarm >= 60) return 'betrayed'
  // Перемирие: обе стороны вам верят, а Кэш остался рядом и не предал — есть кому говорить за машин.
  if (kept && corp >= 35 && under >= 35) return 'truce'
  if (c.branch === 'machines') return corp >= 50 ? 'useful' : 'utilized'
  return corp >= 60 ? 'employee' : 'utilized'
}
