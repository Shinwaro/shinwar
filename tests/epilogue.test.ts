/* The epilogue.
 *
 * With no saves and no scores, the end screen is the entire artefact of a run,
 * so the tests here are about the two properties that make it trustworthy: it
 * says only things that are true, and it says the same things about the same
 * run every time.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../src/engine/types.ts';
import { epilogueFor } from '../src/engine/run/epilogue.ts';
import { applyAction, applyActions } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { availableMoves } from '../src/engine/map/route.ts';
import { reloadContent } from '../src/content/index.ts';
import { threads as threadTable } from '../src/content/registry.ts';
import { makeFight } from './helpers.ts';

beforeEach(() => {
  reloadContent();
});

function openRun(seed: string): GameState {
  return applyActions(createInitialState(seed), [{ kind: 'beginRun' }]);
}

/** A finished run, without having to actually lose one. */
function ended(state: GameState, outcome: 'won' | 'died' | 'abandoned'): GameState {
  const run = state.run;
  if (run === null) throw new Error('no run');
  return { ...state, phase: 'over', run: { ...run, outcome } };
}

describe('the epilogue', () => {
  it('has nothing to say without a run', () => {
    expect(epilogueFor(createInitialState('SEED-TEST'))).toBeNull();
  });

  it('produces a headline, a standfirst and an account', () => {
    const epilogue = epilogueFor(ended(openRun('SEED-AAAA'), 'died'));
    expect(epilogue).not.toBeNull();
    expect(epilogue!.headline.trim()).not.toBe('');
    expect(epilogue!.standfirst).toContain('Act 1');
    expect(epilogue!.standfirst).toContain('Depth 0');
    expect(epilogue!.paragraphs.length).toBeGreaterThan(0);
    for (const paragraph of epilogue!.paragraphs) expect(paragraph.trim()).not.toBe('');
  });

  it('reads the same for the same run, every time', () => {
    // The phrasing is hashed from the run's own facts rather than rolled, so
    // this is not a "probably stable" assertion — it is the whole mechanism.
    const state = ended(openRun('SEED-BBBB'), 'died');
    expect(JSON.stringify(epilogueFor(state))).toBe(JSON.stringify(epilogueFor(state)));
  });

  it('never advances an RNG stream', () => {
    // If it ever did, the wording of one death would change the contents of
    // the next run on that seed.
    const state = ended(openRun('SEED-CCCC'), 'died');
    const before = JSON.stringify(state.run?.rng);
    epilogueFor(state);
    expect(JSON.stringify(state.run?.rng)).toBe(before);
  });

  it('says different things about a win and a death', () => {
    const run = openRun('SEED-DDDD');
    const win = epilogueFor(ended(run, 'won'))!;
    const loss = epilogueFor(ended(run, 'died'))!;
    expect(win.headline).not.toBe(loss.headline);
    expect(win.paragraphs[0]).not.toBe(loss.paragraphs[0]);
  });

  it('names the enemy still standing, with its health', () => {
    const fight = makeFight({ enemyHp: 4 });
    const epilogue = epilogueFor(ended(fight, 'died'))!;
    const account = epilogue.paragraphs.join(' ');
    // The near-miss is the point of the whole screen: "you died with it on 4"
    // is a run you remember, and "you died in Act 1" is not.
    expect(account).toContain('Still up:');
    expect(account).toContain('on 4');
  });

  it('names the threads that never came due', () => {
    const state = openRun('SEED-EEEE');
    const run = state.run!;
    const threadId = threadTable.ids()[0]!;
    const carrying = ended(
      { ...state, run: { ...run, threads: [{ threadId, resolved: false, progress: 1 }] } },
      'died',
    );

    const epilogue = epilogueFor(carrying)!;
    expect(epilogue.unfinished.map((def) => def.id)).toEqual([threadId]);
    expect(epilogue.paragraphs.join(' ')).toContain(threadTable.get(threadId).name);
  });

  it('leaves the thread block empty when everything settled', () => {
    const state = openRun('SEED-FFFF');
    const run = state.run!;
    const threadId = threadTable.ids()[0]!;
    const settled = ended(
      { ...state, run: { ...run, threads: [{ threadId, resolved: true, progress: 9 }] } },
      'died',
    );
    expect(epilogueFor(settled)!.unfinished).toEqual([]);
  });

  it('calls out Alloy that went down with the ship', () => {
    const state = openRun('SEED-GGGG');
    const run = state.run!;
    const rich = ended({ ...state, run: { ...run, alloy: 900 } }, 'died');
    const poor = ended({ ...state, run: { ...run, alloy: 10 } }, 'died');
    expect(epilogueFor(rich)!.paragraphs.join(' ')).toContain('900 Alloy');
    expect(epilogueFor(poor)!.paragraphs.join(' ')).not.toContain('Alloy went down');
  });

  it('never mentions unspent Alloy on a win — it is not a rebuke then', () => {
    const state = openRun('SEED-HHHH');
    const run = state.run!;
    const won = ended({ ...state, run: { ...run, alloy: 900 } }, 'won');
    expect(epilogueFor(won)!.paragraphs.join(' ')).not.toContain('went down with the ship');
  });

  it('keeps every ledger row filled', () => {
    // A ledger with a blank value reads as a bug in the game rather than as a
    // fact about the run.
    const epilogue = epilogueFor(ended(openRun('SEED-JJJJ'), 'died'))!;
    expect(epilogue.ledger.length).toBeGreaterThanOrEqual(8);
    for (const row of epilogue.ledger) {
      expect(row.label.trim(), 'empty label').not.toBe('');
      expect(row.value.trim(), `empty value for ${row.label}`).not.toBe('');
    }
  });

  it('names the place and the distance still to fly', () => {
    // The general case, which the pre-move branch would otherwise hide: a
    // death somewhere on the chart has to name where, and how much was left.
    let state = openRun('SEED-WALK');
    const first = availableMoves(state.run!)[0]!;
    state = applyAction(state, { kind: 'moveToNode', nodeId: first.id });

    const account = epilogueFor(ended(state, 'died'))!.paragraphs.join(' ');
    const node = state.run!.map!.nodes.find((entry) => entry.id === state.run!.position)!;
    expect(account).toContain(node.name);
    expect(account).toMatch(/further up the chart|it is where the cutter stopped/);
  });

  it('holds up on an abandoned run mid-map', () => {
    const state = applyAction(openRun('SEED-KKKK'), { kind: 'abandonRun' });
    const epilogue = epilogueFor(state)!;
    expect(epilogue.paragraphs.join(' ')).toContain('broke off');
  });

  it('works across many seeds without producing an empty sentence', () => {
    for (let i = 0; i < 60; i++) {
      const state = ended(openRun(`SEED-${i}`), i % 2 === 0 ? 'died' : 'won');
      const epilogue = epilogueFor(state)!;
      const account = epilogue.paragraphs.join(' ');
      expect(account, `seed ${i}`).not.toContain('  ');
      expect(account, `seed ${i}`).not.toContain(' .');
      expect(account, `seed ${i}`).not.toContain('undefined');
      expect(account, `seed ${i}`).not.toContain('NaN');
    }
  });
});
