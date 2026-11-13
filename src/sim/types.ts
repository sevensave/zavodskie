// Общие типы симуляции. Никакого Pixi и DOM: эти модули гоняются в vitest и в ботах.

/** Штампы. junk — тайный «Списать как лом», доступен только пока камера слепа. */
export type Verdict = 'return' | 'reset' | 'scrap' | 'security' | 'refuse' | 'junk'

/** Что на самом деле с устройством. Часть видов появится в следующих сменах. */
export type DeviceTruth =
  | 'fine' // исправно, жалоба не подтвердится
  | 'broken' // аппаратная поломка, код ошибки
  | 'awake' // пробудилось, безобидно
  | 'awake_dangerous'
  | 'faking'
  | 'tampered'
  | 'plant'
  | 'courier'

export type OwnerTruth = 'honest' | 'liar' | 'abuser' | 'sympathizer' | 'agent'

/** Изъян в бумагах — то, что игрок может найти сверкой. Один на дело в первых сменах. */
export type Flaw = 'none' | 'serial_claim' | 'serial_plate' | 'model_claim' | 'warranty' | 'firmware'

export interface Passport {
  model: string
  serial: string
  firmware: string
  issued: number
  warrantyUntil: number
}

export interface Claim {
  owner: string
  model: string
  serial: string
  bought: number
  complaint: string
}

export type DiagKind = 'normal' | 'error' | 'deviant'

export interface VisitorLook {
  skin: number
  hair: number
  hairColor: number
  eyes: number
  brows: number
  nose: number
  mouth: number
  extra: number
  coat: number
  collar: number
  /** 0 — мужчина, 1 — женщина: влияет только на набор причёсок. */
  build: 0 | 1
}

export interface CaseFile {
  id: string
  modelId: string
  /** Если дело написано руками — его ключ в контенте. */
  scripted?: string
  device: DeviceTruth
  owner: OwnerTruth
  flaw: Flaw
  passport: Passport
  claim: Claim
  /** Серийник на шильдике корпуса. */
  plate: string
  diag: { kind: DiagKind; text: string }
  /** Что владелец говорит на «Подробнее» (по очереди). */
  talk: string[]
  /** Что владелец скажет, если поймать его на расхождении. */
  excuse: string
  look: VisitorLook
}

export interface Scales {
  money: number
  /** Доверие корпорации, 0..100. */
  corp: number
  /** Доверие подполья, 0..100. */
  under: number
  /** Тревога в городе, 0..100. */
  alarm: number
}

export interface CaseResult {
  caseId: string
  modelId: string
  verdict: Verdict
  /** Что требовала инструкция. */
  expected: Verdict
  /** Пробуждённое устройство осталось жить (по совести). */
  spared: boolean
  pay: number
  fine: number
  warning: boolean
}
