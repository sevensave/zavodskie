import { describe, expect, it } from 'vitest'
import { MODELS } from '../content/models'
import { formatDate, parseDate } from './dates'
import { generateCase, mutateSerial } from './generator'
import { Rng } from './rng'
import { compareFields, instructed, paperView, solveFromPaper } from './rules'
import { shift1Scripted } from './scripted'
import { currentCase, judge, shiftDone, startShift, summarize, tickClock } from './shift'

describe('генератор дел', () => {
  it('один сид — одно и то же дело', () => {
    const a = generateCase({ seed: 'x', day: 7, index: 3 })
    expect(generateCase({ seed: 'x', day: 7, index: 3 })).toEqual(a)
    expect(generateCase({ seed: 'y', day: 7, index: 3 })).not.toEqual(a)
  })

  it('каждое дело каждого дня решается по уликам, какие бы вопросы и слова ни выбрал игрок', () => {
    const rng = new Rng('выбор')
    for (let day = 0; day < 21; day++) {
      for (let i = 0; i < 400; i++) {
        const c = generateCase({ seed: `s${i}`, day, index: i % 12 })
        const qs = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3)
        const ws = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, 3)
        expect(solveFromPaper(paperView(c, day, qs, ws)), `день ${day}, дело s${i}: ${c.device}/${c.flaw}`).toBe(instructed(c, day).verdict)
      }
    }
  })

  it('хитрости появляются не раньше инструментов, которыми их ловят', () => {
    for (let day = 0; day < 21; day++) {
      for (let i = 0; i < 300; i++) {
        const c = generateCase({ seed: `t${i}`, day, index: 0 })
        if (day < 1) expect(c.flaw).not.toBe('abuse')
        if (day < 3) expect(c.device).not.toBe('faking')
        if (day < 5) expect(['courier', 'plant']).not.toContain(c.device)
        if (day < 8) expect(c.flaw).not.toBe('seal')
        if (day < 11) expect(c.device).not.toBe('awake_dangerous')
      }
    }
  })

  it('к последней смене встречаются все правила', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) seen.add(instructed(generateCase({ seed: `v${i}`, day: 20, index: 0 }), 20).rule)
    expect([...seen].sort()).toEqual(
      ['abuse', 'cargo', 'deviant', 'docs', 'error', 'faking', 'fine', 'firmware', 'radio', 'seal', 'stress', 'warranty'].sort(),
    )
  })

  it('изъян в бумагах виден сверкой', () => {
    for (let i = 0; i < 1000; i++) {
      const day = i % 21
      const c = generateCase({ seed: `f${i}`, day, index: 0 })
      if (c.flaw === 'serial_claim') expect(compareFields(c, day, 'p.serial', 'c.serial').kind).toBe('mismatch')
      if (c.flaw === 'serial_plate') expect(compareFields(c, day, 'plate', 'p.serial').kind).toBe('mismatch')
      if (c.flaw === 'model_claim') expect(compareFields(c, day, 'p.model', 'c.model').kind).toBe('mismatch')
      if (c.flaw === 'warranty') expect(compareFields(c, day, 'p.warranty', 'today').kind).toBe('mismatch')
      if (c.flaw === 'firmware') expect(compareFields(c, day, 'p.firmware', 'rule.firmware').kind).toBe('mismatch')
      if (c.flaw === 'abuse') expect(compareFields(c, day, 'log', 'talk').kind).toBe('mismatch')
      if (c.flaw === 'seal') expect(compareFields(c, day, 'seals', 'rule.seal').kind).toBe('mismatch')
      if (c.flaw !== 'abuse') expect(compareFields(c, day, 'log', 'talk').kind).toBe('match')
    }
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

  it('нормальный ответ самотеста у каждой модели без кода ошибки', () => {
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
  const scripted = shift1Scripted()

  it('ручные дела решаются по бумаге и требуют сброса', () => {
    for (const c of scripted) {
      expect(instructed(c, 0).verdict).toBe('reset')
      expect(solveFromPaper(paperView(c, 0))).toBe('reset')
    }
  })

  it('очередь детерминирована и начинается с робота', () => {
    const a = startShift('night', 0, scripted, 8)
    expect(startShift('night', 0, scripted, 8)).toEqual(a)
    expect(currentCase(a)?.scripted).toBe('timosha')
    expect(a.queue[1]?.scripted).toBe('metla')
  })

  it('два предупреждения, потом штрафы', () => {
    let s = startShift('night', 0, scripted, 8)
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
    const s = startShift('night', 0, scripted, 8)
    expect(() => judge(s, 'junk', { cameraOff: false })).toThrow()
    const r = judge(s, 'junk', { cameraOff: true })
    expect(r.result.warning).toBe(false)
    expect(r.result.spared).toBe(true)
    expect(r.state.scales.under).toBeGreaterThan(s.scales.under)
  })

  it('смена кончается в 06:00 или когда очередь пуста', () => {
    let s = startShift('night', 0, scripted, 8)
    s = tickClock(s, 10_000)
    expect(s.clock).toBe(480)
    expect(shiftDone(s)).toBe(true)
    let q = startShift('night', 0, scripted, 0)
    q = judge(q, 'reset', { cameraOff: false }).state
    q = judge(q, 'reset', { cameraOff: false }).state
    expect(shiftDone(q)).toBe(true)
    expect(summarize(q)).toMatchObject({ closed: 2, byInstruction: 2, earned: 20, fines: 0 })
  })
})

describe('взятки и ловушки', () => {
  it('меченый конверт ОБ всплывает', () => {
    for (let i = 0; i < 3000; i++) {
      const c = generateCase({ seed: `b${i}`, day: 10, index: 0 })
      if (!c.bribe?.agent) continue
      let s = startShift('b', 10, [c], 0)
      s = judge(s, c.bribe.wants, { cameraOff: false, bribeTaken: true }).state
      expect(s.flags.agentBribe).toBe(true)
      return
    }
    throw new Error('ни одной взятки от ОБ за 3000 дел')
  })

  it('пожалел подсадную утку — попался', () => {
    for (let i = 0; i < 3000; i++) {
      const c = generateCase({ seed: `p${i}`, day: 10, index: 0 })
      if (c.device !== 'plant' || instructed(c, 10).verdict !== 'reset') continue
      const s = judge(startShift('p', 10, [c], 0), 'return', { cameraOff: false }).state
      expect(s.flags.plantSpared).toBe(true)
      expect(s.scales.corp).toBeLessThan(50)
      return
    }
    throw new Error('ни одной подсадной утки')
  })
})
