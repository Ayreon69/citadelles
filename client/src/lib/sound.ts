// Sons synthétisés (Web Audio), aucun fichier à charger : cloches de la nef, pièces, verre brisé et fanfares.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Ré dorien : les notes d'une cloche d'église. */
const D = [293.66, 329.63, 349.23, 392, 440, 493.88, 523.25, 587.33, 659.25, 698.46];

function bell(freq: number, opts: { delay?: number; gain?: number } = {}): void {
  const delay = opts.delay ?? 0;
  const gain = opts.gain ?? 0.05;
  tone(freq, 1.3, { gain, delay, attack: 0.004 });
  tone(freq * 2.01, 0.8, { gain: gain * 0.5, delay, attack: 0.004 });
  tone(freq * 2.76, 0.45, { gain: gain * 0.25, delay, attack: 0.004 });
}

export const sfx = {
  /** On appelle un personnage : un coup de cloche lointain. */
  call: () => bell(D[0], { gain: 0.035 }),
  /** Un personnage se révèle : la carte claque, la cloche répond. */
  reveal: () => {
    noise(0.05, { gain: 0.25, freq: 3000, q: 0.8, fade: 3 });
    bell(D[4], { gain: 0.04, delay: 0.03 });
  },
  /** À toi : deux cloches claires. */
  turn: () => {
    bell(D[4], { gain: 0.07 });
    bell(D[7], { gain: 0.07, delay: 0.16 });
  },
  /** Des pièces qui tintent. */
  coin: () => {
    for (let i = 0; i < 3; i++) tone(2400 + Math.random() * 1400, 0.09, { type: 'triangle', gain: 0.03, delay: i * 0.055 });
  },
  /** Une carte qu'on pioche. */
  card: () => noise(0.09, { gain: 0.22, freq: 2400, q: 0.8, fade: 2 }),
  /** Une pierre posée : on bâtit. */
  build: () => {
    tone(150, 0.2, { type: 'triangle', gain: 0.14, slide: 0.6 });
    noise(0.14, { gain: 0.2, freq: 700, fade: 2.5 });
    bell(D[2], { gain: 0.03, delay: 0.12 });
  },
  /** L'Assassin frappe : un souffle, une note basse. */
  kill: () => {
    noise(0.28, { gain: 0.22, freq: 900, sweep: 3800, q: 1.2, fade: 1 });
    tone(110, 0.8, { type: 'sawtooth', gain: 0.045, delay: 0.16, slide: 0.6 });
  },
  /** Le Voleur : pas feutrés, puis la bourse. */
  rob: () => {
    tone(220, 0.09, { type: 'triangle', gain: 0.05 });
    tone(196, 0.09, { type: 'triangle', gain: 0.05, delay: 0.14 });
  },
  robbed: () => {
    for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 1800, 0.08, { type: 'triangle', gain: 0.03, delay: i * 0.05 });
  },
  /** Le verre se brise. */
  glass: () => {
    noise(0.32, { gain: 0.28, freq: 5200, q: 0.6, fade: 3, type: 'highpass' });
    for (let i = 0; i < 7; i++) tone(2400 + Math.random() * 3800, 0.12 + Math.random() * 0.1, { type: 'triangle', gain: 0.02, delay: 0.03 + i * 0.05 });
  },
  /** La couronne change de tête. */
  crown: () => [0, 2, 4].forEach((n, i) => bell(D[n + 3], { gain: 0.05, delay: i * 0.12 })),
  /** Une cité complète : toutes les cloches. */
  complete: () => [7, 6, 4, 2, 4, 7].forEach((n, i) => bell(D[n], { gain: 0.06, delay: i * 0.17 })),
  /** Fin de partie : la fanfare du vainqueur, plus modeste pour les autres. */
  fanfare: (won: boolean) => {
    const notes = won ? [0, 2, 4, 7, 4, 7, 9] : [4, 2, 0, 2, 4];
    notes.forEach((n, i) => tone(D[n] * 2, i === notes.length - 1 ? 0.9 : 0.22, { type: 'triangle', gain: 0.07, delay: i * 0.13 }));
  },
  tap: () => tone(880, 0.05, { gain: 0.025, slide: 1.4 }),
  /** Les personnages sont battus. */
  shuffle: () => {
    for (let i = 0; i < 6; i++) noise(0.04, { gain: 0.1, freq: 2600 + Math.random() * 1500, delay: i * 0.05, fade: 2 });
  },
};
