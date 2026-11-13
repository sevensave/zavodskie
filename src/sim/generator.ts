import { MODELS, modelById, type DeviceModel } from '../content/models'
import { EXCUSES, NAMES, TALK } from '../content/people'
import { COATS, HAIR_COLORS, SKINS } from '../content/palette'
import { Rng } from './rng'
import type { CaseFile, DeviceTruth, Flaw, OwnerTruth, VisitorLook } from './types'

const SERIAL_LETTERS = 'АБВГДЕКМНПРСТ'

/** Сценарии первых смен и их веса. Один изъян на дело, чтобы правила читались. */
const SCENARIOS = {
  fine: 16,
  broken: 22,
  awake: 22,
  serial_claim: 9,
  serial_plate: 8,
  model_claim: 7,
  warranty: 8,
  firmware: 8,
} as const

type Scenario = keyof typeof SCENARIOS

export function makeSerial(rng: Rng, prefix: string): string {
  const digits = String(rng.int(1000, 9999))
  return `${prefix}-${digits}-${rng.pick([...SERIAL_LETTERS])}`
}

/** Номер, похожий на исходный: переставлены соседние цифры или одна заменена. */
export function mutateSerial(rng: Rng, serial: string): string {
  const [prefix, digits, letter] = serial.split('-') as [string, string, string]
  const d = [...digits]
  for (let tries = 0; tries < 10; tries++) {
    const i = rng.int(0, 2)
    if (d[i] !== d[i + 1] && !(i === 0 && d[1] === '0')) {
      ;[d[i], d[i + 1]] = [d[i + 1]!, d[i]!]
      return `${prefix}-${d.join('')}-${letter}`
    }
  }
  const i = rng.int(0, 3)
  d[i] = String((Number(d[i]) + rng.int(1, 8)) % 10)
  if (i === 0 && d[0] === '0') d[0] = '1'
  return `${prefix}-${d.join('')}-${letter}`
}

export function randomLook(rng: Rng, build: 0 | 1): VisitorLook {
  return {
    skin: rng.int(0, SKINS.length - 1),
    hair: rng.int(0, 5),
    hairColor: rng.int(0, HAIR_COLORS.length - 1),
    eyes: rng.int(0, 3),
    brows: rng.int(0, 2),
    nose: rng.int(0, 2),
    mouth: rng.int(0, 3),
    extra: rng.chance(0.45) ? rng.int(1, 5) : 0,
    coat: rng.int(0, COATS.length - 1),
    collar: rng.int(0, 2),
    build,
  }
}

function firmware(rng: Rng, old: boolean): string {
  return old ? `2.${rng.int(1, 9)}` : `${rng.int(3, 4)}.${rng.int(0, 9)}`
}

export interface GenOptions {
  seed: string
  day: number
  index: number
}

export function generateCase(opts: GenOptions): CaseFile {
  const rng = new Rng(`${opts.seed}:${opts.day}:${opts.index}`)
  const model = rng.pick(MODELS)
  const scenario = rng.weighted(SCENARIOS) as Scenario
  const flaw: Flaw = scenario === 'fine' || scenario === 'broken' || scenario === 'awake' ? 'none' : scenario

  // Под изъяном в бумагах может прятаться что угодно: инструкция до диагностики не дойдёт, а совесть — дойдёт.
  const device: DeviceTruth =
    flaw === 'none' ? (scenario as DeviceTruth) : rng.weighted({ fine: 4, broken: 3, awake: 3 } as const)
  const owner: OwnerTruth =
    flaw === 'serial_claim' || flaw === 'serial_plate' || flaw === 'model_claim'
      ? 'liar'
      : device === 'fine' && rng.chance(0.6)
        ? 'liar'
        : 'honest'

  const person = rng.pick(NAMES)
  const serial = makeSerial(rng, model.prefix)
  const expired = flaw === 'warranty'
  const bought = expired ? opts.day - rng.int(740, 1100) : opts.day - rng.int(20, 700)
  const issued = bought - rng.int(5, 60)

  const diag = diagFor(rng, model, device)
  const complaintPool =
    device === 'fine' ? model.complaints.fine : device === 'broken' ? model.complaints.broken : model.complaints.awake

  const talkKey = device === 'fine' ? (owner === 'liar' ? 'fine_liar' : 'fine_honest') : device === 'broken' ? 'broken' : 'awake'
  const first = rng.pick(TALK[talkKey])
  const secondPool = flaw === 'none' ? TALK[talkKey].filter((t) => t !== first) : TALK[flaw]
  const talk = [first, rng.pick(secondPool.length > 0 ? secondPool : TALK[talkKey])]

  return {
    id: `${opts.day}-${opts.index}`,
    modelId: model.id,
    device,
    owner,
    flaw,
    passport: {
      model: model.name,
      serial,
      firmware: firmware(rng, flaw === 'firmware'),
      issued,
      warrantyUntil: bought + 730,
    },
    claim: {
      owner: person.name,
      model: flaw === 'model_claim' ? model.sibling : model.name,
      serial: flaw === 'serial_claim' ? mutateSerial(rng, serial) : serial,
      bought,
      complaint: rng.pick(complaintPool),
    },
    plate: flaw === 'serial_plate' ? mutateSerial(rng, serial) : serial,
    diag,
    talk,
    excuse: flaw === 'none' ? '' : rng.pick(EXCUSES[flaw]),
    look: randomLook(rng, person.build),
  }
}

function diagFor(rng: Rng, model: DeviceModel, device: DeviceTruth): CaseFile['diag'] {
  if (device === 'broken') return { kind: 'error', text: rng.pick(model.diagErrors) }
  if (device === 'awake') return { kind: 'deviant', text: rng.pick(model.diagDeviant) }
  return { kind: 'normal', text: model.diagNormal }
}

export function modelOf(c: CaseFile): DeviceModel {
  return modelById(c.modelId)
}
