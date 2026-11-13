import { describe, expect, it } from 'vitest'
import { MODELS } from '../content/models'
import { METLA, SHIFT1_GENERATED, TIMOSHA } from '../content/shift1'
import { formatDate, parseDate } from './dates'
import { generateCase, mutateSerial } from './generator'
import { Rng } from './rng'
import { compareFields, instructed, solveFromPaper } from './rules'
import { currentCase, judge, shiftDone, startShift, summarize, tickClock } from './shift'
import type { CaseFile } from './types'

const TODAY = 0

function paperView(c: CaseFile) {
  return {
    today: formatDate(TODAY),
    passport: {
      model: c.passport.model,
      serial: c.passport.serial,
      firmware: c.passport.firmware,
      warrantyUntil: formatDate(c.passport.warrantyUntil),
    },
    claim: { model: c.claim.model, serial: c.claim.serial },
    plate: c.plate,
    diagText: c.diag.text,
  }
}

describe('генератор дел', () => {
  it('один сид — одно и то же дело', () => {
    const a = generateCase({ seed: 'x', day: 0, index: 3 })
    const b = generateCase({ seed: 'x', day: 0, index: 3 })
    expect(a).toEqual(b)
    expect(generateCase({ seed: 'y', day: 0, index: 3 })).not.toEqual(a)
  })

  it('каждое дело решается по уликам на бумаге', () => {
    for (let i = 0; i < 3000; i++) {
      const c = generateCase({ seed: `s${i}`, day: TODAY, index: i % 12 })
      expect(solveFromPaper(paperView(c)), `дело s${i}`).toBe(instructed(c, TODAY).verdict)
    }
  })

  it('ровно один изъян и он виден сверкой', () => {
    for (let i = 0; i < 1000; i++) {
      const c = generateCase({ seed: `f${i}`, day: TODAY, index: 0 })
      const rule = instructed(c, TODAY).rule
      if (c.flaw === 'none') expect(['error', 'deviant', 'fine']).toContain(rule)
      if (c.flaw === 'serial_claim') expect(compareFields(c, TODAY, 'p.serial', 'c.serial').kind).toBe('mismatch')
      if (c.flaw === 'serial_plate') expect(compareFields(c, TODAY, 'plate', 'p.serial').kind).toBe('mismatch')
      if (c.flaw === 'model_claim') expect(compareFields(c, TODAY, 'p.model', 'c.model').kind).toBe('mismatch')
      if (c.flaw === 'warranty') expect(compareFields(c, TODAY, 'p.warranty', 'today').kind).toBe('mismatch')
      if (c.flaw === 'firmware') expect(compareFields(c, TODAY, 'p.firmware', 'rule.firmware').kind).toBe('mismatch')
      if (c.flaw !== 'serial_claim') expect(compareFields(c, TODAY, 'p.serial', 'c.serial').kind).toBe('match')
    }
  })

  it('все сценарии встречаются', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const c = generateCase({ seed: `v${i}`, day: TODAY, index: 0 })
      seen.add(instructed(c, TODAY).rule)
    }
    expect([...seen].sort()).toEqual(['deviant', 'docs', 'error', 'fine', 'firmware', 'warranty'])
  })

  it('испорченный номер всегда отличается от исходного', () => {
    const rng = new Rng(1)
    for (let i = 0; i < 2000; i++) {
      const s = `ТМ-${rng.int(1000, 9999)}-К`
      const m = mutateSerial(rng, s)
      expect(m).not.toBe(s)
      expect(m).toMatch(/^ТМ-[1-9]\d{3}-К$/)
    }
  })

  it('нормальный ответ самотеста у каждой модели свой и без кода ошибки', () => {
    for (const m of MODELS) {
      expect(m.diagNormal).not.toMatch(/Ошибка/)
      for (const e of m.diagErrors) expect(e).toMatch(/Ошибка [А-Я]-\d\d/)
      for (const d of m.diagDeviant) expect(d).not.toMatch(/Ошибка [А-Я]-\d\d/)
    }
  })
})

describe('даты', () => {
  it('туда и обратно', () => {
    for (const d of [-1100, -730, -1, 0, 1, 400]) expect(parseDate(formatDate(d))).toBe(d)
    expect(formatDate(0)).toBe('14.11.47')
  })
})

describe('смена 1', () => {
  const scripted = [TIMOSHA, METLA]

  it('ручные дела решаются по бумаге и требуют сброса', () => {
    for (const c of scripted) {
      expect(instructed(c, TODAY).verdict).toBe('reset')
      expect(solveFromPaper(paperView(c))).toBe('reset')
    }
  })

  it('очередь детерминирована и начинается с робота', () => {
    const a = startShift('night', 0, scripted, SHIFT1_GENERATED)
    const b = startShift('night', 0, scripted, SHIFT1_GENERATED)
    expect(a).toEqual(b)
    expect(currentCase(a)?.scripted).toBe('timosha')
    expect(a.queue[1]?.scripted).toBe('metla')
    expect(a.queue).toHaveLength(2 + SHIFT1_GENERATED)
  })

  it('два предупреждения, потом штрафы', () => {
    let s = startShift('night', 0, scripted, SHIFT1_GENERATED)
    const results = []
    for (let i = 0; i < 4; i++) {
      const c = currentCase(s)!
      const wrong = instructed(c, 0).verdict === 'return' ? 'scrap' : 'return'
      const r = judge(s, wrong, { cameraOff: false })
      s = r.state
      results.push(r.result)
    }
    expect(results.map((r) => r.warning)).toEqual([true, true, false, false])
    expect(results.map((r) => r.fine)).toEqual([0, 0, 5, 5])
    expect(s.scales.money).toBe(4 * 10 - 10)
  })

  it('лом только при слепой камере и без предупреждения', () => {
    const s = startShift('night', 0, scripted, SHIFT1_GENERATED)
    expect(() => judge(s, 'junk', { cameraOff: false })).toThrow()
    const r = judge(s, 'junk', { cameraOff: true })
    expect(r.result.warning).toBe(false)
    expect(r.result.spared).toBe(true)
    expect(r.state.scales.under).toBeGreaterThan(s.scales.under)
  })

  it('смена кончается в 06:00 или когда очередь пуста', () => {
    let s = startShift('night', 0, scripted, SHIFT1_GENERATED)
    expect(shiftDone(s)).toBe(false)
    s = tickClock(s, 10_000)
    expect(s.clock).toBe(480)
    expect(shiftDone(s)).toBe(true)

    let q = startShift('night', 0, scripted, 0)
    q = judge(q, 'reset', { cameraOff: false }).state
    q = judge(q, 'reset', { cameraOff: false }).state
    expect(shiftDone(q)).toBe(true)
    expect(summarize(q)).toMatchObject({ closed: 2, byInstruction: 2, earned: 20, fines: 0 })
  })

  it('смена по инструкции укладывается в 8–14 минут при минуте на дело', () => {
    let s = startShift('night', 0, scripted, SHIFT1_GENERATED)
    let seconds = 0
    while (!shiftDone(s)) {
      s = tickClock(s, 60)
      seconds += 60
      if (shiftDone(s)) break
      s = judge(s, instructed(currentCase(s)!, 0).verdict, { cameraOff: false }).state
    }
    expect(seconds / 60).toBeGreaterThanOrEqual(8)
    expect(seconds / 60).toBeLessThanOrEqual(14)
  })
})
