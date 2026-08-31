/* Lasting buffs, and the card ordering that makes one of them work.
 *
 * Strength was the only buff in the game for six milestones, so nothing ever
 * exercised the buff half of the status machinery. Tempered and Overclock do,
 * and Overclock is the first status that changes how many cards a turn you get
 * to play — which is the kind of thing that has to be denied correctly as well
 * as granted correctly.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { EffectOp } from '../src/engine/types.ts';
import { computeDamage, PLAYER, enemyTarget } from '../src/engine/combat/damage.ts';
import { playCard, startPlayerTurn } from '../src/engine/combat/combat.ts';
import { describeCard } from '../src/engine/combat/describe.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable, statuses as statusTable } from '../src/content/registry.ts';
import { OVERCLOCK, TEMPERED } from '../src/content/statuses.ts';
import { PLAYER as PLAYER_BALANCE } from '../src/content/balance.ts';
import { combatOf, firstEnemy, handCard, makeFight } from './helpers.ts';

beforeEach(() => {
  reloadContent();
});

describe('Tempered', () => {
  it('takes a flat point off every attack, per stack', () => {
    const at = (stacks: number): number => {
      const state = makeFight(
        stacks === 0 ? {} : { playerStatuses: [{ status: TEMPERED, stacks, fresh: false }] },
      );
      const enemy = firstEnemy(state);
      return computeDamage(state, {
        amount: 20,
        attacker: enemyTarget(enemy.uid),
        target: PLAYER,
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull;
    };

    expect(at(0)).toBe(20);
    expect(at(1)).toBe(19);
    expect(at(3)).toBe(17);
  });

  it('is worth most against many small hits and least against one big one', () => {
    /* The whole reason it is flat rather than a multiplier, and the reason it
       does not need a cap: a percentage is worth most exactly when you are
       already losing, which is backwards. Armour is the other half of the
       defensive game from Block — Block is a wall you rebuild every turn, this
       is plating that accumulates. */
    const soak = (amount: number): number => {
      const state = makeFight({ playerStatuses: [{ status: TEMPERED, stacks: 3, fresh: false }] });
      const enemy = firstEnemy(state);
      const hit = computeDamage(state, {
        amount,
        attacker: enemyTarget(enemy.uid),
        target: PLAYER,
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull;
      return (amount - hit) / amount;
    };

    expect(soak(4), 'against a small hit').toBeGreaterThan(soak(30));
  });

  it('never turns an attack into a heal', () => {
    const state = makeFight({ playerStatuses: [{ status: TEMPERED, stacks: 9, fresh: false }] });
    const enemy = firstEnemy(state);
    expect(
      computeDamage(state, {
        amount: 4,
        attacker: enemyTarget(enemy.uid),
        target: PLAYER,
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull,
    ).toBe(0);
  });

  it('stays until the fight ends', () => {
    // It used to fall off at the end of your turn, which made it a worse Block:
    // gone before a second card could add to it, so nothing was ever built on
    // it. Stacks that survive are what make it a plan.
    expect(statusTable.get(TEMPERED).decay).toBe('never');
  });
});

describe('Overclock', () => {
  it('adds one Energy a turn while held, however many stacks', () => {
    // Stacks are the DURATION, not the size — three stacks is three turns of
    // one extra Energy, not one turn of three.
    const state = makeFight({ playerStatuses: [{ status: OVERCLOCK, stacks: 3, fresh: false }] });
    const after = startPlayerTurn(state);
    expect(combatOf(after).energy).toBe(PLAYER_BALANCE.energyPerTurn + 1);
  });

  it('grants nothing on a turn the reactor took', () => {
    /* An overheat at 10 costs you the turn. A buff that quietly hands the
       Energy back would refund the worst punishment in the game. */
    const base = makeFight({ playerStatuses: [{ status: OVERCLOCK, stacks: 3, fresh: false }] });
    const combat = combatOf(base);
    const skipping = {
      ...base,
      run: { ...base.run!, combat: { ...combat, skipNextTurn: true } },
    };
    expect(combatOf(startPlayerTurn(skipping)).energy).toBe(0);
  });

  it('runs out', () => {
    const state = makeFight({ playerStatuses: [{ status: OVERCLOCK, stacks: 1, fresh: false }] });
    const started = startPlayerTurn(state);
    expect(combatOf(started).energy).toBe(PLAYER_BALANCE.energyPerTurn + 1);

    const expired = {
      ...started,
      run: { ...started.run!, combat: { ...combatOf(started), statuses: [] } },
    };
    expect(combatOf(startPlayerTurn(expired)).energy).toBe(PLAYER_BALANCE.energyPerTurn);
  });
});

describe('Silent Form', () => {
  /* The card pays you for ALREADY being in IAI, which means the check has to
     run before the stance change. Setting the stance first and then asking
     whether you are in it answers yes every time, and the card silently
     becomes an unconditional 2 Focus. */

  it('pays when you are already in IAI', () => {
    const state = makeFight({ stance: 'iai', hand: ['silent_form'], focus: 0 });
    const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
    expect(combatOf(after).stance).toBe('iai');
    expect(combatOf(after).focus).toBe(2);
  });

  it('pays nothing when it is the card that put you there', () => {
    const state = makeFight({ stance: 'guard', hand: ['silent_form'], focus: 0 });
    const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
    expect(combatOf(after).stance).toBe('iai');
    expect(combatOf(after).focus).toBe(0);
  });

  it('says so in that order', () => {
    expect(describeCard(cardTable.get('silent_form'))).toBe('If in IAI, gain 2 Focus. Enter IAI.');
  });
});

describe('the power cards', () => {
  it('all exhaust, or they are not powers', () => {
    // A lasting buff you can replay every turn is not a power, it is an engine.
    for (const card of cardTable.all().filter((c) => c.type === 'power')) {
      expect(card.exhaust === true, `${card.id} does not exhaust`).toBe(true);
    }
  });

  it('all grant something lasting to the player', () => {
    /* Walks INTO conditionals and scaling terms rather than only reading the
       top level. Annealing Run's buff moved inside a `conditional` — two stacks
       under half health, one above — and a flat `card.effects.filter` reported
       a Power that grants nothing, which was a fact about the test rather than
       about the card. Anything that nests a self-buff is still a self-buff. */
    const selfBuffs = (ops: readonly EffectOp[]): number =>
      ops.reduce((count, op) => {
        if (op.op === 'applyStatus' && op.target === 'self') return count + 1;
        if (op.op === 'conditional') return count + selfBuffs(op.then) + selfBuffs(op.else ?? []);
        if (op.op === 'scaleWith') return count + selfBuffs(op.then);
        return count;
      }, 0);

    for (const card of cardTable.all().filter((c) => c.type === 'power')) {
      expect(selfBuffs(card.effects), `${card.id} grants the player nothing`).toBeGreaterThan(0);
    }
  });

  it('describes a self-buff as something you gain, not apply', () => {
    /* A bare "Apply N X" means the chosen enemy everywhere else in the pool,
       so a self-buff rendered bare said the opposite of what it did. */
    expect(describeCard(cardTable.get('settle_the_stance'))).toContain('Gain 2 Tempered');
    expect(describeCard(cardTable.get('settle_the_stance'))).not.toContain('Apply');
  });
});

describe('the three-Energy cards', () => {
  const threes = () => cardTable.all().filter((card) => card.cost === 3);

  it('ships exactly four, all mythic', () => {
    expect(threes()).toHaveLength(4);
    for (const card of threes()) expect(card.rarity, card.id).toBe('mythic');
  });

  it('keeps a multi-op kill rider in one clause', () => {
    /* "gain 2 Energy. Draw 2 cards" reads as though the draw happens either
       way. Every conditional in the pool had one op until these arrived, so
       nothing had ever shown the bug. */
    const text = describeCard(cardTable.get('cut_the_line'));
    expect(text).toContain('If this kills an enemy, gain 2 Energy and draw 2 cards.');
  });

  it('lets The Whole Sword read the whole Focus bank without spending it', () => {
    const state = makeFight({
      stance: 'iai',
      focus: 4,
      energy: 9,
      hand: ['the_whole_sword'],
      enemyHp: 999,
    });
    const enemy = firstEnemy(state);
    const after = playCard(state, handCard(state, 0).uid, enemy.uid);

    // 3 x 9 base, then 4 x 3 from the bank, and the bank is still there.
    expect(enemy.hp - (combatOf(after).enemies[0]?.hp ?? 0)).toBe(27 + 12);
    expect(combatOf(after).focus).toBe(4);
  });
});
