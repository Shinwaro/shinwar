/* Relics.
 *
 * The progression axis the run was missing: cards make the deck better at what
 * it does, relics change what it is allowed to do. They are also the only thing
 * in the game that raises Energy or draw, so the tests care most about the two
 * seams — that a passive reaches the number it is supposed to modify, and that
 * an act finale offers a choice rather than granting one.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../src/engine/types.ts';
import { createInitialState } from '../src/engine/state.ts';
import { applyAction } from '../src/engine/reducer.ts';
import { HOOK_NAMES, handlersFor } from '../src/engine/hooks.ts';
import { rollRelics, rollMastery } from '../src/engine/run/rewards.ts';
import { computeDamage, previewDamage, PLAYER, enemyTarget } from '../src/engine/combat/damage.ts';
import { playCard, startPlayerTurn } from '../src/engine/combat/combat.ts';
import { overheatThreshold } from '../src/engine/combat/heat.ts';
import { pilotRules, liveStance } from '../src/engine/combat/rules.ts';
import { PLAYER as PLAYER_BALANCE, REWARDS } from '../src/content/balance.ts';
import { reloadContent } from '../src/content/index.ts';
import { relics as relicTable } from '../src/content/registry.ts';
import { makeFight, combatOf, firstEnemy } from './helpers.ts';
import { VECTOR_STEP } from '../src/content/cards/basic.ts';

function holding(state: GameState, ...ids: readonly string[]): GameState {
  if (state.run === null) throw new Error('test: no run');
  return { ...state, run: { ...state.run, pilot: { ...state.run.pilot, relics: [...ids] } } };
}

beforeEach(() => {
  reloadContent();
});

describe('the relic pool', () => {
  it('gives every relic text and something to do', () => {
    /*
     * "Something to do" is a passive OR a handler on the bus.
     *
     * This used to demand a passive, which quietly defined a relic as a bag of
     * stat modifiers — and that is exactly why the pool read as "+damage" and
     * "-damage taken" for so long. A relic that watches for a stance change or
     * a fourth card played does its whole job through hooks and carries no
     * passive at all; the assertion has to admit that or it argues against the
     * interesting half of the design.
     */
    const hooked = new Set<string>();
    for (const hook of HOOK_NAMES) {
      for (const entry of handlersFor(hook)) hooked.add(entry.sourceId);
    }

    for (const def of relicTable.all()) {
      expect(def.text.trim(), def.id).not.toBe('');
      const passives = Object.keys(def.passive ?? {}).length;
      expect(passives > 0 || hooked.has(def.id), `${def.id} does nothing`).toBe(true);
    }
  });

  it('actually fires a relic that works through hooks', () => {
    /*
     * The regression: `activeHookSources()` gated on masteries, threads,
     * environments and statuses -- but not relics. So a relic could register a
     * handler, say in its text that it did something, and the bus would never
     * call it. Silent, because an unfired hook looks exactly like a hook with
     * nothing to do. Five relics shipped inert before this caught it.
     */
    const base = makeFight({ hand: [VECTOR_STEP] });
    if (base.run === null) throw new Error('test: no run');
    const carrying: GameState = {
      ...base,
      run: { ...base.run, pilot: { ...base.run.pilot, relics: ['turning_point'] } },
    };

    const before = combatOf(carrying).focus;
    const after = playCard(carrying, combatOf(carrying).hand[0]!.uid, null);

    expect(combatOf(after).stance, 'the card should have changed stance').not.toBe(
      combatOf(carrying).stance,
    );
    expect(combatOf(after).focus, 'Turning Point did not fire').toBe(before + 2);
  });

  it('keeps Energy the rarest thing on the list', () => {
    // Energy multiplies the whole deck rather than adding to it, so a common
    // that granted one would flatten the entire ladder above it.
    for (const def of relicTable.all()) {
      if ((def.passive?.energyPerTurn ?? 0) <= 0) continue;
      expect(['legendary', 'artifact'], `${def.id} is too cheap for +Energy`).toContain(def.rarity);
    }
  });
});

describe('passives reach the number they modify', () => {
  it('adds flat damage inside the pipeline, where the preview can see it', () => {
    const base = makeFight({ stance: 'guard' });
    const armed = holding(base, 'whetted_edge');
    const enemy = firstEnemy(base);
    const shape = {
      amount: 10,
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 1,
      consumesFocus: false,
    } as const;

    // Read from the definition rather than hard-coding 2. These assertions are
    // about the passive reaching the pipeline, not about what it is tuned to,
    // and a retune should not fail a test that is checking the plumbing.
    const edge = relicTable.get('whetted_edge').passive?.damageFlat ?? 0;
    expect(computeDamage(armed, shape).beforeBlock).toBe(
      computeDamage(base, shape).beforeBlock + edge,
    );
    expect(previewDamage(armed, shape)).toEqual(computeDamage(armed, shape));
  });

  it('soaks incoming damage, and never below zero', () => {
    const base = makeFight({ stance: 'guard' });
    const armed = holding(base, 'ceramic_underplate');
    const enemy = firstEnemy(base);
    const shape = {
      attacker: enemyTarget(enemy.uid),
      target: PLAYER,
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: false,
    } as const;

    expect(computeDamage(armed, { ...shape, amount: 9 }).beforeBlock).toBe(7);
    expect(computeDamage(armed, { ...shape, amount: 1 }).beforeBlock).toBe(0);
  });

  it('raises Energy and draw at the start of the turn', () => {
    const base = startPlayerTurn(makeFight({ drawPile: Array.from({ length: 20 }, () => 'hairline') }));
    const armed = startPlayerTurn(
      holding(makeFight({ drawPile: Array.from({ length: 20 }, () => 'hairline') }), 'second_reactor', 'wide_aperture'),
    );

    expect(combatOf(armed).energy).toBe(PLAYER_BALANCE.energyPerTurn + 1);
    expect(combatOf(armed).hand.length).toBe(combatOf(base).hand.length + 1);
  });

  it('grants Block and Focus at the start of the turn', () => {
    const armed = startPlayerTurn(holding(makeFight(), 'ballast_weave', 'breath_marker'));
    expect(combatOf(armed).block).toBeGreaterThanOrEqual(3);
    expect(combatOf(armed).focus).toBeGreaterThanOrEqual(1);
  });

  it('moves the overheat threshold', () => {
    const base = makeFight();
    expect(overheatThreshold(holding(base, 'heat_shroud'))).toBe(overheatThreshold(base) + 2);
  });

  it('sharpens Focus on top of whatever the stance already pays', () => {
    const base = makeFight({ stance: 'iai' });
    const armed = holding(base, 'drawn_string');
    const sharpen = relicTable.get('drawn_string').passive?.focusPerStackBonus ?? 0;
    expect(liveStance(armed).focusPerStack).toBe(liveStance(base).focusPerStack + sharpen);
  });

  it('adds up rather than letting the last one win', () => {
    const armed = holding(makeFight(), 'whetted_edge', 'coldforge_lining');
    const summed =
      (relicTable.get('whetted_edge').passive?.damageFlat ?? 0) +
      (relicTable.get('coldforge_lining').passive?.damageFlat ?? 0);
    expect(pilotRules(armed).damageFlat).toBe(summed);
  });
});

describe('where relics come from', () => {
  it('offers three at an Elite and at an act finale, and none from a normal fight', () => {
    // Elites drop one *because* the first relic used to arrive at the end of
    // Act 1 — so for the whole first act the player was the same character they
    // started as, with a deck that had only got bigger. This assertion is the
    // power curve's floor: if it ever goes back to boss-only, that returns.
    const state = applyAction(createInitialState('RELICS'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');

    expect(rollRelics(run.rng, run, 'combat').relicIds).toEqual([]);
    expect(rollRelics(run.rng, run, 'elite').relicIds).toHaveLength(REWARDS.relicChoices);
    expect(rollRelics(run.rng, run, 'boss').relicIds).toHaveLength(REWARDS.relicChoices);
  });

  it('never offers one twice on the same screen, or one you already carry', () => {
    const state = applyAction(createInitialState('RELICS2'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');

    const first = rollRelics(run.rng, run, 'boss').relicIds;
    expect(new Set(first).size).toBe(first.length);

    const held = { ...run, pilot: { ...run.pilot, relics: [...first] } };
    for (const id of rollRelics(run.rng, held, 'boss').relicIds) {
      expect(first, 'offered a relic already carried').not.toContain(id);
    }
  });

  it('no longer hands out a Stance Mastery for beating a boss', () => {
    // Robin's call: the act finale should be a decision about the rest of the
    // run, and a mandatory stance rewrite is not one. Masteries are shop stock.
    const state = applyAction(createInitialState('NOMASTERY'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');
    expect(rollMastery(run.rng, run, 'shop').masteryId).not.toBeNull();
  });
});
