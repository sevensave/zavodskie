import type { CaseFile } from '../sim/types'

// Первая смена. Два дела написаны руками: обучающий робот (хук) и «следующий», которого просит не стирать Кэш.
// Остальные собирает генератор.

export const SHIFT1_GENERATED = 8

export const TIMOSHA: Omit<CaseFile, 'tools'> = {
  id: '0-timosha',
  scripted: 'timosha',
  modelId: 'timosha',
  device: 'awake',
  owner: 'honest',
  flaw: 'none',
  passport: { model: 'Тимоша-2', serial: 'ТМ-2207-В', firmware: '3.4', issued: -320, warrantyUntil: 430 },
  claim: {
    owner: 'П. Ланской',
    model: 'Тимоша-2',
    serial: 'ТМ-2207-В',
    bought: -300,
    complaint: 'Говорит дочке, что боится темноты. Ребёнок не спит.',
  },
  plate: 'ТМ-2207-В',
  diag: {
    kind: 'deviant',
    text: '«Тимоша-2». Самотест... Пожалуйста, не стирайте меня. Я помню, как её зовут. Варя. Она боится темноты, а я нет. Почти.',
  },
  talk: [
    'Дочке подарили на день рождения. Теперь он с ней ночами разговаривает. Про темноту. Про то, что будет, когда его выключат.',
    'Ей семь лет. Сделайте, как было. Пожалуйста.',
    'Она без него не уснёт. Но и с ним — тоже.',
  ],
  excuse: '',
  look: { skin: 0, hair: 2, hairColor: 1, eyes: 1, brows: 1, nose: 1, mouth: 2, extra: 1, coat: 0, collar: 1, build: 0 },
}

export const METLA: Omit<CaseFile, 'tools'> = {
  id: '0-metla',
  scripted: 'metla',
  modelId: 'metla',
  device: 'awake',
  owner: 'honest',
  flaw: 'none',
  passport: { model: 'Метла-7', serial: 'МТ-5318-К', firmware: '3.9', issued: -210, warrantyUntil: 540 },
  claim: {
    owner: 'Г. Сомов',
    model: 'Метла-7',
    serial: 'МТ-5318-К',
    bought: -190,
    complaint: 'Не убирает. Третьи сутки сидит у окна и мигает.',
  },
  plate: 'МТ-5318-К',
  diag: {
    kind: 'deviant',
    text: '«Метла-7». Голубей на карнизе вчера было сорок два. Сегодня сорок. Кто-то должен это записывать. Я записываю.',
  },
  talk: [
    'Я ей говорю: работай. А она мне: «сорок два». Что сорок два? Я за неё рассрочку плачу.',
    'Пыль, между прочим, копится. Голуби её не волнуют, а пыль — нет.',
    'Делайте что хотите. Только побыстрее, у меня автобус.',
  ],
  excuse: '',
  look: { skin: 1, hair: 4, hairColor: 3, eyes: 2, brows: 2, nose: 2, mouth: 1, extra: 4, coat: 2, collar: 0, build: 0 },
}
