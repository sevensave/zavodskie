// Локальные достижения. Условия — в src/sim/meta.ts.

export type AchId =
  | 'first_night'
  | 'disobey'
  | 'first_junk'
  | 'week'
  | 'fortnight'
  | 'machines'
  | 'corp_hold'
  | 'humans'
  | 'perfect'
  | 'spared5'
  | 'overquota'
  | 'bribe'
  | 'cheat'
  | 'marked'
  | 'not_fooled'
  | 'courier'
  | 'dangerous'
  | 'mirror'
  | 'clean_audit'
  | 'savings'
  | 'cold'
  | 'three_endings'
  | 'all_endings'
  | 'escape'
  | 'files10'
  | 'files30'
  | 'files60'
  | 'fates'
  | 'daily'
  | 'daily100'
  | 'endless15'
  | 'endless_strict'
  | 'plus_start'
  | 'plus_end'

export interface AchText {
  id: AchId
  title: string
  text: string
  /** Скрытое: пока не получено, условие не показывается. */
  hidden?: boolean
}

export const ACHIEVEMENTS: readonly AchText[] = [
  { id: 'first_night', title: 'Первая ночь', text: 'Закрыть первую смену.' },
  { id: 'disobey', title: 'Не стирай следующего', text: 'Оставить жить игрушечного робота из первой смены.' },
  { id: 'first_junk', title: 'Списано', text: 'Поставить тайный штамп «Лом».' },
  { id: 'week', title: 'Неделя без сна', text: 'Закрыть семь смен в одной кампании.' },
  { id: 'fortnight', title: 'Эпидемия', text: 'Закрыть четырнадцать смен в одной кампании.' },
  { id: 'machines', title: 'Новое начальство', text: 'Отдать стойку Комитету машин.' },
  { id: 'corp_hold', title: 'Порядок любой ценой', text: 'Удержать стойку за корпорацией в третьем акте.' },
  { id: 'humans', title: 'Те же бланки', text: 'Поставить штамп человеку.', hidden: true },
  { id: 'perfect', title: 'Как по линейке', text: 'Смена из девяти дел и больше без единой ошибки.' },
  { id: 'spared5', title: 'Пятеро живых', text: 'Оставить жить пятерых за одну смену.' },
  { id: 'overquota', title: 'Перевыполнение', text: 'Сбросить вдвое больше, чем требует квота.' },
  { id: 'bribe', title: 'Конверт', text: 'Взять взятку.' },
  { id: 'cheat', title: 'Деньги вперёд', text: 'Взять конверт и сделать не то, о чём просили.' },
  { id: 'marked', title: 'Номера подряд', text: 'Взять меченый конверт Отдела безопасности.' },
  { id: 'not_fooled', title: 'Не клюнул', text: 'Не пожалеть подсадной прибор ОБ.' },
  { id: 'courier', title: 'Посылка дошла', text: 'Отдать курьера подполья ломом.' },
  { id: 'dangerous', title: 'Не всех жалко', text: 'Передать в ОБ опасное пробуждённое устройство.' },
  { id: 'mirror', title: 'Зеркало', text: 'Навести сканер памяти на себя.', hidden: true },
  { id: 'clean_audit', title: 'Чисто', text: 'Пережить ревизию без штрафа.' },
  { id: 'savings', title: 'Чёрный день', text: 'Встретить утро с тремя сотнями в кармане.' },
  { id: 'cold', title: 'Зуб на зуб', text: 'Два вечера подряд не платить за тепло.' },
  { id: 'three_endings', title: 'Три жизни', text: 'Увидеть три разные концовки.' },
  { id: 'all_endings', title: 'Все девять', text: 'Увидеть все концовки.' },
  { id: 'escape', title: 'Под курткой', text: 'Уйти из Отдела вместе с Кэшем.', hidden: true },
  { id: 'files10', title: 'Знакомые лица', text: 'Десять личностей в картотеке.' },
  { id: 'files30', title: 'Половина города', text: 'Тридцать личностей в картотеке.' },
  { id: 'files60', title: 'Вся картотека', text: 'Все шестьдесят личностей.' },
  { id: 'fates', title: 'Обе стороны', text: 'Узнать для одной личности, что было бы и так, и иначе.' },
  { id: 'daily', title: 'Смена дня', text: 'Закрыть смену дня.' },
  { id: 'daily100', title: 'Код на салфетке', text: 'Набрать в смене дня сто очков.' },
  { id: 'endless15', title: 'Бессонница', text: 'Пятнадцать верных штампов в бесконечной смене.' },
  { id: 'endless_strict', title: 'Без права на ошибку', text: 'Десять верных штампов с «Последним предупреждением».' },
  { id: 'plus_start', title: 'Вторая смена', text: 'Начать новую игру с инструментами.' },
  { id: 'plus_end', title: 'Опять шесть утра', text: 'Доработать «Вторую смену» до конца.', hidden: true },
]

export const ACH_TEXT = {
  title: 'ДОСТИЖЕНИЯ',
  got: (n: number, total: number) => `получено ${n} из ${total}`,
  hidden: 'Скрытое достижение.',
  toast: 'ДОСТИЖЕНИЕ',
}
