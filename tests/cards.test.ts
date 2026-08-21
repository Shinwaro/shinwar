/* Generated rules text, and the starting deck.
 *
 * The point of `describeCard` is that text cannot drift from behaviour, so
 * these tests assert the text is derived — change a number in the card data
 * and the string changes with it, with nobody editing a second place.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { CardDef } from '../src/engine/types.ts';
import { describeCard, describeRider, riderIsLive } from '../src/engine/combat/describe.ts';
import { definitionOf } from '../src/engine/combat/combat.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import {
  FANNED_CUT,
  IAI_SLASH,
  SEVER,
  SOLAR_PARRY,
  STARTING_DECK,
  VECTOR_STEP,
} from '../src/content/cards/basic.ts';
import { PLAYER, RARITY_WEIGHTS } from '../src/content/balance.ts';
import { RARITY_ORDER } from '../src/engine/types.ts';
import { rollCardChoices } from '../src/engine/run/rewards.ts';
import { makeFight } from './helpers.ts';

beforeEach(() => {
  reloadContent();
});

function def(id: string): CardDef {
  return cardTable.get(id);
}

describe('the starting deck', () => {
  it('is 12 cards in the DESIGN.md split', () => {
    expect(STARTING_DECK).toHaveLength(PLAYER.startingDeckSize);
    const counts = STARTING_DECK.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts[IAI_SLASH]).toBe(4);
    expect(counts[SOLAR_PARRY]).toBe(4);
    expect(counts[VECTOR_STEP]).toBe(2);
    expect(counts[SEVER]).toBe(1);
    // One AoE from the start: the opening deck had no answer to two enemies at
    // all, so the first pack fight was five single-target swings at two health
    // bars and "hit the same one twice" is not a decision.
    expect(counts[FANNED_CUT]).toBe(1);
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
    const upgraded = definitionOf({ uid: 'x', defId: IAI_SLASH, upgraded: true });
    expect(describeCard(upgraded)).toBe('Deal 9 damage.');
    expect(describeRider(upgraded)).toBe('Deal 3 damage.');
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

  it('weights every offerable tier in every act', () => {
    for (const act of [1, 2, 3] as const) {
      for (const rarity of RARITY_ORDER) {
        if (rarity === 'basic') continue;
        const weight = RARITY_WEIGHTS[act][rarity];
        expect(weight, `act ${act} has no weight for '${rarity}'`).toBeGreaterThan(0);
      }
    }
  });

  it('tilts the ladder upward as the run goes on', () => {
    // Act 3 should feel different from Act 1, not just hit harder.
    expect(RARITY_WEIGHTS[3].common).toBeLessThan(RARITY_WEIGHTS[1].common);
    expect(RARITY_WEIGHTS[3].legendary).toBeGreaterThan(RARITY_WEIGHTS[1].legendary);
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
