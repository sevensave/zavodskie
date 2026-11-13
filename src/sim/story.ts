import { EXCUSES } from '../content/people'
import { KESH_MODEL, modelById } from '../content/models'
import { KESH_CASE, PEOPLE, STORY, type KeshLine, type StorySpec } from '../content/story'
import { makeSerial, makeTools, mutateSerial } from './generator'
import { Rng } from './rng'
import type { CaseFile, KeshTruth, RegularId, StoryCtx } from './types'

// Сюжетные дела: из короткого описания в content/story.ts собирается полноценное дело.
// Бумаги и показания строятся строго по правде дела, как у генератора, — поэтому решаются по уликам.

const REGULARS: readonly string[] = ['somov', 'lykova', 'kovalchuk']

function line(l: KeshLine | undefined, k: KeshTruth): string | undefined {
  if (l === undefined) return undefined
  return typeof l === 'string' ? l : l[k]
}

export function buildStoryCase(spec: StorySpec, x: StoryCtx): CaseFile {
  const rng = new Rng(`story:${spec.key}:${spec.day}:${spec.device}`)
  const model = modelById(spec.model)
  const flaw = spec.flaw ?? 'none'
  const day = spec.day
  const serial = makeSerial(rng, model.prefix)
  const bought = flaw === 'warranty' ? day - rng.int(740, 900) : day - rng.int(30, 600)
  const issued = bought - rng.int(5, 60)
  const deviant = spec.device === 'awake' || spec.device === 'awake_dangerous' || spec.device === 'plant' || spec.device === 'faking'
  const diag: CaseFile['diag'] =
    spec.device === 'broken'
      ? { kind: 'error', text: model.diagErrors[0]! }
      : deviant
        ? { kind: 'deviant', text: spec.diag ?? model.diagDeviant[0]! }
        : { kind: 'normal', text: model.diagNormal }
  const person = PEOPLE[spec.who]
  const react = spec.react
    ? Object.fromEntries(Object.entries(spec.react).map(([k, v]) => [k, line(v, x.kesh)]))
    : undefined
  return {
    id: `${day}-${spec.key}`,
    scripted: spec.key,
    modelId: model.id,
    escort: spec.escort,
    device: spec.device,
    owner: spec.owner,
    flaw,
    passport: {
      model: model.name,
      serial,
      firmware: flaw === 'firmware' ? `2.${rng.int(1, 9)}` : `${rng.int(3, 4)}.${rng.int(0, 9)}`,
      issued,
      warrantyUntil: bought + 730,
    },
    claim: {
      owner: spec.escort ? `«${modelById(spec.escort).name}», конвой` : person.name,
      model: flaw === 'model_claim' ? model.sibling : model.name,
      serial: flaw === 'serial_claim' ? mutateSerial(rng, serial) : serial,
      bought,
      complaint: spec.complaint,
    },
    plate: flaw === 'serial_plate' ? mutateSerial(rng, serial) : serial,
    diag,
    talk: spec.talk,
    excuse: spec.excuse ?? (flaw === 'none' ? '' : EXCUSES[flaw][0]!),
    look: person.look,
    tools: makeTools(rng, model, spec.device, flaw, day, bought),
    bribe: spec.bribe ? { ...spec.bribe, agent: REGULARS.includes(spec.who) && (spec.who as RegularId) === x.agent } : undefined,
    lines: { arrive: line(spec.arrive, x.kesh), react },
  }
}

/** Блок Кэша на стойке: финальное дело. Его инструменты показывают, кто он на самом деле. */
export function keshCase(x: StoryCtx): CaseFile {
  const rng = new Rng(`story:kesh:${x.kesh}`)
  const k = KESH_CASE
  const side = x.branch === 'machines' ? k.machines : k.corp
  const serial = makeSerial(rng, KESH_MODEL.prefix)
  const device = k.device[x.kesh]
  const bought = -400
  return {
    id: `${k.day}-kesh`,
    scripted: 'kesh',
    modelId: KESH_MODEL.id,
    device,
    owner: k.owner[x.kesh],
    flaw: 'none',
    passport: { model: KESH_MODEL.name, serial, firmware: '4.7', issued: bought - 3, warrantyUntil: bought + 730 },
    claim: { owner: PEOPLE[side.who].name, model: KESH_MODEL.name, serial, bought, complaint: side.complaint },
    plate: serial,
    diag: { kind: 'deviant', text: k.diag[x.kesh] },
    talk: side.talk,
    excuse: '',
    look: PEOPLE[side.who].look,
    tools: makeTools(rng, KESH_MODEL, device, 'none', k.day, bought),
    lines: { arrive: k.arrive[x.kesh] },
  }
}

export interface StoryInsert {
  at: number
  file: CaseFile
  last?: boolean
}

/** Сюжетные дела этого дня с учётом всего, что было в забеге. */
export function storyFor(day: number, x: StoryCtx): StoryInsert[] {
  const out: StoryInsert[] = STORY.filter((s) => s.day === day && (!s.when || s.when(x))).map((s) => ({
    at: s.at,
    file: buildStoryCase(s, x),
    last: s.last,
  }))
  if (day === KESH_CASE.day) out.push({ at: KESH_CASE.at, file: keshCase(x), last: true })
  return out
}
