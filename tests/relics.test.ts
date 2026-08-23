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
import { createInitialState, createRunState } from '../src/engine/state.ts';
import { applyAction } from '../src/engine/reducer.ts';
import { HOOK_NAMES, handlersFor } from '../src/engine/hooks.ts';
import { createRng } from '../src/engine/rng.ts';
import { rollRelics, rollMastery, rollReward } from '../src/engine/run/rewards.ts';
import { computeDamage, previewDamage, PLAYER, enemyTarget } from '../src/engine/combat/damage.ts';
import { playCard, startPlayerTurn } from '../src/engine/combat/combat.ts';
import { overheatThreshold } from '../src/engine/combat/heat.ts';
import { pilotRules, liveStance } from '../src/engine/combat/rules.ts';
import { PLAYER as PLAYER_BALANCE, RELIC_RARITY_WEIGHTS, REWARDS } from '../src/content/balance.ts';
import { reloadContent } from '../src/content/index.ts';
import {
  cards as cardTable,
  implants as implantTable,
  relics as relicTable,
} from '../src/content/registry.ts';
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
  it('can actually offer every relic it ships', () => {
    /* The test that was missing, and its absence cost three legendary relics
       and the artifact.

       Relics used to share `RARITY_WEIGHTS` with cards. Zeroing the top two
       tiers to gate legendary CARDS behind the Reliquary silently made every
       legendary relic unrollable, and nothing failed — no test asserted that a
       shipped relic could be reached. The artifact had been unobtainable for
       longer still, filtered out by a rule that skipped any tier holding fewer
       than three relics, which the artifact tier never will.

       Rolled rather than reasoned about, because the failure was in the
       interaction between a weight table, a pool filter and a tier filter, and
       reading any one of them alone looked fine. */
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      for (const act of [1, 2, 3] as const) {
        const run = createRunState(`RELIC-${i}`, 0);
        const rolled = rollRelics(createRng(`RELIC-${i}-${act}`), { ...run, act }, 'elite');
        for (const id of rolled.relicIds) seen.add(id);
      }
    }

    const missing = relicTable.all().filter((def) => !seen.has(def.id));
    expect(missing.map((def) => `${def.id} (${def.rarity})`)).toEqual([]);
  });

  it('keeps the top tiers scarce rather than hidden', () => {
    // The artifact is reachable, and it is meant to stay a once-in-many-runs
    // thing — by weight, not by a filter that removes it from the game.
    for (const act of [1, 2, 3] as const) {
      const weights = RELIC_RARITY_WEIGHTS[act];
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      expect(weights.artifact, `act ${act} artifact weight`).toBeGreaterThan(0);
      expect(weights.artifact / total, `act ${act} artifact share`).toBeLessThan(0.05);
      expect(weights.legendary, `act ${act} legendary weight`).toBeGreaterThan(0);
    }
  });

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
    expect(combatOf(after).focus, 'Turning Point did not fire').toBe(before + 1);
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

  it('grants Block at the start of the turn', () => {
    const armed = startPlayerTurn(holding(makeFight(), 'ballast_weave'));
    expect(combatOf(armed).block).toBeGreaterThanOrEqual(3);
  });

  it('trades Heat for Focus, and only when there is Heat', () => {
    /* Exchange Coil is a conversion. As two independent passives it vented 1
       and granted 1 whether or not there was anything on the gauge, which is
       free Focus every turn in a cold deck — not what the name says, and not
       what a rare is priced for. */
    const hot = startPlayerTurn(holding(makeFight({ heat: 4 }), 'exchange_coil'));
    expect(combatOf(hot).focus, 'no Focus from a hot gauge').toBeGreaterThanOrEqual(1);
    expect(combatOf(hot).heat, 'the Heat was not spent').toBeLessThan(4);

    const cold = startPlayerTurn(holding(makeFight({ heat: 0 }), 'exchange_coil'));
    expect(combatOf(cold).focus, 'Focus out of nothing').toBe(0);
  });

  it('moves the overheat threshold', () => {
    const base = makeFight();
    // Read from the relic rather than hard-coded, so tuning the number is a
    // one-file change instead of a two-file one.
    const shroud = relicTable.get('heat_shroud').passive?.overheatThreshold ?? 0;
    expect(shroud).toBeGreaterThan(0);
    expect(overheatThreshold(holding(base, 'heat_shroud'))).toBe(overheatThreshold(base) + shroud);
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

describe('the end of a fight', () => {
  /* `onCombatEnd` fired from `concludeCombat`, which was the M1 flow — a win
     ended the run, because there was no map to return to yet. M2 replaced it
     with `settleCombat` in the reducer and left the old function exported and
     uncalled. It was the only thing firing the hook, so the hook silently
     stopped happening and Ash Rosary, the only relic that uses it, had never
     healed anybody.

     Nothing objected. The relic validated, its handler registered, its text
     read correctly on the screen, and the hook it hangs off was simply never
     rung. So these tests go through `applyAction` — the door the game actually
     uses — rather than calling the hook directly, which is the mistake that
     let it hide. */

  function hurtFightAlmostWon(relic: string): GameState {
    const base = holding(makeFight({ enemyIds: ['cinder_wisp'], hand: ['iai_slash'] }), relic);
    if (base.run === null || base.run.combat === null) throw new Error('test: no fight');
    return {
      ...base,
      run: {
        ...base.run,
        pilot: { ...base.run.pilot, health: 30 },
        // One point left on the only enemy, so any attack ends it.
        combat: {
          ...base.run.combat,
          enemies: base.run.combat.enemies.map((enemy) => ({ ...enemy, hp: 1 })),
        },
      },
    };
  }

  it('rings onCombatEnd through the reducer, not just in theory', () => {
    const before = hurtFightAlmostWon('ash_rosary');
    const hp = before.run?.pilot.health ?? 0;

    const enemyUid = before.run?.combat?.enemies[0]?.uid ?? '';
    const cardUid = before.run?.combat?.hand[0]?.uid ?? '';
    const after = applyAction(before, { kind: 'playCard', cardUid, targetUid: enemyUid });

    // The fight really ended: the run is on the reward screen, not still in it.
    expect(after.run?.screen, 'the fight did not end').toBe('reward');
    expect(after.run?.pilot.health, 'Ash Rosary healed nothing').toBe(hp + 4);
  });

  it('pays nothing on the fight that killed you', () => {
    // The relic's own judgement, and the reason the hook fires on both
    // outcomes rather than only on a win.
    const base = holding(makeFight({ enemyIds: ['cinder_wisp'], hand: ['iai_slash'] }), 'ash_rosary');
    if (base.run === null || base.run.combat === null) throw new Error('test: no fight');
    const doomed: GameState = {
      ...base,
      run: {
        ...base.run,
        pilot: { ...base.run.pilot, health: 1 },
        combat: { ...base.run.combat, outcome: 'lost' as const },
      },
    };
    const settled = applyAction(doomed, { kind: 'endTurn' });
    expect(settled.run?.pilot.health).toBe(1);
  });
});

describe('what a boss hands you', () => {
  /* An act finale is the one place the run is allowed to change twice: relics
     are what a turn can DO, implants are what a card is WORTH, and asking both
     in the same breath is most of what makes a boss read as a chapter ending
     rather than a bigger enemy.

     The tier is fixed rather than rolled. A finale that offers an uncommon is
     the boss telling you the last hour did not matter, and a rolled tier means
     the three fights that end the three acts are not comparable to each other. */

  const run = createRunState('BOSS', 0);

  it('offers three epic cards, three epic relics and three epic implants', () => {
    const { offer } = rollReward(createRng('BOSS-A'), run, 1, 50, 0, 'boss');
    expect(offer.cardIds).toHaveLength(REWARDS.cardChoices);
    expect(offer.relicIds).toHaveLength(REWARDS.relicChoices);
    expect(offer.implantIds).toHaveLength(REWARDS.implantChoices);
    for (const id of offer.cardIds) {
      expect(cardTable.get(id).rarity, id).toBe(REWARDS.bossOfferRarity);
    }
    for (const id of offer.relicIds) {
      expect(relicTable.get(id).rarity, id).toBe(REWARDS.bossOfferRarity);
    }
    for (const id of offer.implantIds) {
      expect(implantTable.get(id).rarity, id).toBe(REWARDS.bossOfferRarity);
    }
  });

  it('offers no two of the same thing', () => {
    for (const seed of ['A', 'B', 'C', 'D', 'E']) {
      const { offer } = rollReward(createRng(`BOSS-${seed}`), run, 2, 50, 0, 'boss');
      expect(new Set(offer.cardIds).size).toBe(offer.cardIds.length);
      expect(new Set(offer.relicIds).size).toBe(offer.relicIds.length);
      expect(new Set(offer.implantIds).size).toBe(offer.implantIds.length);
    }
  });

  it('is one of each, not all of each', () => {
    /* Three offered, one taken, on all three rows. The offer arrays are what is
       on the table; the `taken` fields are what leaves with you. */
    let state = createInitialState('BOSS-PICK');
    const { offer } = rollReward(createRng('BOSS-PICK'), run, 1, 50, 0, 'boss');
    state = {
      ...state,
      run: { ...run, screen: 'reward' as const, pendingReward: { ...offer } },
    };

    const [firstCard, secondCard] = offer.cardIds;
    if (firstCard === undefined || secondCard === undefined) throw new Error('test: short offer');

    state = applyAction(state, { kind: 'takeRewardCard', cardId: firstCard });
    state = applyAction(state, { kind: 'takeRewardCard', cardId: secondCard });
    expect(state.run?.pendingReward?.taken, 'a second card replaced the first').toEqual([
      secondCard,
    ]);

    const relic = offer.relicIds[0];
    const implant = offer.implantIds[0];
    if (relic === undefined || implant === undefined) throw new Error('test: short offer');
    state = applyAction(state, { kind: 'takeRewardRelic', relicId: relic });
    state = applyAction(state, { kind: 'takeRewardImplant', implantId: implant });
    expect(state.run?.pendingReward?.takenRelic).toBe(relic);
    expect(state.run?.pendingReward?.takenImplant).toBe(implant);
  });

  it('offers implants at a boss and nowhere else', () => {
    // Everywhere else an implant is bought at a Station with Alloy you wanted
    // for something else, which is the right price for what it does.
    for (const tier of ['combat', 'elite'] as const) {
      const { offer } = rollReward(createRng('NOT-BOSS'), run, 1, 50, 0, tier);
      expect(offer.implantIds, tier).toEqual([]);
    }
  });

  it('ships enough epics to fill both offers', () => {
    /* The guard that would have caught this before it shipped: the boss screen
       asks for three of each, and there was exactly one epic implant in the
       game — so the offer was a single card and nothing failed. */
    const epicRelics = relicTable.all().filter((def) => def.rarity === REWARDS.bossOfferRarity);
    const epicImplants = implantTable.all().filter((def) => def.rarity === REWARDS.bossOfferRarity);
    expect(epicRelics.length, 'epic relics').toBeGreaterThanOrEqual(REWARDS.relicChoices);
    expect(epicImplants.length, 'epic implants').toBeGreaterThanOrEqual(REWARDS.implantChoices);
  });
});
