import { modelById } from '../content/models'
import { METLA, TIMOSHA } from '../content/shift1'
import { makeTools } from './generator'
import { Rng } from './rng'
import type { CaseFile } from './types'

/** Ручное дело получает показания инструментов по своей правде, всегда одинаковые. */
export function scripted(base: Omit<CaseFile, 'tools'>, day: number): CaseFile {
  const rng = new Rng(`scripted:${base.id}`)
  return { ...base, tools: makeTools(rng, modelById(base.modelId), base.device, base.flaw, day, base.claim.bought) }
}

export function shift1Scripted(): CaseFile[] {
  return [scripted(TIMOSHA, 0), scripted(METLA, 0)]
}
