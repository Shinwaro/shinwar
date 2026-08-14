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
import { BASIC_CARDS, IAI_SLASH, SEVER, SOLAR_PARRY, STARTING_DECK, VECTOR_STEP } from '../src/content/cards/basic.ts';
import { PLAYER } from '../src/content/balance.ts';
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
    expect(counts[IAI_SLASH]).toBe(5);
    expect(counts[SOLAR_PARRY]).toBe(4);
    expect(counts[VECTOR_STEP]).toBe(2);
    expect(counts[SEVER]).toBe(1);
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
    expect(describeRider(def(IAI_SLASH))).toBe('Deal 4 damage. Gain 1 Focus.');
    expect(describeRider(def(SOLAR_PARRY))).toBe('Gain 3 Block. Apply 1 Weak.');
    expect(describeRider(def(VECTOR_STEP))).toBeNull();
  });

  it('follows the numbers when the card is upgraded', () => {
    const upgraded = definitionOf({ uid: 'x', defId: IAI_SLASH, upgraded: true });
    expect(describeCard(upgraded)).toBe('Deal 9 damage.');
    expect(describeRider(upgraded)).toBe('Deal 5 damage. Gain 1 Focus.');
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
    expect(text).toBe('For every 2 Heat, deal 3 damage. (3x now)');
  });

  it('appends Exhaust and Innate', () => {
    expect(describeCard({ ...def(SEVER), exhaust: true })).toContain('Exhaust.');
    expect(describeCard({ ...def(SEVER), innate: true })).toContain('Innate.');
  });
});

describe('every shipped card', () => {
  it('produces non-empty text', () => {
    for (const card of BASIC_CARDS) {
      expect(describeCard(card).trim()).not.toBe('');
    }
  });

  it('has an upgrade that actually changes the text or the cost', () => {
    for (const card of BASIC_CARDS) {
      const upgraded = definitionOf({ uid: 'x', defId: card.id, upgraded: true });
      const changed =
        describeCard(upgraded) !== describeCard(card) ||
        describeRider(upgraded) !== describeRider(card) ||
        upgraded.cost !== card.cost;
      expect(changed, `${card.id} upgrades into something identical`).toBe(true);
    }
  });
});
