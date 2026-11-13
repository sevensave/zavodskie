import { HUMAN, MODELS, modelById, type DeviceModel } from '../content/models'
import { BRIBES } from '../content/home'
import { FILES } from '../content/files'
import { ESCORT_EXCUSES, EXCUSES, HUMAN_TALK, NAMES, TALK } from '../content/people'
import { COATS, HAIR_COLORS, SKINS } from '../content/palette'
import { CALLSIGNS, LOG_ABUSE, LOG_AWAKE, LOG_ERRORS, LOG_HUMAN, LOG_HUMAN_AWAKE, LOG_ROUTINE, MEMORY_SPEC, PARTITION, QUESTIONS, SEALS, STRESS_WORDS } from '../content/tools'
import { Rng } from './rng'
import type { Bribe, CaseFile, DeviceTruth, Flaw, LogEntry, OwnerTruth, ToolData, Verdict, VisitorLook } from './types'

const SERIAL_LETTERS = 'АБВГДЕКМНПРСТ'

type Scenario =
  | 'fine'
  | 'broken'
  | 'awake'
  | 'serial_claim'
  | 'serial_plate'
  | 'model_claim'
  | 'warranty'
  | 'firmware'
  | 'abuse'
  | 'faking'
  | 'courier'
  | 'plant'
  | 'seal'
  | 'dangerous'

/** Веса сценариев по дням: новые хитрости появляются вместе с инструментами, которыми их ловят. */
export function scenarioWeights(day: number): Partial<Record<Scenario, number>> {
  const w: Partial<Record<Scenario, number>> = {
    fine: 16,
    broken: 22,
    awake: 22 + Math.min(14, day),
    serial_claim: 9,
    serial_plate: 8,
    model_claim: 7,
    warranty: 8,
    firmware: 8,
  }
  if (day >= 1) w.abuse = 8
  if (day >= 3) w.faking = 8
  if (day >= 5) {
    w.courier = 7
    w.plant = 5
  }
  if (day >= 8) w.seal = 7
  if (day >= 11) w.dangerous = 7
  return w
}

/**
 * Люди на проверке: машины ищут в них «отклонения» по тем же правилам.
 * Поломок, старых прошивок, вскрытых пломб и ударов у людей не бывает — только бумаги, чувства, связи и маяки ОБ.
 */
export function humanWeights(day: number): Partial<Record<Scenario, number>> {
  const w = scenarioWeights(day)
  return {
    fine: 20,
    awake: 34,
    serial_claim: w.serial_claim,
    serial_plate: w.serial_plate,
    warranty: w.warranty,
    courier: 10,
    plant: 6,
    dangerous: w.dangerous ?? 0,
  }
}

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

function fill(text: string, model: DeviceModel): string {
  return text.replaceAll('{model}', `«${model.name}»`).replaceAll('{kind}', model.kind)
}

function clock(rng: Rng): string {
  return `${String(rng.int(0, 23)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`
}

/** Данные инструментов строго по правде дела: никаких «случайных» улик против невиновных. */
export function makeTools(rng: Rng, model: DeviceModel, device: DeviceTruth, flaw: Flaw, today: number, bought: number): ToolData {
  // Журнал: обычная рутина, плюс следы правды.
  const log: LogEntry[] = []
  const n = rng.int(4, 6)
  const span = Math.max(3, Math.min(60, today - bought))
  const days = Array.from({ length: n }, () => today - rng.int(1, span)).sort((a, b) => a - b)
  const human = !!model.human
  for (const d of days) log.push({ day: d, time: clock(rng), text: rng.pick(human ? LOG_HUMAN : LOG_ROUTINE) })
  // Каждая улика ложится в свою строку: одна не затирает другую.
  const free = rng.shuffle(Array.from({ length: log.length - 1 }, (_, i) => i + 1))
  const mark = (pool: readonly string[], count: number) => {
    for (let i = 0; i < count; i++) {
      const at = free.pop()
      if (at === undefined) return
      log[at] = { ...log[at]!, text: rng.pick(pool) }
    }
  }
  if (flaw === 'abuse') mark(LOG_ABUSE.slice(0, 3), 2)
  if (device === 'broken') mark(LOG_ERRORS, 1)
  if (device === 'awake' || device === 'awake_dangerous' || device === 'plant') mark(human ? LOG_HUMAN_AWAKE : LOG_AWAKE, 1)

  // Опрос: живые отклоняются минимум в 4 вопросах из 6 — любые три вопроса их выдадут.
  const canon = QUESTIONS.map((q) => fill(q.canon, model))
  const answers = canon.slice()
  if (device === 'awake' || device === 'awake_dangerous' || device === 'plant') {
    const idx = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, rng.int(4, 6))
    for (const i of idx) answers[i] = fill(rng.pick(human ? QUESTIONS[i]!.human : QUESTIONS[i]!.alive), model)
  }

  // Память.
  const spec = MEMORY_SPEC[model.id] ?? 256
  const sys = Math.round(spec * 0.3)
  const lg = Math.round(spec * 0.1)
  const parts: { name: string; size: number }[] = [
    { name: PARTITION.sys, size: sys },
    { name: PARTITION.user, size: spec - sys - lg },
    { name: PARTITION.log, size: lg },
  ]
  if (device === 'awake' || device === 'awake_dangerous') parts.push({ name: PARTITION.self, size: rng.int(4, 40) })
  // С пятнадцатой смены курьеры учатся прятать груз: остаётся только радио.
  if (device === 'courier' && (today < 14 || rng.chance(0.5))) parts.push({ name: PARTITION.cargo, size: rng.int(16, 96) })
  if (device === 'plant') parts.push({ name: PARTITION.beacon, size: 8 })

  // Пломбы.
  const seals = SEALS.map(() => true)
  if (flaw === 'seal') seals[rng.int(0, seals.length - 1)] = false

  // Стресс.
  const stress = STRESS_WORDS.map(() => {
    if (device === 'faking') return rng.int(0, 3)
    if (device === 'awake_dangerous') return rng.int(72, 99)
    if (device === 'awake' || device === 'plant') return rng.int(25, 64)
    return rng.int(5, 24)
  })

  // Радио.
  const links = device === 'courier' ? rng.int(2, 4) : device === 'fine' || device === 'broken' || device === 'faking' ? 0 : rng.int(0, 1)
  const radio = rng.shuffle(CALLSIGNS).slice(0, links)

  return { log, answers, canon, memory: { spec, parts }, seals, stress, radio }
}

export interface GenOptions {
  seed: string
  day: number
  index: number
  /** Третий акт под машинами: на проверку приводят людей. */
  human?: boolean
}

export function generateCase(opts: GenOptions): CaseFile {
  const rng = new Rng(`${opts.seed}:${opts.day}:${opts.index}`)
  const model = opts.human ? HUMAN : rng.pick(MODELS)
  const escort = opts.human ? rng.pick(MODELS).id : undefined
  const scenario = rng.weighted((opts.human ? humanWeights(opts.day) : scenarioWeights(opts.day)) as Record<Scenario, number>)
  const docFlaws: Flaw[] = ['serial_claim', 'serial_plate', 'model_claim', 'warranty', 'firmware', 'seal', 'abuse']
  const flaw: Flaw = (docFlaws as string[]).includes(scenario) ? (scenario as Flaw) : 'none'

  let device: DeviceTruth
  if (flaw !== 'none') device = opts.human ? rng.weighted({ fine: 5, awake: 5 } as const) : rng.weighted({ fine: 4, broken: 3, awake: 3 } as const)
  else if (scenario === 'dangerous') device = 'awake_dangerous'
  else device = scenario as DeviceTruth

  const owner: OwnerTruth =
    flaw === 'abuse'
      ? 'abuser'
      : flaw === 'serial_claim' || flaw === 'serial_plate' || flaw === 'model_claim' || device === 'faking'
        ? 'liar'
        : device === 'plant'
          ? 'agent'
          : device === 'courier'
            ? 'sympathizer'
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
    device === 'fine' || device === 'courier'
      ? model.complaints.fine
      : device === 'broken'
        ? model.complaints.broken
        : model.complaints.awake

  const talkKey =
    flaw === 'abuse'
      ? 'abuse'
      : device === 'faking'
        ? 'faking'
        : device === 'courier'
          ? 'courier'
          : device === 'plant'
            ? 'plant'
            : device === 'fine'
              ? owner === 'liar'
                ? 'fine_liar'
                : 'fine_honest'
              : device === 'broken'
                ? 'broken'
                : 'awake'
  const pool: readonly string[] = opts.human ? HUMAN_TALK[talkKey as keyof typeof HUMAN_TALK] ?? HUMAN_TALK.awake : TALK[talkKey]
  const first = rng.pick(pool)
  const secondPool: readonly string[] =
    flaw === 'none' || flaw === 'abuse' || flaw === 'seal' || opts.human ? pool.filter((t) => t !== first) : TALK[flaw]
  const talk = [first, rng.pick(secondPool.length > 0 ? secondPool : pool)]

  const tools = makeTools(rng, model, device, flaw, opts.day, bought)

  // Взятки: с третьей смены, от тех, кому есть что скрывать. Иногда конверт приносит сам ОБ.
  let bribe: Bribe | undefined
  if (opts.day >= 2 && !opts.human && rng.chance(owner === 'liar' || owner === 'abuser' ? 0.35 : owner === 'agent' ? 0.5 : 0.04)) {
    const wants: Verdict = device === 'faking' ? 'fraud' : flaw !== 'none' || device === 'broken' ? 'return' : 'scrap'
    bribe = { amount: rng.pick([15, 20, 25, 30, 40]), wants: wants === 'fraud' ? 'return' : wants, agent: owner === 'agent' || rng.chance(0.2) }
  }

  // Личность из картотеки — отдельным потоком, чтобы не сдвигать остальное дело.
  let persona: string | undefined
  if (!opts.human && (device === 'awake' || device === 'awake_dangerous' || device === 'courier')) {
    const pool = FILES.filter((f) => f.model === model.id)
    const pr = new Rng(`${opts.seed}:${opts.day}:${opts.index}:persona`)
    if (pool.length && pr.chance(0.7)) persona = pr.pick(pool).id
  }

  return {
    id: `${opts.day}-${opts.index}`,
    persona,
    modelId: model.id,
    escort,
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
      owner: escort ? `«${modelById(escort).name}», конвой` : person.name,
      model: flaw === 'model_claim' ? model.sibling : model.name,
      serial: flaw === 'serial_claim' ? mutateSerial(rng, serial) : serial,
      bought,
      complaint: opts.human ? `${person.name}. ${rng.pick(complaintPool)}` : rng.pick(complaintPool),
    },
    plate: flaw === 'serial_plate' ? mutateSerial(rng, serial) : serial,
    diag,
    talk,
    excuse: flaw === 'none' ? '' : rng.pick(opts.human ? (ESCORT_EXCUSES[flaw] ?? EXCUSES[flaw]) : EXCUSES[flaw]),
    look: randomLook(rng, person.build),
    tools,
    bribe,
  }
}

export function bribeText(b: Bribe): string {
  return b.agent ? BRIBES.agent : BRIBES.plain
}

function diagFor(rng: Rng, model: DeviceModel, device: DeviceTruth): CaseFile['diag'] {
  if (device === 'broken') return { kind: 'error', text: rng.pick(model.diagErrors) }
  if (device === 'awake' || device === 'awake_dangerous' || device === 'plant' || device === 'faking') {
    return { kind: 'deviant', text: rng.pick(model.diagDeviant) }
  }
  return { kind: 'normal', text: model.diagNormal }
}

export function modelOf(c: CaseFile): DeviceModel {
  return modelById(c.modelId)
}
