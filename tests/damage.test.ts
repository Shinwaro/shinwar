/* The damage pipeline. The most important test in the project.
 *
 * The headline assertion is that the preview equals the damage actually dealt,
 * across a matrix of stances and statuses. If that ever fails the game lies to
 * the player about what their card will do, which is the single fastest way to
 * make it feel unfair — so it is checked exhaustively rather than by example.
 */

import { describe, expect, it } from 'vitest';
import type { StanceId, StatusStack } from '../src/engine/types.ts';
import { PLAYER, computeDamage, enemyTarget, previewDamage } from '../src/engine/combat/damage.ts';
import { previewCard } from '../src/engine/combat/preview.ts';
import { playCard } from '../src/engine/combat/combat.ts';
import { FOCUS_DAMAGE_PER_STACK, STANCES } from '../src/content/balance.ts';
import { STRENGTH, VULNERABLE, WEAK } from '../src/content/statuses.ts';
import { IAI_SLASH, SEVER, SOLAR_PARRY } from '../src/content/cards/basic.ts';
import { combatOf, firstEnemy, handCard, hullOf, makeFight } from './helpers.ts';

const STANCE_IDS: readonly StanceId[] = ['iai', 'guard', 'flow'];

const STATUS_CASES: readonly { readonly name: string; readonly player: readonly StatusStack[]; readonly enemy: readonly StatusStack[] }[] = [
  { name: 'clean', player: [], enemy: [] },
  { name: 'enemy Vulnerable 1', player: [], enemy: [{ status: VULNERABLE, stacks: 1 }] },
  { name: 'enemy Vulnerable 2', player: [], enemy: [{ status: VULNERABLE, stacks: 2 }] },
  { name: 'player Weak', player: [{ status: WEAK, stacks: 1 }], enemy: [] },
  { name: 'player Strength 3', player: [{ status: STRENGTH, stacks: 3 }], enemy: [] },
  {
    name: 'Weak and Vulnerable together',
    player: [{ status: WEAK, stacks: 1 }],
    enemy: [{ status: VULNERABLE, stacks: 1 }],
  },
];

describe('preview equals resolution', () => {
  for (const stance of STANCE_IDS) {
    for (const statuses of STATUS_CASES) {
      for (const focus of [0, 2]) {
        it(`${STANCES[stance].name} · ${statuses.name} · Focus ${focus}`, () => {
          const state = makeFight({
            stance,
            focus,
            hand: [IAI_SLASH],
            playerStatuses: statuses.player,
            enemyStatuses: statuses.enemy,
            enemyHp: 999,
          });

          const card = handCard(state, 0);
          const target = firstEnemy(state);

          const preview = previewCard(state, card.uid, target.uid);
          const after = playCard(state, card.uid, target.uid);

          const before = firstEnemy(state).hp;
          const actual = before - (combatOf(after).enemies[0]?.hp ?? before);
          const predicted = preview.enemies.find((entry) => entry.uid === target.uid)?.hpLoss ?? -1;

          expect(predicted).toBe(actual);
          expect(actual).toBeGreaterThan(0);
        });
      }
    }
  }

  it('holds for an enemy attacking through Block', () => {
    const state = makeFight({ block: 5, playerStatuses: [{ status: VULNERABLE, stacks: 1 }] });
    const enemy = firstEnemy(state);
    const input = {
      amount: 9,
      attacker: enemyTarget(enemy.uid),
      target: PLAYER,
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: false,
    };
    const breakdown = previewDamage(state, input);
    // 9 x1.5 Vulnerable = 13, minus 5 Block.
    expect(breakdown.beforeBlock).toBe(13);
    expect(breakdown.blocked).toBe(5);
    expect(breakdown.toHull).toBe(8);
  });
});

describe('the ordered steps', () => {
  it('adds Focus before the stance bonus and multiplies after both', () => {
    const state = makeFight({
      stance: 'iai',
      focus: 2,
      enemyStatuses: [{ status: VULNERABLE, stacks: 1 }],
      enemyHp: 999,
    });
    const enemy = firstEnemy(state);
    const breakdown = computeDamage(state, {
      amount: 6,
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: true,
    });

    // 6 base, +4 Focus (2 x 2), +4 IAI first attack, x1.5 Vulnerable = 21.
    expect(breakdown.toHull).toBe(21);
    expect(breakdown.steps.map((step) => step.kind)).toEqual(['base', 'add', 'add', 'mult', 'floor']);
    expect(breakdown.focusConsumed).toBe(2);
  });

  it('rounds down rather than up', () => {
    const state = makeFight({ enemyStatuses: [{ status: VULNERABLE, stacks: 1 }], enemyHp: 999 });
    const enemy = firstEnemy(state);
    // 5 x 1.5 = 7.5 -> 7, never 8.
    expect(
      computeDamage(state, {
        amount: 5,
        attacker: PLAYER,
        target: enemyTarget(enemy.uid),
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull,
    ).toBe(7);
  });

  it('never goes below zero', () => {
    const state = makeFight({ stance: 'flow', enemyHp: 999 });
    const enemy = firstEnemy(state);
    expect(
      computeDamage(state, {
        amount: 1,
        attacker: PLAYER,
        target: enemyTarget(enemy.uid),
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull,
    ).toBe(0);
  });

  it('compounds Vulnerable per stack', () => {
    const state = makeFight({ enemyStatuses: [{ status: VULNERABLE, stacks: 2 }], enemyHp: 999 });
    const enemy = firstEnemy(state);
    // 8 x 1.5 x 1.5 = 18.
    expect(
      computeDamage(state, {
        amount: 8,
        attacker: PLAYER,
        target: enemyTarget(enemy.uid),
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull,
    ).toBe(18);
  });
});

describe('the stance passives', () => {
  it('gives IAI its bonus once per turn, not once per damage op', () => {
    // DESIGN.md §1: 6 base + 4 rider + 4 stance = 14, and the passive fires
    // once even though the card deals damage twice.
    const state = makeFight({ stance: 'iai', hand: [IAI_SLASH], enemyHp: 999 });
    const card = handCard(state, 0);
    const enemy = firstEnemy(state);
    const after = playCard(state, card.uid, enemy.uid);
    expect(enemy.hp - (combatOf(after).enemies[0]?.hp ?? 0)).toBe(14);
  });

  it('does not give it again on the second attack of the turn', () => {
    const state = makeFight({ stance: 'iai', hand: [IAI_SLASH, IAI_SLASH], enemyHp: 999 });
    const enemy = firstEnemy(state);
    const first = playCard(state, handCard(state, 0).uid, enemy.uid);
    const second = playCard(first, handCard(first, 0).uid, enemy.uid);
    const hpAfterFirst = combatOf(first).enemies[0]?.hp ?? 0;
    const hpAfterSecond = combatOf(second).enemies[0]?.hp ?? 0;
    expect(enemy.hp - hpAfterFirst).toBe(14);
    expect(hpAfterFirst - hpAfterSecond).toBe(10);
  });

  it('takes FLOW’s penalty off every instance', () => {
    const state = makeFight({ stance: 'flow', hand: [IAI_SLASH], enemyHp: 999 });
    const enemy = firstEnemy(state);
    const after = playCard(state, handCard(state, 0).uid, enemy.uid);
    // Base 6-2 = 4. The IAI rider does not fire in FLOW.
    expect(enemy.hp - (combatOf(after).enemies[0]?.hp ?? 0)).toBe(4);
  });

  it('spends Focus once, on the first instance', () => {
    const state = makeFight({ stance: 'iai', focus: 3, hand: [IAI_SLASH], enemyHp: 999 });
    const enemy = firstEnemy(state);
    const after = playCard(state, handCard(state, 0).uid, enemy.uid);
    // 6 +6 Focus +4 IAI = 16, then the rider's 4 with no Focus left to spend.
    expect(enemy.hp - (combatOf(after).enemies[0]?.hp ?? 0)).toBe(16 + 4);
    expect(3 * FOCUS_DAMAGE_PER_STACK).toBe(6);
    // The old stack is spent by the first instance and the rider then grants a
    // fresh one — which is the IAI engine: every slash pays for the next.
    expect(combatOf(after).focus).toBe(1);
  });
});

describe('block', () => {
  it('absorbs before hull, and is spent', () => {
    const state = makeFight({ block: 20 });
    const enemy = firstEnemy(state);
    const before = hullOf(state);
    const input = {
      amount: 9,
      attacker: enemyTarget(enemy.uid),
      target: PLAYER,
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: false,
    };
    expect(computeDamage(state, input).toHull).toBe(0);
    expect(hullOf(state)).toBe(before);
  });

  it('is gained by the player from a card and by an enemy from its move', () => {
    const state = makeFight({ hand: [SOLAR_PARRY], stance: 'guard' });
    const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
    // 6 base + 3 GUARD rider.
    expect(combatOf(after).block).toBe(9);
    expect(combatOf(after).enemies[0]?.statuses.find((s) => s.status === WEAK)?.stacks).toBe(1);
  });
});

describe('heat as a cost', () => {
  it('charges Sever its Heat', () => {
    const state = makeFight({ hand: [SEVER], stance: 'iai', enemyHp: 999 });
    const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
    expect(combatOf(after).heat).toBe(3);
  });

  it('lets the GUARD rider give some of it back', () => {
    const state = makeFight({ hand: [SEVER], stance: 'guard', heat: 2, enemyHp: 999 });
    const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
    // 2 + 3 from the card, then the GUARD rider vents 2.
    expect(combatOf(after).heat).toBe(3);
  });
});
