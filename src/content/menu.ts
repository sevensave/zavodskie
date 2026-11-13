// Тексты главного меню и перерыва.

export const MENU_TEXT = {
  title1: 'ЗАВОДСКИЕ',
  title2: 'НАСТРОЙКИ',
  sub: 'Отдел возвратов «Домовой». Ночная смена.',
  bubble: 'Пожалуйста, не стирайте меня.',
  cont: 'ПРОДОЛЖИТЬ',
  start: 'НАЧАТЬ СМЕНУ',
  fresh: 'НОВАЯ ИГРА',
  freshSure: 'СТЕРЕТЬ? ЕЩЁ РАЗ',
  modes: 'РЕЖИМЫ',
  sound: (muted: boolean) => (muted ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ'),
  fullscreen: 'ПОЛНЫЙ ЭКРАН',
  quit: 'ВЫЙТИ',
  noSave: 'Сохранений пока нет.',
  saveShift: (n: number, date: string, money: number) => `Сохранено: перед сменой ${n} · ${date} · ${money} р.`,
  saveHome: (n: number, date: string, money: number) => `Сохранено: утро после смены ${n} · ${date} · ${money} р.`,
  saveEnding: 'Сохранено: история окончена. Финал ждёт.',
  savePlus: ' · вторая смена',
  footer: (v: string) => `в. ${v} · игра сохраняется сама после каждой смены и каждого утра`,
  toMenu: 'В ГЛАВНОЕ МЕНЮ',
  toMenuSure: 'СМЕНА ПРОПАДЁТ. ЕЩЁ РАЗ',
} as const
