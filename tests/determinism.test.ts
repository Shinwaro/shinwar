/* Determinism and serialization.
 *
 * `seed + action log` reproduces any run exactly. This is the regression
 * harness, it is how the simulator works, and it is the bug report format.
 * Anything that breaks reproducibility is a P1, so it gets asserted by hash
 * and by full string, not by eyeball.
 */

import { describe, expect, it } from 'vitest';
import type { Action, ActionLog } from '../src/engine/actions.ts';
import { applyAction, applyActions, clampDepth, replay } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { fromJson, hashState, stableStringify, toJson } from '../src/engine/serialize.ts';
import { MAX_DEPTH } from '../src/content/balance.ts';

const SCRIPT: readonly Action[] = [
  { kind: 'setDepth', depth: 7 },
  { kind: 'setSeed', seed: 'kraw-2468' },
  { kind: 'setDepth', depth: 4 },
  { kind: 'beginRun' },
];

const LOG: ActionLog = { seed: 'BOOT-SEED', depth: 0, actions: SCRIPT };

describe('determinism', () => {
  it('replays to an identical state', () => {
    const a = replay(LOG);
    const b = replay(LOG);
    expect(hashState(a)).toBe(hashState(b));
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('replays to the same state the live store would have reached', () => {
    const live = applyActions(createInitialState(LOG.seed, LOG.depth), SCRIPT);
    expect(stableStringify(replay(LOG))).toBe(stableStringify(live));
  });

  it('sends a different seed somewhere different', () => {
    const other = replay({ ...LOG, actions: [...SCRIPT.slice(0, 1), { kind: 'setSeed', seed: 'OTHER-SEED' }, ...SCRIPT.slice(2)] });
    expect(hashState(other)).not.toBe(hashState(replay(LOG)));
  });

  it('stringifies by sorted key, not by construction order', () => {
    const built = { b: 1, a: { d: 2, c: 3 } };
    const other = { a: { c: 3, d: 2 }, b: 1 };
    expect(stableStringify(built)).toBe(stableStringify(other));
  });

  it('refuses to serialize an undefined field', () => {
    expect(() => stableStringify({ ok: 1, bad: undefined })).toThrow(/never optional/);
  });
});

describe('serialization round trip', () => {
  it('survives state -> JSON -> state', () => {
    const state = replay(LOG);
    const returned = fromJson(toJson(state));
    expect(stableStringify(returned)).toBe(stableStringify(state));
    expect(hashState(returned)).toBe(hashState(state));
  });

  it('keeps nulls rather than dropping them', () => {
    const state = createInitialState('NULLS');
    expect(state.run).toBeNull();
    expect(fromJson(toJson(state)).run).toBeNull();
    expect(toJson(state)).toContain('"run": null');
  });
});

describe('the reducer', () => {
  it('is total — an out-of-phase action is ignored, not thrown', () => {
    const started = applyActions(createInitialState('PHASE'), [{ kind: 'beginRun' }]);
    const same = applyAction(started, { kind: 'setSeed', seed: 'NOPE' });
    expect(same).toBe(started);
  });

  it('normalizes the seed it starts the run with', () => {
    const state = applyActions(createInitialState('BOOT'), [
      { kind: 'setSeed', seed: '  quiet-void ' },
      { kind: 'beginRun' },
    ]);
    expect(state.run?.seed).toBe('QUIET-VOID');
  });

  it('clamps depth to the ladder', () => {
    expect(clampDepth(-4)).toBe(0);
    expect(clampDepth(999)).toBe(MAX_DEPTH);
    expect(clampDepth(3.7)).toBe(3);
    expect(clampDepth(Number.NaN)).toBe(0);
  });

  it('leaves nothing of a finished run behind on the title screen', () => {
    const over = applyActions(createInitialState('LEAK'), [
      { kind: 'beginRun' },
      { kind: 'abandonRun' },
      { kind: 'returnToTitle' },
    ]);
    expect(over.phase).toBe('title');
    expect(over.run).toBeNull();
    expect(over.log).toEqual([]);
  });

  it('records the run start in the log, ahead of the first fight', () => {
    const state = applyActions(createInitialState('LOGGED'), [{ kind: 'beginRun' }]);
    expect(state.log[0]?.kind).toBe('run');
    expect(state.log[0]?.text).toContain('LOGGED');
    // Opening the run opens the first combat, so the fight narrates after it.
    expect(state.log.some((entry) => entry.text.startsWith('Contact:'))).toBe(true);
  });
});
