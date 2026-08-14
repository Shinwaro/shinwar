/* The seeded PRNG and its named streams.
 *
 * Stream independence is the property that matters most here. It is what lets
 * a seed stay a stable bug report while the game is still being built: adding
 * a die roll to combat must never change which maps generate.
 */

import { describe, expect, it } from 'vitest';
import type { RngState, StreamName } from '../src/engine/types.ts';
import {
  STREAM_NAMES,
  chance,
  createRng,
  formatSeed,
  nextFloat,
  nextInt,
  normalizeSeed,
  pick,
  sample,
  shuffle,
  weightedPick,
} from '../src/engine/rng.ts';

function draw(rng: RngState, stream: StreamName, count: number): { values: number[]; rng: RngState } {
  const values: number[] = [];
  let current = rng;
  for (let i = 0; i < count; i++) {
    const roll = nextFloat(current, stream);
    values.push(roll.value);
    current = roll.rng;
  }
  return { values, rng: current };
}

describe('seeding', () => {
  it('is the same run for the same seed', () => {
    expect(createRng('SHINWAR')).toEqual(createRng('SHINWAR'));
  });

  it('normalizes seeds the way a person would copy them', () => {
    expect(normalizeSeed('  abcd-2345 ')).toBe('ABCD-2345');
    expect(createRng('abcd-2345')).toEqual(createRng('ABCD-2345'));
  });

  it('starts every stream somewhere different', () => {
    const rng = createRng('SHINWAR');
    const starts = STREAM_NAMES.map((name) => rng[name]);
    expect(new Set(starts).size).toBe(STREAM_NAMES.length);
  });

  it('sends different seeds somewhere different', () => {
    expect(createRng('AAAA-2222').map).not.toBe(createRng('AAAA-2223').map);
  });

  it('mints typeable seeds with no lookalike characters', () => {
    // Sweep the whole alphabet rather than one sample: a lookalike that only
    // shows up on some rolls is exactly the bug this is guarding against.
    for (let start = 0; start < 64; start++) {
      let counter = start;
      const seed = formatSeed(() => {
        counter += 1;
        return (counter * 0.137) % 1;
      });
      expect(seed).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(seed, `roll from ${start}`).not.toMatch(/[OIL01]/);
    }
  });
});

describe('stream independence', () => {
  it('combat rolls never move the map stream', () => {
    const base = createRng('INDEPENDENCE');

    const clean = draw(base, 'map', 20).values;

    // Same map draws, but with an arbitrary and growing number of combat
    // rolls shoved between them — exactly what happens when a card gains a
    // die roll halfway through development.
    let current = base;
    const interleaved: number[] = [];
    for (let i = 0; i < 20; i++) {
      current = draw(current, 'combat', i * 3 + 1).rng;
      const roll = nextFloat(current, 'map');
      interleaved.push(roll.value);
      current = roll.rng;
    }

    expect(interleaved).toEqual(clean);
  });

  it('holds for every pair of streams', () => {
    const base = createRng('PAIRS');
    for (const observed of STREAM_NAMES) {
      const clean = draw(base, observed, 8).values;
      for (const noisy of STREAM_NAMES) {
        if (noisy === observed) continue;
        const polluted = draw(draw(base, noisy, 25).rng, observed, 8).values;
        expect(polluted, `${noisy} moved ${observed}`).toEqual(clean);
      }
    }
  });

  it('leaves untouched streams byte-identical', () => {
    const base = createRng('UNTOUCHED');
    const after = draw(base, 'combat', 50).rng;
    expect(after.map).toBe(base.map);
    expect(after.rewards).toBe(base.rewards);
    expect(after.events).toBe(base.events);
    expect(after.shop).toBe(base.shop);
    expect(after.combat).not.toBe(base.combat);
  });
});

describe('draws', () => {
  it('stays in [0,1)', () => {
    let rng = createRng('RANGE');
    for (let i = 0; i < 2000; i++) {
      const roll = nextFloat(rng, 'combat');
      expect(roll.value).toBeGreaterThanOrEqual(0);
      expect(roll.value).toBeLessThan(1);
      rng = roll.rng;
    }
  });

  it('respects integer bounds', () => {
    let rng = createRng('INTS');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const roll = nextInt(rng, 'map', 3, 7);
      expect(roll.value).toBeGreaterThanOrEqual(3);
      expect(roll.value).toBeLessThan(7);
      seen.add(roll.value);
      rng = roll.rng;
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('does not advance on an empty integer range', () => {
    const rng = createRng('EMPTY');
    const roll = nextInt(rng, 'map', 5, 5);
    expect(roll.value).toBe(5);
    expect(roll.rng).toBe(rng);
  });

  it('picks from a list and refuses an empty one', () => {
    const rng = createRng('PICK');
    expect(['a', 'b', 'c']).toContain(pick(rng, 'rewards', ['a', 'b', 'c']).value);
    expect(() => pick(rng, 'rewards', [])).toThrow(/empty list/);
  });

  it('weights, rather than pulling from a flat bag', () => {
    let rng = createRng('WEIGHTS');
    const entries = [
      { value: 'common', weight: 70 },
      { value: 'uncommon', weight: 25 },
      { value: 'rare', weight: 5 },
    ];
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
    for (let i = 0; i < 10000; i++) {
      const roll = weightedPick(rng, 'rewards', entries);
      counts[roll.value] = (counts[roll.value] ?? 0) + 1;
      rng = roll.rng;
    }
    expect(counts['common'] ?? 0).toBeGreaterThan(counts['uncommon'] ?? 0);
    expect(counts['uncommon'] ?? 0).toBeGreaterThan(counts['rare'] ?? 0);
    // Roughly the declared shares, with room for the sample size.
    expect((counts['rare'] ?? 0) / 10000).toBeGreaterThan(0.03);
    expect((counts['rare'] ?? 0) / 10000).toBeLessThan(0.07);
  });

  it('ignores zero weights and refuses an all-zero table', () => {
    const rng = createRng('ZERO');
    const roll = weightedPick(rng, 'shop', [
      { value: 'never', weight: 0 },
      { value: 'always', weight: 1 },
    ]);
    expect(roll.value).toBe('always');
    expect(() => weightedPick(rng, 'shop', [{ value: 'x', weight: 0 }])).toThrow(/positive weights/);
  });

  it('shuffles without losing or duplicating anything', () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const roll = shuffle(createRng('SHUFFLE'), 'combat', items);
    expect(roll.value.slice().sort((a, b) => a - b)).toEqual(items);
    expect(roll.value).not.toEqual(items);
  });

  it('shuffles identically for the same seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffle(createRng('DECK'), 'combat', items).value;
    const b = shuffle(createRng('DECK'), 'combat', items).value;
    expect(a).toEqual(b);
  });

  it('samples distinct items', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const roll = sample(createRng('SAMPLE'), 'rewards', items, 3);
    expect(roll.value).toHaveLength(3);
    expect(new Set(roll.value).size).toBe(3);
  });

  it('rolls a chance at roughly the stated probability', () => {
    let rng = createRng('CHANCE');
    let hits = 0;
    for (let i = 0; i < 10000; i++) {
      const roll = chance(rng, 'events', 0.25);
      if (roll.value) hits += 1;
      rng = roll.rng;
    }
    expect(hits / 10000).toBeGreaterThan(0.23);
    expect(hits / 10000).toBeLessThan(0.27);
  });
});
