import { CASH_GENERIC, CASH_INTRO, CASH_REVEAL, CASH_SPECIAL, CASH_TUTORIAL, CLIFFHANGERS, SHIFT_END, type Cliffhanger } from '../content/cash'
import type { CompareResult, FieldId } from '../sim/rules'
import { currentCase, type ShiftState } from '../sim/shift'
import type { CaseFile, CaseResult, Verdict } from '../sim/types'
import type { Desk, ShiftScript } from './desk'
import { cashCaseGuidance } from './cashguidance'

const CAMERA_DELAY = 60_000
const BLACKOUT = 9_000

const OWNER_AFTER: Record<string, Partial<Record<Verdict, string>>> = {
  timosha: {
    reset: '...Спасибо.',
    return: 'Вернуть? Как есть? Ладно. Спасибо. Правда, спасибо.',
    scrap: 'Под пресс? Я... скажу ей, что он уехал.',
    refuse: 'Отказ? И что мне с ним делать?',
  },
  metla: {
    reset: 'Вот. Другое дело. Пыль, слышишь? Пыль!',
    return: 'Исправна? А голуби? Ладно, сами разберёмся.',
    scrap: 'Под пресс? Ну и ладно. Рассрочка, правда, осталась.',
    junk: 'Под пресс? Ну и ладно. Рассрочка, правда, осталась.',
    refuse: 'Отказ? Ну спасибо, сервис.',
  },
}

/** Сюжет первой смены: обучение, хук с Кэшем, слепая камера и «следующий». */
export class Shift1Script implements ShiftScript {
  private desk!: Desk
  private step: 'compare' | 'diag' | 'stamp' = 'compare'
  private frozen = true
  private reveal: Promise<void> | null = null
  private camLeft: number | null = null
  private blackLeft = 0
  private metlaVerdict: Verdict | null = null
  private generic = 0
  private hurried = false
  private hintedCompare = false
  private pick = 0

  attach(desk: Desk) {
    this.desk = desk
    void desk.terminal.sayAll(CASH_INTRO)
  }

  clockRunning() {
    return !this.frozen
  }

  update(dtMs: number) {
    const t = this.desk.terminal
    if (this.camLeft !== null) {
      this.camLeft -= dtMs
      const s = Math.max(0, Math.ceil(this.camLeft / 1000))
      t.setTimer(`КАМ 0:${String(s).padStart(2, '0')}`, s <= 10 ? 'red' : 'amber')
      if (this.camLeft <= 0) this.startBlackout()
    } else if (this.blackLeft > 0) {
      this.blackLeft -= dtMs
      t.setTimer(`СЛЕПА ${Math.max(0, Math.ceil(this.blackLeft / 1000))}`, 'red')
      if (this.blackLeft <= 0) void this.endBlackout()
    }
    if (!this.hurried && this.desk.state.clock >= 455) {
      this.hurried = true
      void t.say(CASH_GENERIC.hurry, 'cyan')
    }
  }

  onCaseStart(c: CaseFile) {
    const t = this.desk.terminal
    if (c.scripted === 'timosha') {
      void t.say(CASH_TUTORIAL.firstVisitor).then(() => t.say(CASH_TUTORIAL.compare))
    } else if (c.scripted === 'metla') {
      void t.say(CASH_SPECIAL.arrive, 'amber')
      void t.say(cashCaseGuidance(c, 0), 'cyan')
    } else {
      this.generic++
      if (this.generic === 1) void t.say('Дальше сами! Сверка номеров, гарантия, прошивка, самотест. Сверху вниз.', 'cyan')
      else if (this.generic % 3 === 0) void t.say(this.next(CASH_GENERIC.nextCase), 'cyan')
      void t.say(cashCaseGuidance(c, 0), 'cyan')
    }
  }

  onCompare(c: CaseFile, a: FieldId, b: FieldId, r: CompareResult) {
    if (c.scripted !== 'timosha' || this.step !== 'compare') return
    const t = this.desk.terminal
    if (r.kind === 'unrelated') {
      if (!this.hintedCompare) {
        this.hintedCompare = true
        void t.say('Сравнивайте одно с одним: номер в паспорте и номер на шильдике у стойки.')
      }
      return
    }
    this.step = 'diag'
    void t.say(r.kind === 'match' ? CASH_TUTORIAL.compared : CASH_TUTORIAL.comparedMismatch).then(() => t.say(CASH_TUTORIAL.diag))
    void a
    void b
  }

  onAsk(c: CaseFile) {
    if (c.scripted === 'timosha' && this.step === 'compare' && !this.hintedCompare) {
      this.hintedCompare = true
      void this.desk.terminal.say('Жалобы жалобами, а начинаем со сверки. Кнопка СВЕРКА или пробел.')
    }
  }

  onDiag(c: CaseFile) {
    if (c.scripted === 'timosha' && this.step !== 'stamp') {
      this.step = 'stamp'
      this.desk.setEyes('deviant')
      const t = this.desk.terminal
      void this.desk.tl
        .wait(2600)
        .then(() => t.say(CASH_TUTORIAL.pleading))
        .then(() => t.say(CASH_TUTORIAL.afterDiag))
    }
    if (c.scripted === 'metla') this.desk.setEyes('deviant')
  }

  stampGate(c: CaseFile, _v: Verdict): string | null {
    if (c.scripted === 'timosha' && this.step !== 'stamp') return CASH_TUTORIAL.tooEarly
    return null
  }

  async onVerdict(c: CaseFile, v: Verdict, r: CaseResult) {
    const d = this.desk
    const t = d.terminal
    if (c.scripted === 'timosha') {
      await d.deviceReaction(v, c)
      const line = OWNER_AFTER.timosha?.[v]
      if (line) d.say('owner', line)
      await d.tl.wait(1400)
      this.reveal = this.playReveal(v)
      return
    }
    if (c.scripted === 'metla') {
      this.metlaVerdict = v
      if (v === 'junk') {
        void t.openDrawer(false)
        d.say('device', '«Метла-7». Сорок. Кто-нибудь, запишите за меня.')
        await d.tl.wait(1500)
      } else await d.deviceReaction(v, c)
      const line = OWNER_AFTER.metla?.[v]
      if (line) d.say('owner', line)
      await d.tl.wait(1200)
      const reply =
        v === 'junk' ? CASH_SPECIAL.afterJunk : v === 'reset' ? CASH_SPECIAL.afterReset : v === 'scrap' ? CASH_SPECIAL.afterScrap : CASH_SPECIAL.afterReturn
      void t.sayAll(reply, 'amber')
      return
    }
    await d.deviceReaction(v, c)
    if (r.fine > 0) void t.say(this.next(CASH_GENERIC.fined), 'red')
    else if (r.warning) void t.say(this.next(CASH_GENERIC.warning), 'red')
    else if (r.spared) void t.say(this.next(CASH_GENERIC.spared), 'amber')
    else if (v === 'reset' && c.device === 'awake' && this.pick % 2 === 0) void t.say(this.next(CASH_GENERIC.reset), 'amber')
    else if (this.pick % 2 === 1) void t.say(this.next(CASH_GENERIC.correct), 'cyan')
    this.pick++
  }

  async beforeNext() {
    if (this.reveal) {
      await this.reveal
      this.reveal = null
    }
    const s = this.desk.state
    if (s.index >= s.queue.length && s.clock < 480) {
      await this.desk.terminal.say(CASH_GENERIC.emptyQueue, 'cyan')
    }
  }

  onShiftEnd(_s: ShiftState) {
    this.camLeft = null
    void this.desk.terminal.say(SHIFT_END.cashBye, 'amber')
  }

  cliffhanger(): Cliffhanger {
    if (this.metlaVerdict === 'junk') return CLIFFHANGERS.junk
    if (this.metlaVerdict === 'reset') return CLIFFHANGERS.reset
    return CLIFFHANGERS.other
  }

  // --- внутреннее ---

  private next(list: readonly string[]): string {
    return list[this.pick++ % list.length]!
  }

  private async playReveal(v: Verdict) {
    const d = this.desk
    const t = d.terminal
    await d.tl.wait(500)
    t.glitch(1400)
    await d.tl.wait(1500)
    t.setMood('true')
    t.cps = 26
    const first = v === 'reset' ? CASH_REVEAL.reset : v === 'return' ? CASH_REVEAL.spared : v === 'scrap' ? CASH_REVEAL.scrap : CASH_REVEAL.refuse
    await t.sayAll([...first, ...CASH_REVEAL.common], 'amber', 600)
    t.cps = 45
    this.camLeft = CAMERA_DELAY
    this.frozen = false
  }

  private startBlackout() {
    const d = this.desk
    this.camLeft = null
    this.blackLeft = BLACKOUT
    d.setCamera(false)
    const c = currentCase(d.state)
    if (c?.scripted === 'metla' && this.metlaVerdict === null) {
      void d.terminal.openDrawer(true)
      void d.terminal.say(CASH_SPECIAL.blackout, 'amber')
    } else {
      void d.terminal.say('(камера слепа. а беречь уже некого.)', 'amber')
    }
  }

  private async endBlackout() {
    const d = this.desk
    d.setCamera(true)
    d.terminal.setTimer(null)
    void d.terminal.openDrawer(false)
    const c = currentCase(d.state)
    if (c?.scripted === 'metla' && this.metlaVerdict === null) await d.terminal.say(CASH_SPECIAL.missed, 'amber')
    await d.terminal.say(CASH_SPECIAL.camBack, 'amber')
    d.terminal.setMood('corp')
  }
}
