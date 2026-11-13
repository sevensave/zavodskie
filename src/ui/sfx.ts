// Процедурный звук на WebAudio. Никаких файлов: всё собирается из осцилляторов и шума.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let ambience: AudioNode[] = []

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
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
  if (c && ambience.length === 0) startAmbience()
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slide?: number) {
  const c = ac()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, vol: number, filter: number, at = 0, type: BiquadFilterType = 'lowpass') {
  const c = ac()
  if (!c || !master || !noiseBuf || c.state !== 'running') return
  const t = c.currentTime + at
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = filter
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.02)
}

function startAmbience() {
  const c = ac()
  if (!c || !master || !noiseBuf) return
  // Дождь за окном: шум через полосовой фильтр, очень тихо. И гул ламп.
  const rain = c.createBufferSource()
  rain.buffer = noiseBuf
  rain.loop = true
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 1800
  f.Q.value = 0.4
  const g = c.createGain()
  g.gain.value = 0.035
  rain.connect(f).connect(g).connect(master)
  rain.start()
  const hum = c.createOscillator()
  hum.frequency.value = 50
  const hg = c.createGain()
  hg.gain.value = 0.012
  hum.connect(hg).connect(master)
  hum.start()
  ambience = [rain, hum]
}

export const sfx = {
  click: () => tone(900, 0.04, 'square', 0.05),
  blip: () => tone(1400 + Math.random() * 200, 0.018, 'square', 0.018),
  stamp: () => {
    noise(0.12, 0.5, 900)
    tone(90, 0.18, 'sine', 0.6, 0, 50)
  },
  paper: () => noise(0.18, 0.12, 3000, 0, 'highpass'),
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
  camOff: () => tone(700, 0.6, 'sine', 0.15, 0, 90),
  camOn: () => tone(90, 0.3, 'sine', 0.12, 0, 700),
  powerDown: () => tone(500, 0.8, 'triangle', 0.12, 0, 40),
  robotHello: () => {
    tone(880, 0.08, 'square', 0.05)
    tone(1175, 0.08, 'square', 0.05, 0.1)
    tone(1568, 0.12, 'square', 0.05, 0.2)
  },
  drop: () => {
    tone(160, 0.3, 'sine', 0.3, 0, 40)
    noise(0.4, 0.3, 400, 0.05)
  },
}
