/* The sound of the thing, synthesised.
 *
 * There are no audio files here and there will not be. Loading one is a network
 * request from a game whose entire premise is that it never talks to anything —
 * and the `dist/` guard greps the shipped bundle for exactly that. Inlining
 * samples as data URIs dodges the request and would dwarf a 295 kB bundle for
 * six short noises. So every sound in the game is built out of oscillators and
 * filtered noise at the moment it plays: no assets, no dependency, nothing to
 * fetch, and a palette that suits a spare synthetic interface rather than
 * fighting it.
 *
 * Nothing in here can change what happens. Like `settings.ts`, it is presentation
 * only — a replayed action log produces the same run in silence.
 *
 * Three browser facts shape the code:
 *
 *   - An `AudioContext` cannot make a sound before a user gesture. `unlock()` is
 *     called from the button that starts a run, which is the first gesture there
 *     is, and until then every `play` here is a no-op that costs nothing.
 *   - A suspended context still holds hardware. The tab going hidden suspends
 *     it, for the same battery reason `space.ts` stops its loop.
 *   - Scheduling is sample-accurate and `setTimeout` is not, so everything is
 *     placed against `ctx.currentTime` rather than fired later by a timer.
 */

import { cards as cardTable } from '../content/registry.ts';
import { getSettings } from './settings.ts';

/* ---------- the context ---------- */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Built on the first gesture. Before that, silence, and no object either. */
export function unlock(): void {
  if (ctx !== null) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }

  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return;

  ctx = new Ctor();
  master = ctx.createGain();
  /* Quiet. This is furniture — it sits under a fight that already has numbers
     flying off it, and anything louder starts competing with the thing it is
     supposed to be describing. */
  master.gain.value = 0.22;
  master.connect(ctx.destination);

  document.addEventListener('visibilitychange', () => {
    if (ctx === null) return;
    if (document.hidden) void ctx.suspend();
    else if (getSettings().sound) void ctx.resume();
  });
}

function live(): { ctx: AudioContext; master: GainNode; now: number } | null {
  if (ctx === null || master === null) return null;
  if (!getSettings().sound) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, master, now: ctx.currentTime };
}

/* ---------- the two primitives ---------- */

interface ToneSpec {
  readonly type: OscillatorType;
  /** Hz at the start and at the end. Equal means a steady pitch. */
  readonly from: number;
  readonly to: number;
  readonly gain: number;
  readonly attack: number;
  readonly decay: number;
  readonly at: number;
  /** Cents of detune, for a second oscillator alongside the first. */
  readonly detune?: number;
}

/**
 * One oscillator with an envelope.
 *
 * `exponentialRampToValueAtTime` for the tail, because a linear fade to zero on
 * a gain node is audible as a click at the moment it lands — and it cannot ramp
 * TO zero at all, hence the floor.
 */
function tone(spec: ToneSpec): void {
  const audio = live();
  if (audio === null) return;

  const start = audio.now + spec.at;
  const end = start + spec.attack + spec.decay;

  const osc = audio.ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.from, start);
  if (spec.to !== spec.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.to), end);
  if (spec.detune !== undefined) osc.detune.setValueAtTime(spec.detune, start);

  const env = audio.ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, spec.gain), start + spec.attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(env);
  env.connect(audio.master);
  osc.start(start);
  osc.stop(end + 0.02);
}

interface NoiseSpec {
  readonly duration: number;
  readonly gain: number;
  /** Lowpass cutoff at the start and at the end — the sweep is the character. */
  readonly from: number;
  readonly to: number;
  readonly at: number;
  readonly q?: number;
}

/** A burst of noise through a swept lowpass. Every hiss and click in the game. */
function noise(spec: NoiseSpec): void {
  const audio = live();
  if (audio === null) return;

  const start = audio.now + spec.at;
  const frames = Math.max(1, Math.floor(audio.ctx.sampleRate * spec.duration));
  const buffer = audio.ctx.createBuffer(1, frames, audio.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  /* `Math.random` is fine here and ONLY here: this is a waveform, not a game
     decision. Nothing about a run depends on which noise sample came out, and
     the seeded streams exist to protect replay, which sound cannot touch. */
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = audio.ctx.createBufferSource();
  source.buffer = buffer;

  const filter = audio.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(spec.from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, spec.to), start + spec.duration);
  if (spec.q !== undefined) filter.Q.setValueAtTime(spec.q, start);

  const env = audio.ctx.createGain();
  env.gain.setValueAtTime(Math.max(0.0002, spec.gain), start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(audio.master);
  source.start(start);
  source.stop(start + spec.duration + 0.02);
}

/* ---------- the palette ----------
   Each of these is one event in the game, and they are deliberately different
   in SHAPE rather than only in pitch: a card play is a transient, heat is a
   rise, a vent is a fall. Told apart with the screen ignored, which is the
   whole job. */

/** A card leaves the deck. Bright, short, and stacked for a multi-card draw. */
export function playDraw(count: number): void {
  const many = Math.min(Math.max(1, count), 4);
  for (let i = 0; i < many; i++) {
    tone({
      type: 'triangle',
      from: 900,
      to: 1500,
      gain: 0.16,
      attack: 0.004,
      decay: 0.055,
      at: i * 0.045,
    });
  }
}

/** Heat arrives. Rises, and the more of it the further it climbs. */
export function playHeatGain(amount: number): void {
  const reach = 1 + Math.min(Math.max(amount, 1), 6) * 0.12;
  tone({ type: 'sawtooth', from: 150, to: 150 * reach, gain: 0.1, attack: 0.01, decay: 0.2, at: 0 });
  tone({
    type: 'sawtooth',
    from: 150,
    to: 150 * reach,
    gain: 0.07,
    attack: 0.012,
    decay: 0.22,
    at: 0,
    detune: 14,
  });
}

/** Heat leaves. A hiss that falls away, which is the opposite gesture. */
export function playVent(amount: number): void {
  const size = Math.min(Math.max(amount, 1), 6);
  noise({ duration: 0.16 + size * 0.02, gain: 0.14, from: 5200, to: 500, at: 0 });
  tone({ type: 'sine', from: 420, to: 190, gain: 0.05, attack: 0.01, decay: 0.16, at: 0.01 });
}

/**
 * A card is played, and the type is the timbre.
 *
 * Attacks get a transient — a click and a fast fall, something struck. Skills
 * are a clean pip with no grit at all. Powers swell rather than hit, because
 * they change the rest of the fight instead of resolving in it. Voided cards
 * are the same shape as a skill and wrong on purpose: flat, detuned, and over
 * before it is satisfying.
 */
export function playCardSound(cardId: string): void {
  switch (cardTable.find(cardId)?.type) {
    case 'attack':
      noise({ duration: 0.05, gain: 0.16, from: 7000, to: 1400, at: 0, q: 0.7 });
      tone({ type: 'square', from: 760, to: 220, gain: 0.11, attack: 0.003, decay: 0.11, at: 0 });
      return;

    case 'power':
      tone({ type: 'sine', from: 180, to: 300, gain: 0.11, attack: 0.09, decay: 0.34, at: 0 });
      tone({
        type: 'sine',
        from: 271,
        to: 451,
        gain: 0.06,
        attack: 0.11,
        decay: 0.36,
        at: 0.02,
        detune: -8,
      });
      return;

    case 'voided':
      tone({ type: 'sawtooth', from: 210, to: 196, gain: 0.09, attack: 0.006, decay: 0.09, at: 0 });
      tone({
        type: 'sawtooth',
        from: 210,
        to: 196,
        gain: 0.07,
        attack: 0.006,
        decay: 0.09,
        at: 0,
        detune: 42,
      });
      return;

    default:
      // Skill, and anything the registry does not know — a clean pip is the
      // safest thing to be wrong with.
      tone({ type: 'sine', from: 560, to: 720, gain: 0.12, attack: 0.006, decay: 0.13, at: 0 });
      return;
  }
}

/**
 * Setting down on a node.
 *
 * The only sound out here, and it is the one gesture the map makes: a fall and
 * a settle. Longer than anything in combat, because the map is the part of the
 * run where nothing is chasing you.
 */
export function playDescent(): void {
  tone({ type: 'sine', from: 340, to: 120, gain: 0.11, attack: 0.02, decay: 0.36, at: 0 });
  noise({ duration: 0.3, gain: 0.07, from: 1800, to: 220, at: 0.06 });
  tone({ type: 'triangle', from: 90, to: 84, gain: 0.09, attack: 0.03, decay: 0.3, at: 0.16 });
}
