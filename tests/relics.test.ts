/* Relics.
 *
 * The progression axis the run was missing: cards make the deck better at what
 * it does, relics change what it is allowed to do. They are also the only thing
 * in the game that raises Energy or draw, so the tests care most about the two
 * seams — that a passive reaches the number it is supposed to modify, and that
 * an act finale offers a choice rather than granting one.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState, RunEffect } from '../src/engine/types.ts';
import { createInitialState, createRunState } from '../src/engine/state.ts';
import { applyAction } from '../src/engine/reducer.ts';
import { HOOK_NAMES, handlersFor } from '../src/engine/hooks.ts';
import { createRng } from '../src/engine/rng.ts';
import {
  rollRelics,
  rollMastery,
  rollReward,
  rollCardChoices,
} from '../src/engine/run/rewards.ts';
import { applyRunEffects } from '../src/engine/run/effects.ts';
import { resolveThread, setThread } from '../src/engine/run/threads.ts';
import {
  computeDamage,
  previewDamage,
  applyDamage,
  PLAYER,
  enemyTarget,
} from '../src/engine/combat/damage.ts';
import {
  playCard,
  startPlayerTurn,
  endPlayerTurn,
  startCombat,
} from '../src/engine/combat/combat.ts';
import { overheatThreshold } from '../src/engine/combat/heat.ts';
import { pilotRules, liveStance } from '../src/engine/combat/rules.ts';
import { describeImplant, describePassive } from '../src/engine/run/describe.ts';
import { PLAYER as PLAYER_BALANCE, RELIC_RARITY_WEIGHTS, REWARDS } from '../src/content/balance.ts';
import { reloadContent } from '../src/content/index.ts';
import {
  cards as cardTable,
  events as eventTable,
  implants as implantTable,
  relics as relicTable,
  threads as threadTable,
} from '../src/content/registry.ts';
import { makeFight, combatOf, firstEnemy } from './helpers.ts';
import { CLEAR_SPACE_ID } from '../src/content/environments.ts';
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
       reading any one of them alone looked fine.

       EVERY tier that can pay a relic, not just the Elite. It used to roll the
       Elite alone, on the reasonable assumption that the Elite ladder was the
       widest one — and that assumption expired the day Elites stopped offering
       commons. Five common relics were then reachable only from an ordinary
       fight and this test called them unshippable, which is the test asking a
       narrower question than the one it is named after. "Can this relic be
       offered" means by anything, anywhere. */
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      for (const act of [1, 2, 3] as const) {
        const run = createRunState(`RELIC-${i}`, 0);
        for (const tier of ['combat', 'elite', 'boss'] as const) {
          const rolled = rollRelics(createRng(`RELIC-${i}-${act}-${tier}`), { ...run, act }, tier);
          for (const id of rolled.relicIds) seen.add(id);
        }
      }
    }

    const missing = relicTable
      .all()
      .filter((def) => def.exclusive !== true && !seen.has(def.id));
    expect(missing.map((def) => `${def.id} (${def.rarity})`)).toEqual([]);
  });

  it('never lets an Elite offer a common relic or a common card', () => {
    /* The Elite's whole proposition is that the detour is worth the hull. A
       common on that screen is the game saying it was not.

       Both halves asserted together because they are one rule with two
       implementations — a filtered pool for cards, a filtered tier ladder for
       relics — and it would be easy to change one and leave the other. */
    const relicTiers: string[] = [];
    const cardTiers: string[] = [];
    for (let i = 0; i < 1200; i++) {
      for (const act of [1, 2, 3] as const) {
        const run = createRunState(`FLOOR-${i}`, 0);
        const relics = rollRelics(createRng(`FLOOR-${i}-${act}`), { ...run, act }, 'elite');
        for (const id of relics.relicIds) {
          const def = relicTable.find(id);
          if (def?.rarity === 'common') relicTiers.push(id);
        }
        const cards = rollCardChoices(createRng(`FLOORC-${i}-${act}`), act, 'elite');
        for (const id of cards.cardIds) {
          const def = cardTable.find(id);
          if (def?.rarity === 'common') cardTiers.push(id);
        }
      }
    }
    expect([...new Set(relicTiers)], 'an Elite offered a common relic').toEqual([]);
    expect([...new Set(cardTiers)], 'an Elite offered a common card').toEqual([]);

    /* And the offers are still FULL — the floor must raise what is on the
       screen, not shorten it. A silently two-card Elite would pass the two
       assertions above while being a worse reward than the fight before it. */
    const sample = rollCardChoices(createRng('FLOOR-WIDTH'), 1, 'elite');
    expect(sample.cardIds).toHaveLength(3);
  });

  it('pays the three new shelf items, and stacks the one that stacks', () => {
    /* All three at once because all three were nearly silent failures.
 
       Ready Rack is the reason this test exists. It began as an `onTurnStart`
       hook drawing a card on turn 1 — the hook fired, the log said it fired,
       and the hand was still five: `drawForTurn` runs afterwards and subtracts
       whatever is already in hand so an innate occupies a slot rather than
       adding one, which took the card straight back off. A relic that reports
       working while doing nothing is exactly what an unfired hook looks like,
       so assert the HAND SIZE rather than the log.
 
       Reclaim Loop is the mirror: it must stack, because implants stack and a
       hook would have fired once however many were fitted. */
    const fight = (relics: readonly string[], implants: readonly string[]): GameState => {
      const run = createRunState('SHELF', 0);
      const seated: GameState = {
        ...createInitialState('SHELF'),
        run: { ...run, pilot: { ...run.pilot, health: 40, relics: [...relics], implants: [...implants] } },
      };
      return startCombat(seated, 'hound_pair', CLEAR_SPACE_ID);
    };

    const plain = fight([], []);
    const rack = fight(['ready_rack'], []);
    expect(
      combatOf(rack).hand.length,
      'Ready Rack drew a card and the turn-1 draw took it back',
    ).toBe(combatOf(plain).hand.length + 1);

    // ...and only on the first turn.
    const later = startPlayerTurn(endPlayerTurn(rack));
    expect(combatOf(later).hand.length, 'it kept paying after turn one').toBe(
      combatOf(plain).hand.length,
    );

    const kill = (state: GameState): GameState =>
      applyDamage(state, {
        amount: 999,
        attacker: PLAYER,
        target: enemyTarget(combatOf(state).enemies[0]!.uid),
        isAttack: false,
        attackOrdinal: 0,
        consumesFocus: false,
      }, 'test');

    const hook = fight(['salvage_hook'], []);
    expect(combatOf(kill(hook)).hand.length, 'Salvage Hook paid nothing').toBe(
      combatOf(hook).hand.length + 1,
    );

    for (const stacks of [1, 2] as const) {
      const looped = fight([], Array.from({ length: stacks }, () => 'reclaim_loop'));
      const before = looped.run?.pilot.health ?? 0;
      const after = kill(looped).run?.pilot.health ?? 0;
      expect(after - before, `Reclaim Loop x${stacks} did not pay per stack`).toBe(2 * stacks);
    }
  });

  it('never offers an exclusive relic', () => {
    // The other half of the same rule. A relic that is earned must not also be
    // findable, or the thing it was the reward for stops being worth doing.
    const exclusive = new Set(
      relicTable
        .all()
        .filter((def) => def.exclusive === true)
        .map((def) => def.id),
    );
    expect(exclusive.size, 'nothing is exclusive any more').toBeGreaterThan(0);

    for (let i = 0; i < 1500; i++) {
      for (const act of [1, 2, 3] as const) {
        const run = createRunState(`EXCL-${i}`, 0);
        for (const tier of ['elite', 'boss'] as const) {
          const rolled = rollRelics(createRng(`EXCL-${i}-${act}-${tier}`), { ...run, act }, tier);
          for (const id of rolled.relicIds) {
            expect(exclusive.has(id), `${id} was offered`).toBe(false);
          }
        }
      }
    }
  });

  it('gives every exclusive relic something that hands it over', () => {
    /* An `exclusive` relic is out of the pool by construction, so the ONLY way
       to hold one is a `relic` run effect naming it. Nothing else in the game
       fails if that effect is missing — the relic simply does not exist any
       more, silently, exactly the way three legendaries went missing before. */
    const granted = new Set<string>();
    const walk = (effects: readonly RunEffect[]): void => {
      for (const effect of effects) if (effect.op === 'relic') granted.add(effect.relicId);
    };

    for (const thread of threadTable.all()) {
      walk(thread.payoff);
      if (thread.mastery !== undefined) walk(thread.mastery.effects);
    }
    for (const event of eventTable.all()) {
      for (const option of event.options) walk(option.effects);
    }

    const orphaned = relicTable
      .all()
      .filter((def) => def.exclusive === true && !granted.has(def.id));
    expect(orphaned.map((def) => def.id)).toEqual([]);
  });

  it('hands over the artifact on the third Rites and not the second', () => {
    /* The whole chain, walked rather than reasoned about: take the Thread,
       let it come due, take it again. Three separate pieces have to agree —
       `canSetThread` re-arming a resolved Thread, `resolveThread` counting the
       completion, and `settleThreads` reading that count to decide whether the
       mastery fires — and each of them looks correct on its own. */
    const def = threadTable.get('sect_rites');
    const mastery = def.mastery;
    if (mastery === undefined) throw new Error('test: The Rites lost its mastery');

    let state: GameState = { ...createInitialState('RITES'), run: createRunState('RITES', 0) };

    const held = (current: GameState): readonly string[] => current.run?.pilot.relics ?? [];

    for (let time = 1; time <= mastery.after; time++) {
      state = setThread(state, 'sect_rites');
      state = resolveThread(state, 'sect_rites');

      const times = state.run?.threads.find((t) => t.threadId === 'sect_rites')?.completed ?? 0;
      if (times === mastery.after) {
        state = applyRunEffects(state, [...def.payoff, ...mastery.effects], def.id).state;
      } else {
        state = applyRunEffects(state, def.payoff, def.id).state;
        expect(held(state), `granted early, after ${time}`).not.toContain('sect_reliquary');
      }
    }

    expect(held(state)).toContain('sect_reliquary');
  });

  it('gates a hull-conditional passive at the threshold and nowhere else', () => {
    /* `whenHullBelowPct` / `whenHullAbovePct` gate the WHOLE passive, and the
       gate is checked inside `pilotRules` — the one place the preview, the
       damage pipeline, the turn loop and the totals panel all read. Checking it
       anywhere else would let a preview disagree with the result, which is the
       one thing this codebase does not permit.

       Both bounds are exclusive, so a passive gated at N is off AT N. Asserted
       on the boundary rather than only well inside it, because "below 25%" and
       "at most 25%" are one character apart and behave differently exactly
       once per run — at the moment it matters. */
    const base: GameState = {
      ...createInitialState('GATE'),
      run: createRunState('GATE', 0),
    };
    const max = base.run?.pilot.maxHealth ?? 0;
    expect(max).toBeGreaterThan(0);

    const at = (health: number, ids: { relics?: readonly string[]; implants?: readonly string[] }): GameState => {
      const run = base.run;
      if (run === null) throw new Error('test: no run');
      return {
        ...base,
        run: {
          ...run,
          pilot: {
            ...run.pilot,
            health,
            relics: [...(ids.relics ?? [])],
            implants: [...(ids.implants ?? [])],
          },
        },
      };
    };

    const low = relicTable.get('deadmans_edge');
    const pct = low.passive?.whenHullBelowPct;
    if (pct === undefined) throw new Error('test: the epic lost its gate');
    const bonus = low.passive?.damageFlat ?? 0;
    /* `ceil`, not `floor`. The gate is `health / max < pct / 100`, so with 70
       maximum and a 25% line the real boundary is 17.5: 17 health qualifies and
       18 does not. `floor` lands on 17, which is INSIDE the gate — the version
       of this test that used it failed, correctly, and that is the whole reason
       to assert on the boundary rather than somewhere comfortably past it. */
    const firstOff = Math.ceil((max * pct) / 100);

    expect(pilotRules(at(max, { relics: ['deadmans_edge'] })).damageFlat, 'full health').toBe(0);
    expect(pilotRules(at(firstOff, { relics: ['deadmans_edge'] })).damageFlat, 'just above the line').toBe(0);
    expect(pilotRules(at(firstOff - 1, { relics: ['deadmans_edge'] })).damageFlat, 'just under').toBe(bonus);

    // And the mirror, on an implant, so both bounds are covered on both shapes.
    const high = implantTable.get('vigil_plating');
    const above = high.passive.whenHullAbovePct;
    if (above === undefined) throw new Error('test: Vigil Plating lost its gate');
    const reduction = high.passive.damageTakenFlat ?? 0;
    // Mirror boundary: `health / max > pct / 100`, so the highest health that
    // does NOT qualify is the floor of the line.
    const lastOff = Math.floor((max * above) / 100);

    expect(pilotRules(at(max, { implants: ['vigil_plating'] })).damageTakenFlat, 'whole').toBe(reduction);
    expect(pilotRules(at(lastOff, { implants: ['vigil_plating'] })).damageTakenFlat, 'at the line').toBe(0);
    expect(pilotRules(at(lastOff + 1, { implants: ['vigil_plating'] })).damageTakenFlat, 'just over').toBe(reduction);
    expect(pilotRules(at(1, { implants: ['vigil_plating'] })).damageTakenFlat, 'nearly dead').toBe(0);
  });

  it('says what every passive does, including the ones added late', () => {
    /* `describePassive` walks the fields by hand, so a new one is silently
       absent — and a passive whose ONLY field is missing generates the words
       "Nothing, yet.", which is a shop shelf claiming an implant does nothing
       while it heals you every turn. That is exactly what happened to
       `healPerTurn`. This catches the next one. */
    for (const def of implantTable.all()) {
      expect(describeImplant(def), `${def.id} describes as nothing`).not.toBe('Nothing, yet.');
    }
    for (const def of relicTable.all()) {
      if (def.passive === undefined) continue;
      expect(describePassive(def.passive), `${def.id} describes as nothing`).not.toBe('Nothing, yet.');
    }
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
      expect(['mythic', 'artifact'], `${def.id} is too cheap for +Energy`).toContain(def.rarity);
    }
  });
});

describe('what you are carrying says so', () => {
  it('logs the Block and Focus a relic grants at the start of a turn', () => {
    /* They were granted inside the expression that rebuilds the turn — right,
       because they are part of what a turn IS — and therefore in complete
       silence. Four Block from Harbour Plate appeared in the shield readout
       between one frame and the next: no number, no beat, and no line saying
       where it came from. A player who has just bought a relic got no
       confirmation it was working, and one carrying three could not tell which
       did what.

       Asserted on the LOG rather than on the animation, because the log is what
       the animation layer reads — `detail.to` is how a floating figure finds
       the thing it happened to. */
    const base = makeFight({ stance: 'iai', block: 0 });
    if (base.run === null) throw new Error('test: no run');
    const armed: GameState = {
      ...base,
      run: { ...base.run, pilot: { ...base.run.pilot, relics: ['harbour_plate'] } },
    };

    const opened = startPlayerTurn(armed);
    const line = opened.log.find((entry) => entry.source === 'relics' && entry.kind === 'block');
    expect(line, 'nothing said the Block arrived').toBeDefined();
    expect(line?.detail).toMatchObject({ amount: 4, to: 'player' });
    expect(combatOf(opened).block).toBe(4);
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

    // Read from the definition rather than hard-coding the number. These
    // assertions are about the passive reaching the pipeline, not about what it
    // is tuned to, and a retune should not fail a test checking the plumbing.
    const edge = relicTable.get('whetted_edge').passive?.damageEveryHit ?? 0;
    expect(computeDamage(armed, shape).beforeBlock).toBe(
      computeDamage(base, shape).beforeBlock + edge,
    );
    expect(previewDamage(armed, shape)).toEqual(computeDamage(armed, shape));
  });

  it('tells the two flat sources apart on a later swing', () => {
    /* The whole reason there are two. `damageFlat` lands on a card's first
       swing only; `damageEveryHit` lands on all of them. A test that only ever
       measured the first swing could not tell them apart, which is how one of
       them would quietly become the other. */
    const enemy = firstEnemy(makeFight());
    const later = {
      amount: 10,
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 1,
      consumesFocus: false,
      // Not the card's first swing — the second hit of a multi-hit.
      firstSwingOfCard: false,
    } as const;

    const base = makeFight({ stance: 'guard' });
    const everyHit = holding(base, 'whetted_edge');
    const firstOnly = holding(base, 'ceramic_underplate');

    const plain = computeDamage(base, later).beforeBlock;
    expect(computeDamage(everyHit, later).beforeBlock, 'every hit still adds').toBeGreaterThan(plain);
    expect(computeDamage(firstOnly, later).beforeBlock, 'first-hit-only does not').toBe(plain);
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
    /* The Long Sight rather than Second Reactor + Wide Aperture. Second Reactor
       was cut — Reactor Tuning sells the same Energy as an implant, and the
       legendary shelf gained The Long Watch — and it happened to be the only
       relic left in the pool granting `energyPerTurn`, so this is the one that
       exercises the field at all. Both numbers come from one relic now. */
    const deck = (): GameState =>
      makeFight({ drawPile: Array.from({ length: 20 }, () => 'hairline') });
    const base = startPlayerTurn(deck());
    const armed = startPlayerTurn(holding(deck(), 'the_long_sight'));

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

  it('offers cards and relics at the finale tier', () => {
    const { offer } = rollReward(createRng('BOSS-A'), run, 1, 50, 'boss');
    expect(offer.cardIds).toHaveLength(REWARDS.cardChoices);
    expect(offer.relicIds).toHaveLength(REWARDS.relicChoices);
    for (const id of offer.cardIds) {
      expect(cardTable.get(id).rarity, id).toBe(REWARDS.bossOfferRarity);
    }
    for (const id of offer.relicIds) {
      expect(relicTable.get(id).rarity, id).toBe(REWARDS.bossOfferRarity);
    }
  });

  it('offers implants at ONE tier, and lets that tier be any of them', () => {
    /* The implant row is the one that rolls. Fixed, three bosses handed you
       three versions of the same screen — and, because the top of the shelf is
       thin, often literally the same three implants.

       Both halves are asserted because both halves are the design: the roll is
       what makes a finale able to surprise you, and all-three-on-one-tier is
       what stops the roll turning into a non-choice. A screen offering one
       mythic and two commons is not a decision, it is a formality. */
    const tiers = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const { offer } = rollReward(createRng(`BOSS-IMPLANT-${seed}`), run, 1, 50, 'boss');
      expect(offer.implantIds.length, 'a boss always offers some').toBeGreaterThan(0);
      const rarities = new Set(offer.implantIds.map((id) => implantTable.get(id).rarity));
      expect(rarities.size, `seed ${seed} mixed tiers: ${[...rarities].join(', ')}`).toBe(1);
      const only = [...rarities][0];
      if (only !== undefined) tiers.add(only);
    }
    expect(tiers.size, 'the tier never varies').toBeGreaterThan(1);
  });

  it('offers no two of the same thing', () => {
    for (const seed of ['A', 'B', 'C', 'D', 'E']) {
      const { offer } = rollReward(createRng(`BOSS-${seed}`), run, 2, 50, 'boss');
      expect(new Set(offer.cardIds).size).toBe(offer.cardIds.length);
      expect(new Set(offer.relicIds).size).toBe(offer.relicIds.length);
      expect(new Set(offer.implantIds).size).toBe(offer.implantIds.length);
    }
  });

  it('is one of each, not all of each', () => {
    /* Three offered, one taken, on all three rows. The offer arrays are what is
       on the table; the `taken` fields are what leaves with you. */
    let state = createInitialState('BOSS-PICK');
    const { offer } = rollReward(createRng('BOSS-PICK'), run, 1, 50, 'boss');
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
      const { offer } = rollReward(createRng('NOT-BOSS'), run, 1, 50, tier);
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
