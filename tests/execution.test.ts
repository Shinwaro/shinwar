/* Execution riders, and Voided cards.
 *
 * Two mechanics that arrived together and share one property worth pinning:
 * both are expressed entirely in existing vocabulary. An execution card is a
 * `damage` op followed by a `conditional`, and a Voided card is a card the
 * rules refuse rather than a card with a special effect. If either ever needs
 * a branch somewhere in the engine, that is the signal the design went wrong.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { CardDef, GameState } from '../src/engine/types.ts';
import { canPlay, definitionOf, playCard } from '../src/engine/combat/combat.ts';
import { describeCard } from '../src/engine/combat/describe.ts';
import { buyForge } from '../src/engine/run/shop.ts';
import { safePlanetUpgrade } from '../src/engine/run/run.ts';
import { offerableCards } from '../src/engine/run/rewards.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import { combatOf, firstEnemy, handCard, makeFight } from './helpers.ts';

beforeEach(() => {
  reloadContent();
});

/** A one-off attack with a kill rider, so the tests do not ride on tuning. */
function executioner(reward: CardDef['effects'], hit = 10, times = 1): CardDef {
  return {
    id: 'test_execution',
    name: 'Test Execution',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'damage', amount: hit, target: 'enemy', times },
      { op: 'conditional', when: { kind: 'killedThisPlay' }, then: reward },
    ],
    upgrade: { effects: [{ op: 'damage', amount: hit + 2, target: 'enemy' }] },
  };
}

/**
 * A fight holding one copy of a card that does not ship.
 *
 * `makeFight` reloads content, so a card registered before it is wiped by it.
 * Register after, then seat the instance in hand by hand.
 */
function fightHolding(def: CardDef, options: Parameters<typeof makeFight>[0] = {}): GameState {
  const state = makeFight(options);
  cardTable.register([def]);
  const combat = combatOf(state);
  return {
    ...state,
    run: {
      ...state.run!,
      combat: {
        ...combat,
        hand: [...combat.hand, { uid: 'test-card-1', defId: def.id, upgraded: false }],
      },
    },
  };
}

describe('the execution rider', () => {
  it('pays when the blow kills', () => {
    const state = fightHolding(executioner([{ op: 'gainEnergy', amount: 2 }]), { enemyHp: 4 });
    const before = combatOf(state).energy;

    const after = playCard(state, 'test-card-1', firstEnemy(state).uid);
    expect(combatOf(after).enemies[0]?.hp).toBeLessThanOrEqual(0);
    expect(combatOf(after).energy).toBe(before + 2);
  });

  it('pays nothing when it does not', () => {
    const state = fightHolding(executioner([{ op: 'gainEnergy', amount: 2 }]), { enemyHp: 999 });
    const before = combatOf(state).energy;

    const after = playCard(state, 'test-card-1', firstEnemy(state).uid);
    expect(combatOf(after).enemies[0]?.hp).toBeGreaterThan(0);
    expect(combatOf(after).energy).toBe(before);
  });

  it('does not pay again for hitting something already dead', () => {
    /* The condition is "was alive, now is not", not "is dead" — otherwise a
       multi-hit card collects the bounty once per swing at a corpse. */
    const state = fightHolding(executioner([{ op: 'gainEnergy', amount: 1 }], 10, 3), {
      enemyHp: 4,
    });
    const before = combatOf(state).energy;
    const after = playCard(state, 'test-card-1', firstEnemy(state).uid);
    expect(combatOf(after).energy).toBe(before + 1);
  });

  it('scopes the kill to the card, not the turn', () => {
    /* A second card played after a kill must not collect the first one's
       bounty. Same card twice: the first finishes something, the second swings
       at a target it cannot kill. */
    const state = fightHolding(executioner([{ op: 'gainEnergy', amount: 2 }]), {
      enemyIds: ['scrap_hound', 'scrap_hound'],
      enemyHp: 4,
      energy: 9,
    });

    const first = playCard(state, 'test-card-1', firstEnemy(state).uid);
    const paidOnce = combatOf(first).energy;

    const survivor = combatOf(first).enemies.find((enemy) => enemy.hp > 0);
    expect(survivor, 'test needs a survivor').toBeDefined();

    const fattened: GameState = {
      ...first,
      run: {
        ...first.run!,
        combat: {
          ...combatOf(first),
          hand: [
            ...combatOf(first).hand,
            { uid: 'test-card-2', defId: 'test_execution', upgraded: false },
          ],
          enemies: combatOf(first).enemies.map((enemy) =>
            enemy.hp > 0 ? { ...enemy, hp: 999 } : enemy,
          ),
        },
      },
    };

    const second = playCard(fattened, 'test-card-2', survivor!.uid);
    expect(combatOf(second).energy).toBe(paidOnce);
  });

  it('can pay in Alloy, which reaches out of the fight', () => {
    const state = fightHolding(executioner([{ op: 'gainAlloy', amount: 50 }]), { enemyHp: 4 });
    const before = state.run?.alloy ?? 0;
    const after = playCard(state, 'test-card-1', firstEnemy(state).uid);
    expect(after.run?.alloy).toBe(before + 50);
  });

  it('generates its own rules text', () => {
    expect(describeCard(cardTable.get('culling_stroke'))).toContain('If this kills an enemy');
    expect(describeCard(cardTable.get('bounty_cut'))).toContain('Alloy');
  });
});

describe('voided cards', () => {
  const voided = (): CardDef => cardTable.all().filter((card) => card.type === 'voided')[0]!;

  it('ships some', () => {
    expect(cardTable.all().filter((card) => card.type === 'voided').length).toBeGreaterThanOrEqual(4);
  });

  it('cannot be played', () => {
    const state = makeFight({ hand: [voided().id] });
    const check = canPlay(state, handCard(state, 0).uid);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('Voided');
  });

  it('stays in hand when a play is attempted anyway', () => {
    // The reducer dispatches optimistically, so the refusal has to hold at the
    // resolver and not merely grey out a button.
    const state = makeFight({ hand: [voided().id] });
    const uid = handCard(state, 0).uid;
    const after = playCard(state, uid, firstEnemy(state).uid);
    expect(combatOf(after).hand.some((card) => card.uid === uid)).toBe(true);
  });

  it('says what it is, in generated words', () => {
    const text = describeCard(voided());
    expect(text).toContain('Unplayable');
    expect(text).toContain('Remove it');
  });

  it('is never offered as a reward', () => {
    expect(offerableCards().some((card) => card.type === 'voided')).toBe(false);
  });

  it('has no upgrade, and neither forge will invent one', () => {
    const def = voided();
    expect(def.upgrade).toBeUndefined();
    expect(definitionOf({ uid: 'x', defId: def.id, upgraded: true })).toEqual(def);

    const state = makeFight();
    const run = state.run!;
    const card = { uid: 'voided-1', defId: def.id, upgraded: false };
    const carrying: GameState = {
      ...state,
      run: {
        ...run,
        alloy: 9999,
        pilot: { ...run.pilot, deck: [...run.pilot.deck, card] },
      },
    };

    const rested = safePlanetUpgrade(carrying, card.uid);
    expect(rested.run?.pilot.deck.find((entry) => entry.uid === card.uid)?.upgraded).toBe(false);

    const stocked: GameState = {
      ...carrying,
      run: {
        ...carrying.run!,
        shop: {
          nodeId: 'test-station',
          cards: [],
          removalPrice: 100,
          removalUsed: false,
          masteryId: null,
          masteryPrice: 0,
          masterySold: true,
          forgePrice: 10,
          forgeUsed: false,
          repairPrice: 150,
          repairUsed: false,
          implants: [],
        },
      },
    };
    const forged = buyForge(stocked, card.uid);
    expect(forged.run?.pilot.deck.find((entry) => entry.uid === card.uid)?.upgraded).toBe(false);
  });
});
