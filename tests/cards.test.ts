/* Generated rules text, and the starting deck.
 *
 * The point of `describeCard` is that text cannot drift from behaviour, so
 * these tests assert the text is derived — change a number in the card data
 * and the string changes with it, with nobody editing a second place.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { CardDef, EffectOp } from '../src/engine/types.ts';
import { describeCard, describeRider, riderIsLive } from '../src/engine/combat/describe.ts';
import { definitionOf, playCard } from '../src/engine/combat/combat.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import { makeFight, combatOf, firstEnemy } from './helpers.ts';
import type { GameState } from '../src/engine/types.ts';
import { JETTISON } from '../src/content/cards/discard.ts';
import { STILLWATER_GUARD } from '../src/content/cards/focus.ts';
import { SCALD } from '../src/content/statuses.ts';
import { statuses as statusTable } from '../src/content/registry.ts';
import {
  FANNED_CUT,
  IAI_SLASH,
  SEVER,
  SOLAR_PARRY,
  STARTING_DECK,
  VECTOR_STEP,
} from '../src/content/cards/basic.ts';
import { PLAYER, RARITY_WEIGHTS } from '../src/content/balance.ts';
import type { Rarity } from '../src/engine/types.ts';
import { RARITY_ORDER } from '../src/engine/types.ts';
import { offerableCards, rollCardChoices } from '../src/engine/run/rewards.ts';

beforeEach(() => {
  reloadContent();
});

function def(id: string): CardDef {
  return cardTable.get(id);
}

describe('the starting deck', () => {
  it('is twelve cards, and two of them are not attacks or blocks', () => {
    expect(STARTING_DECK).toHaveLength(PLAYER.startingDeckSize);
    const counts = STARTING_DECK.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts[IAI_SLASH]).toBe(3);
    expect(counts[SOLAR_PARRY]).toBe(3);
    expect(counts[VECTOR_STEP]).toBe(2);
    expect(counts[SEVER]).toBe(1);
    // One AoE from the start: the opening deck had no answer to two enemies at
    // all, so the first pack fight was five single-target swings at two health
    // bars and "hit the same one twice" is not a decision.
    expect(counts[FANNED_CUT]).toBe(1);

    /* The two that answer a different question. A deck where eleven of twelve
       cards do damage or absorb it can deal a hand of five that are four ways
       to do the thing you had already decided not to do. */
    expect(counts[JETTISON], 'a way out of a dead hand').toBe(1);
    expect(counts[STILLWATER_GUARD], 'a way off the gauge').toBe(1);
  });

  it('carries its own answer to Scald before the player meets Scald', () => {
    /* Stillwater Guard vents 2, which is exactly the threshold that sheds a
       stack. It is not a coincidence worth relying on silently — if either
       number moves, the opening deck quietly stops having a reply to a status
       that never decays. */
    const guard = cardTable.get(STILLWATER_GUARD);
    const vent = guard.effects.reduce(
      (sum, op) => sum + (op.op === 'ventHeat' ? op.amount : 0),
      0,
    );
    const sheds = statusTable.get(SCALD).shedOnVent ?? Number.POSITIVE_INFINITY;
    expect(vent).toBeGreaterThanOrEqual(sheds);
  });

  it('names only cards that exist', () => {
    for (const id of STARTING_DECK) expect(cardTable.has(id)).toBe(true);
  });

  it('has no engine in it — nothing draws more than one card', () => {
    // Act 1's "weak" beat is manufactured here. If this starts failing, the
    // opening deck has quietly grown a motor.
    for (const id of new Set(STARTING_DECK)) {
      const draws = def(id).effects.filter((op) => op.op === 'draw');
      for (const op of draws) expect(op.op === 'draw' && op.amount).toBeLessThanOrEqual(1);
    }
  });
});

describe('generated rules text', () => {
  it('derives the base text from the ops', () => {
    expect(describeCard(def(IAI_SLASH))).toBe('Deal 6 damage.');
    expect(describeCard(def(SOLAR_PARRY))).toBe('Gain 6 Block.');
    expect(describeCard(def(VECTOR_STEP))).toBe('Change stance. Draw 1 card.');
    expect(describeCard(def(SEVER))).toBe('Deal 14 damage. Gain 3 Heat.');
  });

  it('derives the rider separately, so the UI can grey it', () => {
    expect(describeRider(def(IAI_SLASH))).toBe('Deal 2 damage.');
    // Solar Shield's GUARD rider is the debuff alone — stacking Block on Block
    // made the stance the only place the card was worth playing.
    expect(describeRider(def(SOLAR_PARRY))).toBe('Apply 1 Weak.');
    expect(describeRider(def(VECTOR_STEP))).toBeNull();
  });

  it('follows the numbers when the card is upgraded', () => {
    // 8 and 4: the upgrade leans on the stance rather than the base number.
    const upgraded = definitionOf({ uid: 'x', defId: IAI_SLASH, upgraded: true });
    expect(describeCard(upgraded)).toBe('Deal 8 damage.');
    expect(describeRider(upgraded)).toBe('Deal 4 damage.');
  });

  it('knows whether the rider is live in the current stance', () => {
    const iai = makeFight({ stance: 'iai' });
    const guard = makeFight({ stance: 'guard' });
    expect(riderIsLive(def(IAI_SLASH), iai)).toBe(true);
    expect(riderIsLive(def(IAI_SLASH), guard)).toBe(false);
    expect(riderIsLive(def(SOLAR_PARRY), guard)).toBe(true);
  });

  it('spells out multi-hit and status names', () => {
    expect(
      describeCard({
        ...def(IAI_SLASH),
        effects: [
          { op: 'damage', amount: 5, target: 'enemy', times: 3 },
          { op: 'applyStatus', status: 'vulnerable', stacks: 2, target: 'allEnemies' },
        ],
      }),
    ).toBe('Deal 5 damage 3 times. Apply 2 Vulnerable to all enemies.');
  });

  it('renders a conditional as a sentence', () => {
    expect(
      describeCard({
        ...def(IAI_SLASH),
        effects: [
          {
            op: 'conditional',
            when: { kind: 'heatAtLeast', value: 6 },
            then: [{ op: 'damage', amount: 12, target: 'enemy' }],
            else: [{ op: 'damage', amount: 6, target: 'enemy' }],
          },
        ],
      }),
    ).toBe('If Heat is 6 or more, deal 12 damage. Otherwise deal 6 damage.');
  });

  it('resolves scaling against live state when given it', () => {
    const hot = makeFight({ heat: 6 });
    const text = describeCard(
      {
        ...def(IAI_SLASH),
        effects: [{ op: 'scaleWith', source: 'currentHeat', per: 2, then: [{ op: 'damage', amount: 3, target: 'enemy' }] }],
      },
      hot,
    );
    // "extra" only reads right after a base hit; with nothing before it, the
    // reader would be asking "extra to what?".
    expect(text).toBe('For every 2 Heat, deal 3 damage. (3x now)');
  });

  it('appends Exhaust and Innate', () => {
    expect(describeCard({ ...def(SEVER), exhaust: true })).toContain('Exhaust.');
    expect(describeCard({ ...def(SEVER), innate: true })).toContain('Innate.');
  });
});

describe('every shipped card', () => {
  it('produces non-empty text', () => {
    for (const card of cardTable.all()) {
      expect(describeCard(card).trim(), card.id).not.toBe('');
    }
  });

  it('has an upgrade that actually changes the text or the cost', () => {
    for (const card of cardTable.all()) {
      // Voided cards are the one exemption, and it is the definition of them:
      // a curse you could improve is a card you would eventually want.
      if (card.type === 'voided') continue;
      const upgraded = definitionOf({ uid: 'x', defId: card.id, upgraded: true });
      const changed =
        describeCard(upgraded) !== describeCard(card) ||
        describeRider(upgraded) !== describeRider(card) ||
        upgraded.cost !== card.cost;
      expect(changed, `${card.id} upgrades into something identical`).toBe(true);
    }
  });

  it('keeps the upgrade an upgrade — never a downgrade in name', () => {
    for (const card of cardTable.all()) {
      if (card.type === 'voided') continue;
      const upgraded = definitionOf({ uid: 'x', defId: card.id, upgraded: true });
      expect(upgraded.name, card.id).not.toBe('');
      expect(upgraded.rarity, `${card.id} changed rarity on upgrade`).toBe(card.rarity);
    }
  });
});

describe('the rarity ladder', () => {
  it('offers something at every tier above basic', () => {
    // A tier with nothing in it is a weight that silently rerolls, which makes
    // the reward distribution quietly different from the one in balance.ts.
    for (const rarity of RARITY_ORDER) {
      if (rarity === 'basic') continue;
      const count = cardTable.all().filter((card) => card.rarity === rarity).length;
      expect(count, `no cards at rarity '${rarity}'`).toBeGreaterThan(0);
    }
  });

  it('weights every tier the reward pool can actually produce', () => {
    /* Asserted against what `offerableCards` returns rather than against the
       whole ladder, because the ladder is deliberately wider than the roll:
       legendary and artifact exist and are unrollable, since the Reliquary is
       their only source. A weight for a tier with nothing in it would silently
       do nothing, and a tier with cards and no weight would silently never
       appear — this catches the second, which is the dangerous one. */
    // `basic` is filtered out by `offerableCards`, so this set only ever holds
    // rarities the weight table actually has a column for.
    const rollable = new Set(
      offerableCards().map((card) => card.rarity as Exclude<Rarity, 'basic'>),
    );
    expect(rollable.size).toBeGreaterThan(2);

    for (const act of [1, 2, 3] as const) {
      for (const rarity of rollable) {
        expect(
          RARITY_WEIGHTS[act][rarity],
          `act ${act} has no weight for '${rarity}'`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the top two tiers out of the roll entirely', () => {
    for (const act of [1, 2, 3] as const) {
      expect(RARITY_WEIGHTS[act].legendary, `act ${act}`).toBe(0);
      expect(RARITY_WEIGHTS[act].artifact, `act ${act}`).toBe(0);
    }
    for (const card of offerableCards()) {
      expect(card.rarity, `${card.id} is offerable`).not.toBe('legendary');
      expect(card.rarity, `${card.id} is offerable`).not.toBe('artifact');
    }
  });

  it('tilts the ladder upward as the run goes on', () => {
    // Act 3 should feel different from Act 1, not just hit harder. Measured on
    // epic, which is the ceiling of the roll now that the Reliquary owns the
    // two tiers above it.
    expect(RARITY_WEIGHTS[3].common).toBeLessThan(RARITY_WEIGHTS[1].common);
    expect(RARITY_WEIGHTS[3].epic).toBeGreaterThan(RARITY_WEIGHTS[1].epic);
  });

  it('keeps the top tiers rare enough to stay special', () => {
    // DESIGN.md §9 names reward inflation as a trap. A legendary you see every
    // other screen is a common with a better border.
    for (const act of [1, 2, 3] as const) {
      const weights = RARITY_WEIGHTS[act];
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      const top = (weights.legendary + weights.artifact) / total;
      expect(top, `act ${act} top-tier share`).toBeLessThan(0.05);
    }
  });

  it('keeps basic cards out of the reward pool', () => {
    const state = makeFight();
    const run = state.run;
    expect(run).not.toBeNull();
    const rolled = rollCardChoices(run!.rng, run!, 1, 0);
    for (const id of rolled.cardIds) {
      expect(cardTable.get(id).rarity, `${id} is basic and was offered`).not.toBe('basic');
    }
  });

  it('never offers the same card twice on one screen', () => {
    const state = makeFight();
    const run = state.run!;
    let rng = run.rng;
    for (let i = 0; i < 200; i++) {
      const rolled = rollCardChoices(rng, run, 3, 0);
      expect(new Set(rolled.cardIds).size).toBe(rolled.cardIds.length);
      rng = rolled.rng;
    }
  });
});

describe('what leaves the fight with you', () => {
  /* Health and Alloy survive the combat. Everything else a card can hand you —
     Block, Focus, Energy, a status — is gone when the fight ends, so playing it
     twice costs you the turns it took. A permanent resource has no such brake:
     a repeatable one is limited only by how long you are willing to make the
     fight, and the player who works that out is playing a different game from
     the one who does not.
  
     Salvage Rights shipped with a comment describing this exact failure mode
     and without the `exhaust` that prevents it. */

  function opsOf(effects: readonly EffectOp[]): EffectOp[] {
    // Both branches. The first version of this read a field called `otherwise`
    // that does not exist, so it walked `then` and silently skipped every
    // `else` — a guard with a hole in exactly the shape of the thing it guards.
    // It passed. `tsc` caught it; the tests could not have.
    return effects.flatMap((op) =>
      op.op === 'conditional' ? [op, ...opsOf(op.then), ...opsOf(op.else ?? [])] : [op],
    );
  }

  function grantsPermanent(def: CardDef): boolean {
    const all = [...opsOf(def.effects), ...opsOf(def.upgrade?.effects ?? [])];
    return all.some((op) => op.op === 'heal' || op.op === 'gainAlloy');
  }

  it('exhausts, every time', () => {
    const offenders = cardTable
      .all()
      .filter((def) => grantsPermanent(def) && def.exhaust !== true)
      .map((def) => def.id);
    expect(offenders, 'cards that print health or Alloy and can be played again').toEqual([]);
  });

  it('exhausts, if it throws the whole hand', () => {
    /* One reset a fight, not a loop. Without it the pattern is: play the
       hand-dump, draw a fresh hand, find the dump again a few turns later, and
       repeat — a deck that never has a bad hand because it never keeps one,
       which is a strictly better version of every deck rather than a different
       one. The turn it buys should cost the card that bought it.

       Partial discards are exempt and stay exempt: they pay a card for what
       they do every time they are played, so they are already self-limiting. */
    function throwsWholeHand(def: CardDef): boolean {
      const all = [...opsOf(def.effects), ...opsOf(def.upgrade?.effects ?? [])];
      return all.some((op) => op.op === 'discard' && op.all === true);
    }

    const offenders = cardTable
      .all()
      .filter((def) => throwsWholeHand(def) && def.exhaust !== true)
      .map((def) => def.id);
    expect(offenders, 'whole-hand discards that can be played twice').toEqual([]);

    // And the exemption is real rather than an empty set hiding a rename.
    const partial = cardTable
      .all()
      .filter((def) =>
        opsOf(def.effects).some((op) => op.op === 'discard' && op.all !== true),
      );
    expect(partial.length, 'no partial discards left to be exempt').toBeGreaterThan(0);
    expect(partial.some((def) => def.exhaust !== true), 'every partial discard exhausts too').toBe(
      true,
    );
  });

  it('is actually testing something', () => {
    // Guards the guard: if the ops are ever renamed this test would quietly
    // pass over an empty set and stop protecting anything.
    expect(cardTable.all().filter(grantsPermanent).length).toBeGreaterThan(0);
  });
});

describe('spending the hand', () => {
  /* The whole-hand cards scale on what THIS card threw away, so the ordering
     inside the card is load-bearing: discard first, then read the count. A
     version written the other way round scales on zero and always does nothing,
     which is the failure these tests exist to catch — it would look like a card
     that simply does not work rather than like a bug. */

  function withHand(cardId: string, others: readonly string[]): GameState {
    /* A real draw pile, because an empty one changes the answer. Drawing from
       nothing reshuffles the discard back in, and in a fight with no deck that
       discard is precisely the cards just thrown away — so Jettison hands them
       straight back and looks broken. In a real fight the pile holds the rest
       of the deck and the odds of that are negligible; here it has to be set
       up, or the test is measuring the fixture. */
    return makeFight({
      enemyIds: ['scrap_hound'],
      hand: [cardId, ...others],
      drawPile: ['solar_shield', 'solar_shield', 'measured_draw', 'bulwark', 'iai_slash'],
      energy: 3,
    });
  }

  function play(state: GameState, targeted = true): GameState {
    const card = combatOf(state).hand[0];
    if (card === undefined) throw new Error('test: no card');
    return playCard(state, card.uid, targeted ? firstEnemy(state).uid : null);
  }

  it('turns a dead hand into damage, one card at a time', () => {
    const state = withHand('empty_the_rack', ['iai_slash', 'iai_slash', 'bulwark']);
    const before = firstEnemy(state).hp;
    const after = play(state);

    // Three cards left in hand once the played one has gone: 3 x 3 damage.
    expect(combatOf(after).hand).toHaveLength(0);
    expect(before - firstEnemy(after).hp).toBe(9);
  });

  it('does nothing on an empty hand rather than something strange', () => {
    const state = withHand('empty_the_rack', []);
    const before = firstEnemy(state).hp;
    expect(firstEnemy(play(state)).hp).toBe(before);
  });

  it('turns the same hand into Block on the other side', () => {
    const state = withHand('shed_weight', ['iai_slash', 'iai_slash']);
    const after = play(state, false);
    expect(combatOf(after).block).toBe(8);
  });

  it('deals the hand back, one for one', () => {
    const state = withHand('jettison', ['iai_slash', 'iai_slash', 'bulwark']);
    const thrown = new Set(combatOf(state).hand.slice(1).map((card) => card.uid));
    const after = play(state, false);

    // Three thrown, three drawn. Asserted on the uids rather than on the
    // discard pile, because a draw that empties the deck reshuffles the discard
    // straight back into it — the cards are gone from your hand, which is what
    // the card promised, and where they physically are afterwards is the draw
    // engine's business.
    expect(combatOf(after).hand).toHaveLength(3);
    for (const card of combatOf(after).hand) {
      expect(thrown.has(card.uid), 'drew back a card it had just thrown').toBe(false);
    }
  });

  it('counts only what this card discarded', () => {
    /* `discardedThisPlay` is scoped to the play like `killsThisPlay`. If it
       leaked across cards, a Sift earlier in the turn would silently make the
       next Empty the Rack hit harder. */
    let state = withHand('sift', ['iai_slash', 'iai_slash', 'bulwark', 'empty_the_rack']);
    state = play(state, false);

    const rack = combatOf(state).hand.find((card) => card.defId === 'empty_the_rack');
    if (rack === undefined) throw new Error('test: Sift discarded the card under test');

    const handAfterSift = combatOf(state).hand.length;
    const before = firstEnemy(state).hp;
    const after = playCard(state, rack.uid, firstEnemy(state).uid);
    expect(before - firstEnemy(after).hp).toBe((handAfterSift - 1) * 3);
  });

  it('says what it does, in generated words', () => {
    expect(describeCard(cardTable.get('empty_the_rack'))).toBe(
      'Discard your hand. For every card discarded, deal 3 damage. Exhaust.',
    );
    expect(describeCard(cardTable.get('sift'))).toBe('Discard 1 at random. Draw 3 cards.');
  });
});
