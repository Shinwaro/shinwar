/* The one source of randomness in the game.
 *
 * Mulberry32, split into named independent streams held in `GameState`. Every
 * function here is pure: you hand it an `RngState` and it hands you back a
 * value plus the advanced state. Nothing is generated, stored or mutated
 * behind your back.
 *
 * The streams are the important part. `map`, `combat`, `rewards`, `events` and
 * `shop` each advance alone, so adding a die roll to combat can never change
 * which maps generate for a given seed. That property is load-bearing — it is
 * what makes a seed a stable bug report — and there is a test for exactly it.
 *
 * Never call `mulberry32` directly from outside this file.
 */

import type { RngState, StreamName } from './types.ts';

export const STREAM_NAMES: readonly StreamName[] = ['map', 'combat', 'rewards', 'events', 'shop'];

/** A roll: the value, and the state to carry forward. Ignore the state and you have a bug. */
export interface Roll<T> {
  readonly value: T;
  readonly rng: RngState;
}

export interface Weighted<T> {
  readonly value: T;
  /** Must be > 0. Zero-weight entries are filtered out before the roll. */
  readonly weight: number;
}

/* ---------- primitives ---------- */

/**
 * xmur3: string -> well-mixed uint32.
 *
 * Derives the stream seeds. Exported because the epilogue picks its phrasing
 * from the run rather than from a die — a run has already ended by then, and
 * advancing a stream to choose an adjective would make the same seed's *next*
 * run differ depending on how the last one was worded.
 */
export function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** One step of mulberry32. Returns the value in [0,1) and the next state. */
function mulberry32(seedState: number): { readonly value: number; readonly next: number } {
  const next = (seedState + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, next };
}

/* ---------- seeding ---------- */

/**
 * Normalize a player-typed seed. Trimmed and upper-cased so `abc `, `ABC` and
 * `Abc` are the same run — a seed people copy by hand has to survive being
 * copied by hand.
 */
export function normalizeSeed(raw: string): string {
  return raw.trim().toUpperCase();
}

/* No 0/O, no 1/I/L. A seed gets read aloud and typed back in by hand. */
const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Turn a source of entropy into a typeable seed: two groups of four from an
 * alphabet with no `0/O` or `1/I/L`, because these get read aloud and written
 * down. `entropy` supplies floats in [0,1) — the UI passes the platform
 * generator, the tests pass something fixed. The engine never sources its own.
 */
export function formatSeed(entropy: () => number): string {
  let out = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += '-';
    const index = Math.floor(entropy() * SEED_ALPHABET.length) % SEED_ALPHABET.length;
    out += SEED_ALPHABET[index] ?? SEED_ALPHABET[0];
  }
  return out;
}

/**
 * Derive the full stream set from a seed. Each stream is hashed from the seed
 * plus its own name, so the streams start far apart and stay independent.
 */
export function createRng(seed: string): RngState {
  const normalized = normalizeSeed(seed);
  return {
    map: hashString(`${normalized}:map`),
    combat: hashString(`${normalized}:combat`),
    rewards: hashString(`${normalized}:rewards`),
    events: hashString(`${normalized}:events`),
    shop: hashString(`${normalized}:shop`),
  };
}

function advance(rng: RngState, stream: StreamName, next: number): RngState {
  return { ...rng, [stream]: next };
}

/* ---------- draws ---------- */

/** A float in [0,1). */
export function nextFloat(rng: RngState, stream: StreamName): Roll<number> {
  const { value, next } = mulberry32(rng[stream]);
  return { value, rng: advance(rng, stream, next) };
}

/** An integer in [minInclusive, maxExclusive). Returns `minInclusive` if the range is empty. */
export function nextInt(
  rng: RngState,
  stream: StreamName,
  minInclusive: number,
  maxExclusive: number,
): Roll<number> {
  const span = maxExclusive - minInclusive;
  if (span <= 0) return { value: minInclusive, rng };
  const { value, rng: advanced } = nextFloat(rng, stream);
  return { value: minInclusive + Math.floor(value * span), rng: advanced };
}

/** An integer in [min, max], both inclusive — the form damage and HP ranges want. */
export function nextIntInclusive(
  rng: RngState,
  stream: StreamName,
  min: number,
  max: number,
): Roll<number> {
  return nextInt(rng, stream, min, max + 1);
}

/** `true` with the given probability. */
export function chance(rng: RngState, stream: StreamName, probability: number): Roll<boolean> {
  const { value, rng: advanced } = nextFloat(rng, stream);
  return { value: value < probability, rng: advanced };
}

/** One item, uniformly. Throws on an empty list rather than returning undefined. */
export function pick<T>(rng: RngState, stream: StreamName, items: readonly T[]): Roll<T> {
  if (items.length === 0) throw new Error(`rng.pick: empty list on stream '${stream}'`);
  const { value: index, rng: advanced } = nextInt(rng, stream, 0, items.length);
  const value = items[index];
  if (value === undefined) throw new Error(`rng.pick: index ${index} out of range`);
  return { value, rng: advanced };
}

/**
 * One item by weight. Rarity, encounter and reward tables all live here rather
 * than pulling from a flat bag — weighted, not uniform, is the whole point.
 */
export function weightedPick<T>(
  rng: RngState,
  stream: StreamName,
  entries: readonly Weighted<T>[],
): Roll<T> {
  const usable = entries.filter((entry) => entry.weight > 0);
  if (usable.length === 0) throw new Error(`rng.weightedPick: no positive weights on '${stream}'`);

  const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
  const { value: roll, rng: advanced } = nextFloat(rng, stream);

  let cursor = roll * total;
  for (const entry of usable) {
    cursor -= entry.weight;
    if (cursor < 0) return { value: entry.value, rng: advanced };
  }
  // Only reachable through float drift at the very top of the range.
  const last = usable[usable.length - 1];
  if (last === undefined) throw new Error('rng.weightedPick: unreachable');
  return { value: last.value, rng: advanced };
}

/** Fisher-Yates, pure. The reshuffle from discard runs through this. */
export function shuffle<T>(rng: RngState, stream: StreamName, items: readonly T[]): Roll<T[]> {
  const out = items.slice();
  let current = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const { value: j, rng: advanced } = nextInt(current, stream, 0, i + 1);
    current = advanced;
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return { value: out, rng: current };
}

/** `count` distinct items. Used by reward screens — never the same card twice. */
export function sample<T>(
  rng: RngState,
  stream: StreamName,
  items: readonly T[],
  count: number,
): Roll<T[]> {
  const { value: shuffled, rng: advanced } = shuffle(rng, stream, items);
  return { value: shuffled.slice(0, Math.max(0, count)), rng: advanced };
}
