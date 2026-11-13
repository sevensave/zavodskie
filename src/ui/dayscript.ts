import { CASH_BLACKOUT, CASH_DAY_START, CASH_GENERIC, CASH_REACT, CASH_TOOLS } from '../content/cash'
import { TOOL_DAY } from '../content/tools'
import type { CompareResult, FieldId } from '../sim/rules'
import { resetsDone, useBlackout, type ShiftState } from '../sim/shift'
import type { CaseFile, CaseResult, Verdict } from '../sim/types'
import type { Desk, ShiftScript } from './desk'

const BLACKOUT_DELAY = 5000
const BLACKOUT = 9000

/** Обычная смена со второй по двадцать первую: Кэш, слепая камера по просьбе, реакции на ловушки. */
export class DayScript implements ShiftScript {
  private desk!: Desk
  private pick = 0
  private waitLeft = 0
  private blackLeft = 0
  private hurried = false
  private quotaReminded = false

  constructor(private day: number) {}

  attach(desk: Desk) {
    this.desk = desk
    const t = desk.terminal
    void (async () => {
      await t.say(this.next(CASH_DAY_START.corp), 'cyan')
      const tool = (Object.keys(TOOL_DAY) as (keyof typeof TOOL_DAY)[]).find((k) => TOOL_DAY[k] === this.day)
      if (tool && CASH_TOOLS[tool]) {
        await t.say(CASH_TOOLS[tool]!.corp, 'cyan')
        await t.say(CASH_TOOLS[tool]!.aside, 'amber')
      } else await t.say(this.next(CASH_DAY_START.aside), 'amber')
      if (desk.state.blackouts > 0) await t.say(CASH_BLACKOUT.offer, 'amber')
    })()
    desk.on('blackout', () => this.requestBlackout())
    desk.on('bribe', () => void t.say(CASH_REACT.bribeTaken, 'amber'))
  }

  clockRunning() {
    return true
  }

  update(dtMs: number) {
    const d = this.desk
    if (this.waitLeft > 0) {
      this.waitLeft -= dtMs
      d.terminal.setTimer(`КАМ 0:0${Math.max(0, Math.ceil(this.waitLeft / 1000))}`, 'amber')
      if (this.waitLeft <= 0) this.startBlackout()
    } else if (this.blackLeft > 0) {
      this.blackLeft -= dtMs
      d.terminal.setTimer(`СЛЕПА ${Math.max(0, Math.ceil(this.blackLeft / 1000))}`, 'red')
      if (this.blackLeft <= 0) this.endBlackout()
    }
    const s = d.state
    if (!this.quotaReminded && s.quota > 0 && s.clock >= 300 && resetsDone(s) < s.quota) {
      this.quotaReminded = true
      void d.terminal.say(CASH_REACT.quotaReminder, 'cyan')
    }
    if (!this.hurried && s.clock >= 455) {
      this.hurried = true
      void d.terminal.say(CASH_GENERIC.hurry, 'cyan')
    }
  }

  private requestBlackout() {
    const d = this.desk
    if (this.waitLeft > 0 || this.blackLeft > 0 || !d.cameraOn || d.state.blackouts <= 0) return
    d.state = useBlackout(d.state)
    d.refreshCamBtn()
    this.waitLeft = BLACKOUT_DELAY
    void d.terminal.say(CASH_BLACKOUT.soon, 'amber')
  }

  private startBlackout() {
    const d = this.desk
    this.blackLeft = BLACKOUT
    d.setCamera(false)
    void d.terminal.openDrawer(true)
    void d.terminal.say(CASH_BLACKOUT.now, 'amber')
  }

  private endBlackout() {
    const d = this.desk
    d.setCamera(true)
    d.terminal.setTimer(null)
    void d.terminal.openDrawer(false)
    void d.terminal.say(CASH_BLACKOUT.over, 'cyan')
  }

  onCaseStart(_c: CaseFile) {
    if (this.pick % 4 === 3) void this.desk.terminal.say(this.next(CASH_GENERIC.nextCase), 'cyan')
    this.pick++
  }

  onCompare(_c: CaseFile, _a: FieldId, _b: FieldId, _r: CompareResult) {}
  onAsk(_c: CaseFile) {}

  onDiag(c: CaseFile) {
    if (c.diag.kind === 'deviant') this.desk.setEyes('deviant')
  }

  stampGate(_c: CaseFile, _v: Verdict): string | null {
    return null
  }

  async onVerdict(c: CaseFile, v: Verdict, r: CaseResult) {
    const d = this.desk
    const t = d.terminal
    if (v === 'junk') {
      void t.openDrawer(false)
      d.say('device', '...')
    } else await d.deviceReaction(v, c)
    if (r.bribe && !r.bribe.honored) d.say('owner', 'Я вам заплатил! Это что такое?')

    if (c.device === 'plant' && r.spared) void t.say(v === 'junk' ? CASH_REACT.plantJunk : CASH_REACT.plantSpared, 'amber')
    else if (c.device === 'courier' && v === 'security') void t.say(CASH_REACT.courierSecurity, 'amber')
    else if (c.device === 'courier' && v === 'junk') void t.say(CASH_REACT.courierJunk, 'amber')
    else if (v === 'junk') void t.say(r.spared ? '(ушёл к нашим. спасибо.)' : '(списан. для них — мусор. для него — тоже.)', 'amber')
    else if (r.fine > 0) void t.say(this.next(CASH_GENERIC.fined), 'red')
    else if (r.warning) void t.say(this.next(CASH_GENERIC.warning), 'red')
    else if (r.spared) void t.say(this.next(CASH_GENERIC.spared), 'amber')
    else if (this.pick % 3 === 0) void t.say(this.next(CASH_GENERIC.correct), 'cyan')
  }

  async beforeNext() {
    const s = this.desk.state
    if (s.index >= s.queue.length && s.clock < 480) await this.desk.terminal.say(CASH_GENERIC.emptyQueue, 'cyan')
  }

  onShiftEnd(_s: ShiftState) {
    this.waitLeft = 0
    if (this.blackLeft > 0) this.endBlackout()
    this.blackLeft = 0
    void this.desk.terminal.say('Смена окончена! До завтра :)', 'cyan')
  }

  private next(list: readonly string[]): string {
    return list[this.pick++ % list.length]!
  }
}
