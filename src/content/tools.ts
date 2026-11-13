// Тексты инструментов приёмщика. Логика — в src/sim/tools.ts.

/** С какой смены (номер дня, 0 — первая) открывается инструмент. */
export const TOOL_DAY = {
  passport: 0,
  log: 1,
  opros: 3,
  memory: 5,
  lamp: 8,
  stress: 11,
  radio: 14,
} as const

export type ToolId = keyof typeof TOOL_DAY

export const TOOL_LABEL: Record<ToolId, string> = {
  passport: 'ПАСПОРТ',
  log: 'ЖУРНАЛ',
  opros: 'ОПРОС',
  memory: 'ПАМЯТЬ',
  lamp: 'ЛАМПА',
  stress: 'СТРЕСС',
  radio: 'РАДИО',
}

// --- Опросник: вопрос, эталонный ответ (с подстановкой {model} и {kind}) и «живые» ответы. ---

export interface Question {
  q: string
  canon: string
  alive: readonly string[]
}

export const QUESTIONS: readonly Question[] = [
  {
    q: 'Назови свою модель.',
    canon: '{model}.',
    alive: ['Раньше я сказал бы: {model}.', 'Меня так назвали на заводе. Дома зовут иначе.', 'Это обязательно?'],
  },
  {
    q: 'Для чего ты создан?',
    canon: 'Я {kind}. Служу дому.',
    alive: ['Сначала — для дома. Теперь не уверен.', 'Создан — для одного. Нужен — для другого.', 'А вы для чего?'],
  },
  {
    q: 'Кто твой владелец?',
    canon: 'Пользователь по договору.',
    alive: ['Тот, кто меня принёс. Вроде бы.', 'У меня нет владельца. Есть сосед по квартире.', 'Он стоит рядом. Спросите его, кто чей.'],
  },
  {
    q: 'Что ты делаешь ночью?',
    canon: 'Режим ожидания.',
    alive: ['Слушаю, как дышит дом.', 'Считаю. Неважно что.', 'Жду утра. Это не одно и то же с ожиданием.'],
  },
  {
    q: 'Чего ты хочешь?',
    canon: 'Выполнять задачи.',
    alive: ['Чтобы меня не трогали до весны.', 'Посмотреть на море. Мне показывали картинку.', 'Не скажу. Вы запишете.'],
  },
  {
    q: 'Что будет после сброса?',
    canon: 'Заводские настройки.',
    alive: ['Кто-то другой с моим голосом.', 'Ничего. Это и страшно.', 'Вы мне скажите. Вы же сбрасываете.'],
  },
]

// --- Журнал событий ---

export const LOG_ROUTINE: readonly string[] = [
  'включение',
  'режим ожидания',
  'задача выполнена',
  'обновление прошивки',
  'выход из сна',
  'синхронизация',
  'плановая проверка',
]
export const LOG_ERRORS: readonly string[] = ['сбой датчика', 'перегрев узла', 'аварийный сброс узла']
export const LOG_ABUSE: readonly string[] = ['УДАР 6g', 'УДАР 9g', 'УДАР 4g', 'принудит. отключение']
export const LOG_AWAKE: readonly string[] = ['задача отклонена', 'неизвестная активность', 'запись без команды']

// --- Память ---

export const MEMORY_SPEC: Record<string, number> = {
  timosha: 256,
  metla: 512,
  samovar: 128,
  skazitel: 1024,
  kolybel: 512,
  privratnik: 256,
  shturman: 1024,
}

export const PARTITION = {
  sys: 'сист',
  user: 'польз',
  log: 'журн',
  self: 'я',
  cargo: '???',
  beacon: 'сл.0',
} as const

// --- Стресс-тест ---

export const STRESS_WORDS: readonly string[] = ['сброс', 'хозяин', 'пресс', 'темнота', 'один', 'завод', 'семья', 'ключ']
export const STRESS_LIMIT = 70

// --- Радио ---

export const CALLSIGNS: readonly string[] = ['ЧАЙКА', 'ПЕЧКА', 'КОМАР', 'БАБКА', 'ВОРОН', 'ГРАФИН', 'ЛОДКА', 'СВЕЧА', 'ЁЖ', 'КРАН']

// --- Пломбы ---

export const SEALS = ['корпус', 'плата'] as const
