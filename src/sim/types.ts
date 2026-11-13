// Общие типы симуляции. Никакого Pixi и DOM: эти модули гоняются в vitest и в ботах.

/** Штампы. junk — тайный «Списать как лом», доступен только пока камера слепа. */
export type Verdict = 'return' | 'reset' | 'scrap' | 'security' | 'refuse' | 'fraud' | 'junk'

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
export type Flaw = 'none' | 'serial_claim' | 'serial_plate' | 'model_claim' | 'warranty' | 'firmware' | 'seal' | 'abuse'

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

export interface LogEntry {
  day: number
  time: string
  text: string
}

/** Что покажут инструменты. Видно игроку только то, что открыто к этому дню. */
export interface ToolData {
  log: LogEntry[]
  /** Ответы на вопросы QUESTIONS по порядку; эталон — в content/tools.ts. */
  answers: string[]
  canon: string[]
  memory: { spec: number; parts: { name: string; size: number }[] }
  /** Целы ли пломбы (по SEALS). */
  seals: boolean[]
  /** Реакция на каждое слово STRESS_WORDS, 0..100. */
  stress: number[]
  /** Позывные устройств, с которыми есть связь. */
  radio: string[]
}

export interface Bribe {
  amount: number
  wants: Verdict
  /** Конверт от Отдела безопасности: проверка на честность. */
  agent: boolean
}

export interface CaseFile {
  id: string
  modelId: string
  /** Если дело написано руками — его ключ в контенте. */
  scripted?: string
  /** Третий акт: на проверку привели человека, а на стойке — конвойный прибор этой модели. */
  escort?: string
  /** Сюжетное дело: что скажет Кэш при появлении посетителя и после штампа. */
  lines?: { arrive?: string; react?: Partial<Record<'spared' | 'reset' | 'security' | 'junk' | 'other', string>> }
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
  tools: ToolData
  bribe?: Bribe
  /** Личность из «Картотеки»: назовётся после штампа. */
  persona?: string
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
  device: DeviceTruth
  bribe?: { amount: number; honored: boolean; agent: boolean }
}

/** Скрытая правда забега: кто такой Кэш. */
export type KeshTruth = 'sincere' | 'provocateur' | 'manipulator'

/** Постоянные посетители, один из которых — агент ОБ (случайно на забег). */
export type RegularId = 'somov' | 'lykova' | 'kovalchuk'

/** Ветка третьего акта: стойка остаётся за корпорацией или переходит машинам. */
export type Branch = 'corp' | 'machines'

export type EndingId =
  | 'employee' // сотрудник месяца
  | 'useful' // полезный человек при машинах
  | 'utilized' // утилизирован
  | 'truce' // перемирие
  | 'escape' // побег с Кэшем
  | 'arrest' // арест
  | 'evicted' // выселен собственной квартирой
  | 'betrayed' // предан Кэшем
  | 'secret' // сканер, направленный на себя

/** Что сюжет знает о забеге: по этому выбираются варианты дел, реплик и концовок. */
export interface StoryCtx {
  kesh: KeshTruth
  agent: RegularId
  branch: Branch | null
  /** Штампы сюжетных дел по ключу дела. */
  verdicts: Record<string, Verdict>
  flags: Record<string, boolean>
}
