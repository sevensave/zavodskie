// Процедурный звук на WebAudio. Никаких файлов: всё собирается из осцилляторов и шума.
//
// Два канала: эффекты и фон. Фон зависит от того, где игрок: дождь и гул ламп за стойкой
// (во втором акте — гром, в третьем — сирены), холодильник и капли дома, тишина на карточках.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let fx: GainNode | null = null
let amb: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let started = false
let muted = false

/** Фоновые голоса, которые живут постоянно и только меняют громкость. */
let rainGain: GainNode | null = null
let rainFilter: BiquadFilterNode | null = null
let humGain: GainNode | null = null
let fridgeGain: GainNode | null = null
let droneGain: GainNode | null = null
let blackGain: GainNode | null = null

export type Mood = { kind: 'shift'; act: 0 | 1 | 2; machines: boolean } | { kind: 'home' } | { kind: 'quiet' } | { kind: 'ending' }
let mood: Mood = { kind: 'shift', act: 0, machines: false }
/** До следующего случайного звука фона, мс. */
let eventLeft = 15000

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.5
      master.connect(ctx.destination)
      fx = ctx.createGain()
      fx.connect(master)
      amb = ctx.createGain()
      amb.connect(master)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    } catch {
      return null
    }
  }
  return ctx
}

/** Браузер разрешает звук только после жеста игрока. */
export function unlockAudio() {
  const c = ac()
  if (c && c.state === 'suspended') void c.resume()
  if (c && !started) startAmbience()
}

export function setMuted(on: boolean) {
  muted = on
  if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 0.5, ctx.currentTime, 0.05)
}

export function isMuted(): boolean {
  return muted
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slide?: number, out: AudioNode | null = fx) {
  const c = ac()
  if (!c || !out || c.state !== 'running') return
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, vol: number, filter: number, at = 0, type: BiquadFilterType = 'lowpass', out: AudioNode | null = fx, sweep?: number) {
  const c = ac()
  if (!c || !out || !noiseBuf || c.state !== 'running') return
  const t = c.currentTime + at
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(filter, t)
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(out)
  s.start(t, Math.random() * 1.2)
  s.stop(t + dur + 0.02)
}

/** Нота с медленной атакой: для мотива концовки и карточек. */
function pad(freq: number, dur: number, vol: number, at = 0, out: AudioNode | null = fx) {
  const c = ac()
  if (!c || !out || c.state !== 'running') return
  const t = c.currentTime + at
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  g.connect(out)
  for (const det of [-4, 4]) {
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq
    o.detune.value = det
    o.connect(g)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}

function startAmbience() {
  const c = ac()
  if (!c || !amb || !noiseBuf) return
  started = true
  // Дождь за окном: шум через полосовой фильтр.
  const rain = c.createBufferSource()
  rain.buffer = noiseBuf
  rain.loop = true
  rainFilter = c.createBiquadFilter()
  rainFilter.type = 'bandpass'
  rainFilter.frequency.value = 1800
  rainFilter.Q.value = 0.4
  rainGain = c.createGain()
  rainGain.gain.value = 0
  rain.connect(rainFilter).connect(rainGain).connect(amb)
  rain.start()
  // Гул ламп дневного света: 50 Гц и немного второй гармоники.
  humGain = c.createGain()
  humGain.gain.value = 0
  humGain.connect(amb)
  for (const [f, v] of [
    [50, 1],
    [100, 0.35],
  ] as const) {
    const o = c.createOscillator()
    o.frequency.value = f
    const g = c.createGain()
    g.gain.value = v
    o.connect(g).connect(humGain)
    o.start()
  }
  // Холодильник дома: низкий пульсирующий гул.
  fridgeGain = c.createGain()
  fridgeGain.gain.value = 0
  fridgeGain.connect(amb)
  const fr = c.createOscillator()
  fr.type = 'sawtooth'
  fr.frequency.value = 58
  const frf = c.createBiquadFilter()
  frf.type = 'lowpass'
  frf.frequency.value = 160
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.3
  const lfoG = c.createGain()
  lfoG.gain.value = 0.3
  const frMod = c.createGain()
  frMod.gain.value = 0.7
  lfo.connect(lfoG).connect(frMod.gain)
  fr.connect(frf).connect(frMod).connect(fridgeGain)
  fr.start()
  lfo.start()
  // Тревожный бас третьего акта: две ноты в тритон.
  droneGain = c.createGain()
  droneGain.gain.value = 0
  droneGain.connect(amb)
  for (const f of [41.2, 58.3]) {
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = f
    o.connect(droneGain)
    o.start()
  }
  // Слепая камера: глухое жужжание мёртвого монитора.
  blackGain = c.createGain()
  blackGain.gain.value = 0
  blackGain.connect(amb)
  const bo2 = c.createOscillator()
  bo2.frequency.value = 220
  bo2.type = 'square'
  const bf = c.createBiquadFilter()
  bf.type = 'lowpass'
  bf.frequency.value = 500
  const bg2 = c.createGain()
  bg2.gain.value = 0.25
  bo2.connect(bf).connect(bg2).connect(blackGain)
  bo2.start()
  applyMood()
}

function level(node: GainNode | null, v: number, time = 1.2) {
  if (!node || !ctx) return
  node.gain.setTargetAtTime(v, ctx.currentTime, time / 3)
}

function applyMood() {
  const m = mood
  if (m.kind === 'shift') {
    level(rainGain, [0.03, 0.04, 0.055][m.act]!)
    if (rainFilter && ctx) rainFilter.frequency.setTargetAtTime(m.act === 2 ? 1300 : 1800, ctx.currentTime, 0.5)
    level(humGain, 0.012)
    level(fridgeGain, 0)
    level(droneGain, m.act === 2 ? (m.machines ? 0.03 : 0.022) : 0, 3)
  } else if (m.kind === 'home') {
    level(rainGain, 0.012)
    level(humGain, 0)
    level(fridgeGain, 0.02)
    level(droneGain, 0)
  } else if (m.kind === 'ending') {
    level(rainGain, 0.025, 3)
    level(humGain, 0)
    level(fridgeGain, 0)
    level(droneGain, 0.015, 4)
  } else {
    level(rainGain, 0.015)
    level(humGain, 0)
    level(fridgeGain, 0)
    level(droneGain, 0)
  }
}

/** Где мы: фон подстраивается плавно. */
export function setMood(m: Mood) {
  mood = m
  eventLeft = 8000 + Math.random() * 12000
  if (started) applyMood()
}

/** Случайные звуки фона: машины, гром, сирены — по акту. Вызывать каждый кадр. */
export function tickAmbience(dtMs: number) {
  if (!started || muted) return
  eventLeft -= dtMs
  if (eventLeft > 0) return
  const m = mood
  if (m.kind === 'shift') {
    const r = Math.random()
    if (m.act === 2 && r < 0.5) sfx.siren()
    else if (m.act >= 1 && r < 0.75) sfx.thunder()
    else sfx.car()
    eventLeft = (m.act === 2 ? 14000 : 22000) + Math.random() * 20000
  } else if (m.kind === 'home') {
    // Капает кран. Подписка на сантехнику, видимо, не оплачена.
    for (let i = 0; i < 3; i++) tone(1900 + Math.random() * 300, 0.06, 'sine', 0.025, i * 0.9, 900, amb)
    eventLeft = 9000 + Math.random() * 9000
  } else eventLeft = 20000
}

/** Слепая камера: пока она слепа, в комнате тонко пищит. */
export function setBlackoutHum(on: boolean) {
  level(blackGain, on ? 0.05 : 0, 0.3)
}

export const sfx = {
  click: () => tone(900, 0.04, 'square', 0.05),
  blip: () => tone(1400 + Math.random() * 200, 0.018, 'square', 0.018),
  stamp: (heavy = false) => {
    noise(0.12, 0.5, heavy ? 600 : 900)
    tone(heavy ? 70 : 90, 0.18, 'sine', 0.6, 0, 45)
    noise(0.05, 0.15, 3000, 0.02, 'highpass')
  },
  paper: () => noise(0.18, 0.12, 3000, 0, 'highpass', fx, 6000),
  bell: () => {
    tone(1320, 0.5, 'sine', 0.12)
    tone(990, 0.6, 'sine', 0.1, 0.12)
  },
  match: () => {
    tone(660, 0.08, 'square', 0.05)
    tone(990, 0.12, 'square', 0.05, 0.08)
  },
  mismatch: () => {
    tone(220, 0.25, 'sawtooth', 0.08)
    tone(207, 0.25, 'sawtooth', 0.08)
  },
  warn: () => {
    tone(180, 0.15, 'square', 0.08)
    tone(180, 0.15, 'square', 0.08, 0.2)
  },
  glitch: () => {
    for (let i = 0; i < 6; i++) tone(200 + Math.random() * 2000, 0.05, 'square', 0.05, i * 0.06)
    noise(0.5, 0.15, 5000)
  },
  camOff: () => {
    tone(700, 0.6, 'sine', 0.15, 0, 90)
    setBlackoutHum(true)
  },
  camOn: () => {
    tone(90, 0.3, 'sine', 0.12, 0, 700)
    setBlackoutHum(false)
  },
  powerDown: () => tone(500, 0.8, 'triangle', 0.12, 0, 40),
  robotHello: () => {
    tone(880, 0.08, 'square', 0.05)
    tone(1175, 0.08, 'square', 0.05, 0.1)
    tone(1568, 0.12, 'square', 0.05, 0.2)
  },
  achieve: () => {
    tone(784, 0.12, 'square', 0.04)
    tone(988, 0.12, 'square', 0.04, 0.1)
    tone(1319, 0.3, 'triangle', 0.06, 0.2)
  },
  drop: () => {
    tone(160, 0.3, 'sine', 0.3, 0, 40)
    noise(0.4, 0.3, 400, 0.05)
  },
  /** Конверт на стойке: шелест и звяканье мелочи. */
  coin: () => {
    noise(0.15, 0.1, 4000, 0, 'highpass')
    tone(2637, 0.12, 'sine', 0.04, 0.08)
    tone(3520, 0.1, 'sine', 0.03, 0.14)
  },
  /** Бесконечная смена: минус жизнь. */
  lose: () => {
    tone(330, 0.2, 'square', 0.07, 0, 220)
    tone(220, 0.35, 'square', 0.07, 0.18, 110)
  },
  /** Плюс время: короткий щелчок часов. */
  tick: () => {
    tone(2200, 0.03, 'square', 0.03)
    tone(1700, 0.03, 'square', 0.03, 0.12)
  },
  /** Машина проехала по лужам за окном. */
  car: () => noise(2.6, 0.05, 300, 0, 'bandpass', amb, 1400),
  thunder: () => {
    noise(3.5, 0.12, 120, 0, 'lowpass', amb, 50)
    noise(1.2, 0.06, 400, 0.1, 'lowpass', amb, 80)
  },
  /** Далёкая сирена: два тона вверх-вниз, тихо. */
  siren: () => {
    for (let i = 0; i < 3; i++) {
      tone(620, 0.55, 'sine', 0.012, i * 1.1, 880, amb)
      tone(880, 0.55, 'sine', 0.012, i * 1.1 + 0.55, 620, amb)
    }
  },
  /** Акт начинается: низкий удар и минорная нота. */
  sting: () => {
    tone(55, 1.2, 'sine', 0.25, 0, 40)
    pad(220, 2.4, 0.05, 0.1)
    pad(261.6, 2.4, 0.04, 0.4)
  },
  /** Нуарный мотив концовки: ля минор, вниз по ступеням. */
  motif: () => {
    const notes = [440, 392, 349.2, 329.6, 293.7, 329.6]
    notes.forEach((f, i) => pad(f, 1.6, 0.045, i * 0.7))
    pad(110, 5, 0.04, 0)
    pad(130.8, 3.5, 0.03, 2.1)
  },
}
