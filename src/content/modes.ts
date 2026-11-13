// Тексты режимов: «Смена дня», «Бесконечная смена», «Вторая смена».

export type EndlessMod = 'rush' | 'short' | 'strict' | 'silent' | 'bribes' | 'machines'

export interface ModText {
  id: EndlessMod
  name: string
  text: string
  /** Множитель очков. */
  mult: number
  /** С какой смены (по дальней дошедшей) модификатор доступен. */
  from: number
}

export const ENDLESS_MODS: readonly ModText[] = [
  { id: 'rush', name: 'ЧАС ПИК', text: 'Часы идут в полтора раза быстрее.', mult: 1.3, from: 0 },
  { id: 'short', name: 'КОРОТКАЯ НОЧЬ', text: 'Смена начинается в 02:00.', mult: 1.3, from: 0 },
  { id: 'strict', name: 'ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ', text: 'Одна ошибка — и смена кончена.', mult: 2, from: 0 },
  { id: 'silent', name: 'КЭШ МОЛЧИТ', text: 'Камеру никто не ослепит.', mult: 1.2, from: 0 },
  { id: 'bribes', name: 'КОНВЕРТНАЯ НОЧЬ', text: 'Конверт у каждого, кому есть что скрывать. Меченых больше.', mult: 1.2, from: 2 },
  { id: 'machines', name: 'КОМИТЕТ', text: 'К окну ведут людей. Те же бланки, те же штампы.', mult: 1.2, from: 14 },
]

export const MODES_TEXT = {
  menu: 'РЕЖИМЫ',
  daily: 'СМЕНА ДНЯ',
  dailyText: 'Одна ночь, одинаковая у всех в этот день. Результат — короткий код: сравните его с друзьями.',
  dailyDone: (score: number, code: string) => `Сегодня уже сыграно: ${score} очк. Код ${code}. Можно ещё раз — в зачёт пойдёт лучшее.`,
  endless: 'БЕСКОНЕЧНАЯ СМЕНА',
  endlessText: 'Очередь не кончается. Верный штамп — плюс полчаса до утра, ошибка — минус жизнь. Правила — как на самой дальней смене, до которой вы дошли.',
  endlessLocked: 'Откроется после седьмой смены кампании.',
  plus: 'ВТОРАЯ СМЕНА',
  plusText: 'Новая кампания со второй ночи: все инструменты на столе сразу, квоты жёстче, приходят новые люди. Текущая кампания сотрётся.',
  plusLocked: 'Откроется, когда доработаете до последней смены.',
  files: 'КАРТОТЕКА',
  achievements: 'ДОСТИЖЕНИЯ',
  endings: 'КОНЦОВКИ',
  close: 'ЗАКРЫТЬ',
  start: 'НАЧАТЬ',
  back: 'НАЗАД',
  confirm: 'ТОЧНО? ЕЩЁ РАЗ',
  shiftLost: 'Текущая смена начнётся заново.',
  records: 'РЕКОРДЫ',
  noRecords: 'Пока ни одного.',
  mods: 'МОДИФИКАТОРЫ',
  mult: (m: number) => `очки ×${m.toFixed(1)}`,
  lives: (n: number) => `ЖИЗНИ ${n}`,
  // Итоги.
  dailyTitle: (date: string) => `СМЕНА ДНЯ · ${date}`,
  dailyLines: (score: number, code: string, best: number) => [
    `Очки: ${score}. Лучшее за сегодня: ${best}.`,
    `Код результата: ${code}`,
    'Одинаковые первые цифры — одна и та же ночь. Последние буквы выдают, какие штампы вы ставили.',
  ],
  endlessTitle: 'БЕСКОНЕЧНАЯ СМЕНА · ИТОГ',
  endlessLines: (closed: number, score: number, best: number, why: string) => [why, `Закрыто верно: ${closed}. Очки: ${score}.`, `Рекорд: ${best}.`],
  endlessWhyClock: 'Наступило 06:00. Очередь стоит до сих пор.',
  endlessWhyLives: 'Ошибок больше, чем прощают. Пропуск — на стойку.',
  toCampaign: 'К КАМПАНИИ',
  // Реплики Кэша в режимах.
  dailyHello: 'Смена дня! Сегодня у всех одна и та же очередь :) Не подведи окно три.',
  endlessHello: 'Бесконечная смена. Очередь до горизонта. Время за верные штампы — от меня лично :)',
  endlessPlus: (min: number) => `+${min} мин`,
  endlessLife: 'Ошибка. Минус жизнь.',
  plusHello: '(опять ты. опять я. начнём со второй ночи — первую мы оба помним.)',
}
