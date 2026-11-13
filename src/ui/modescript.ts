import { MODES_TEXT, type EndlessMod } from '../content/modes'
import { ENDLESS_BONUS, endlessLives, endlessMiss, endlessScore } from '../sim/modes'
import { SHIFT_MINUTES } from '../sim/dates'
import type { CaseFile, CaseResult, KeshTruth, Verdict } from '../sim/types'
import { DayScript } from './dayscript'
import { sfx } from './sfx'

/** Смены вне кампании: «Смена дня» и «Бесконечная смена». Кэш тот же, сюжета нет. */
export class ModeScript extends DayScript {
  lives: number
  closed = 0
  /** Почему кончилась бесконечная смена. */
  outOfLives = false

  constructor(
    day: number,
    kesh: KeshTruth,
    readonly mode: 'daily' | 'endless',
    readonly mods: readonly EndlessMod[] = [],
  ) {
    super(day, kesh, null)
    this.lives = endlessLives(mods)
  }

  protected override async intro() {
    const t = this.desk.terminal
    if (this.mode === 'endless') {
      this.desk.boardLine = () => ({
        text: `Очки ${endlessScore(this.closed, this.mods)} · ${MODES_TEXT.lives(this.lives)}`,
        color: this.lives <= 1 ? 'red' : 'ink',
      })
      this.desk.refreshBoard()
      await t.say(MODES_TEXT.endlessHello, 'cyan')
    } else await t.say(MODES_TEXT.dailyHello, 'cyan')
    if (this.desk.state.blackouts > 0) await t.say('(камеру могу ослепить и тут. по старой дружбе.)', 'amber')
  }

  override async onVerdict(c: CaseFile, v: Verdict, r: CaseResult) {
    await super.onVerdict(c, v, r)
    if (this.mode !== 'endless') return
    const d = this.desk
    if (endlessMiss(r)) {
      this.lives -= 1
      sfx.lose()
      d.toast(MODES_TEXT.endlessLife, 'red')
      if (this.lives <= 0) {
        this.outOfLives = true
        d.state = { ...d.state, clock: SHIFT_MINUTES }
      }
    } else {
      this.closed += 1
      d.state = { ...d.state, clock: Math.max(0, d.state.clock - ENDLESS_BONUS) }
      sfx.tick()
      d.toast(MODES_TEXT.endlessPlus(ENDLESS_BONUS), 'olive')
    }
    d.refreshBoard()
  }
}
