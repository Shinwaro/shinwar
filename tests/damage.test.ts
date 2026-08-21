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
import { damageFigures } from '../src/engine/combat/describe.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import { playCard } from '../src/engine/combat/combat.ts';
import { FOCUS_DAMAGE_PER_STACK, STANCES } from '../src/content/balance.ts';
import { STRENGTH, VULNERABLE, WEAK } from '../src/content/statuses.ts';
import { IAI_SLASH, SEVER, SOLAR_PARRY } from '../src/content/cards/basic.ts';
import { combatOf, firstEnemy, handCard, hullOf, makeFight } from './helpers.ts';

const STANCE_IDS: readonly StanceId[] = ['iai', 'guard', 'flow'];

const STATUS_CASES: readonly { readonly name: string; readonly player: readonly StatusStack[]; readonly enemy: readonly StatusStack[] }[] = [
  { name: 'clean', player: [], enemy: [] },
  { name: 'enemy Vulnerable 1', player: [], enemy: [{ status: VULNERABLE, stacks: 1, fresh: false }] },
  { name: 'enemy Vulnerable 2', player: [], enemy: [{ status: VULNERABLE, stacks: 2, fresh: false }] },
  { name: 'player Weak', player: [{ status: WEAK, stacks: 1, fresh: false }], enemy: [] },
  { name: 'player Strength 3', player: [{ status: STRENGTH, stacks: 3, fresh: false }], enemy: [] },
  {
    name: 'Weak and Vulnerable together',
    player: [{ status: WEAK, stacks: 1, fresh: false }],
    enemy: [{ status: VULNERABLE, stacks: 1, fresh: false }],
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
    const state = makeFight({ block: 5, playerStatuses: [{ status: VULNERABLE, stacks: 1, fresh: false }] });
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
      enemyStatuses: [{ status: VULNERABLE, stacks: 1, fresh: false }],
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

    // 6 base, +2 for one stack of Focus, x1.5 Vulnerable = 12. One stack a
    // card: Focus is a stream now, not a lump sum.
    expect(breakdown.toHull).toBe(12);
    expect(breakdown.steps.map((step) => step.kind)).toEqual(['base', 'add', 'mult', 'floor']);
    expect(breakdown.focusConsumed).toBe(1);
  });

  it('rounds down rather than up', () => {
    const state = makeFight({ enemyStatuses: [{ status: VULNERABLE, stacks: 1, fresh: false }], enemyHp: 999 });
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

  it('caps Weak at half, however many stacks are held', () => {
    /* Stacks compound, so an uncapped 0.75 reaches 0.32 at four stacks. A
       debuff that can take two thirds of an enemy's output off the table stops
       being a tempo play and becomes the whole answer to a fight. */
    const shape = {
      amount: 20,
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: false,
    } as const;

    const at = (stacks: number): number => {
      const state = makeFight({
        playerStatuses: [{ status: WEAK, stacks, fresh: false }],
        enemyHp: 999,
      });
      const enemy = firstEnemy(state);
      return computeDamage(state, { ...shape, attacker: PLAYER, target: enemyTarget(enemy.uid) })
        .toHull;
    };

    expect(at(1), 'one stack is the plain 25%').toBe(15);
    // Two stacks still compound honestly: 0.75^2 = 0.5625, above the floor.
    expect(at(2)).toBe(11);
    // Three would be 0.42 and four 0.32. Both clamp to half, and stack five
    // through nine buy nothing at all.
    expect(at(3)).toBe(10);
    expect(at(4)).toBe(10);
    expect(at(9)).toBe(10);
  });

  it('compounds Vulnerable per stack', () => {
    const state = makeFight({ enemyStatuses: [{ status: VULNERABLE, stacks: 2, fresh: false }], enemyHp: 999 });
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
  it('turns Focus into damage in IAI and leaves attacks alone in GUARD', () => {
    // The axis: the same card, the same stack, and the only difference is what
    // the stance turns that stack into. GUARD spends Focus on Block instead, so
    // an attack made in GUARD is the bare number.
    const shape = {
      amount: 6,
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: true,
    } as const;

    const banking = makeFight({ stance: 'guard', focus: 3, enemyHp: 999 });
    const bankEnemy = firstEnemy(banking);
    const banked = computeDamage(banking, {
      ...shape,
      attacker: PLAYER,
      target: enemyTarget(bankEnemy.uid),
    });
    expect(banked.toHull, 'GUARD must not spend the stack').toBe(6);
    expect(banked.focusConsumed).toBe(0);

    const drawing = makeFight({ stance: 'iai', focus: 3, enemyHp: 999 });
    const drawEnemy = firstEnemy(drawing);
    const drawn = computeDamage(drawing, {
      ...shape,
      attacker: PLAYER,
      target: enemyTarget(drawEnemy.uid),
    });
    expect(drawn.toHull).toBe(6 + FOCUS_DAMAGE_PER_STACK);
    expect(drawn.focusConsumed).toBe(1);
  });

  it('leaves the stack alone across a whole turn in GUARD', () => {
    const state = makeFight({ stance: 'guard', focus: 4, hand: [IAI_SLASH], enemyHp: 999 });
    const enemy = firstEnemy(state);
    const after = playCard(state, handCard(state, 0).uid, enemy.uid);
    // Iai Slash's rider is IAI-only, so in GUARD this is the bare 6 and the
    // bank is untouched.
    expect(enemy.hp - (combatOf(after).enemies[0]?.hp ?? 0)).toBe(6);
    expect(combatOf(after).focus).toBe(4);
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
    // 6 +2 for one stack = 8, then the rider's 2 — the rider is not the first
    // instance, so it spends nothing.
    expect(enemy.hp - (combatOf(after).enemies[0]?.hp ?? 0)).toBe(8 + 2);
    expect(3 * FOCUS_DAMAGE_PER_STACK).toBe(6);
    // Exactly one stack gone, not the bank. Started at 3.
    expect(combatOf(after).focus).toBe(2);
  });
});

describe('the figures printed on a card', () => {
  /* The card face now folds the stance's hot bonus into its number and shows
     one stack of Focus beside it. Both are read off `liveStance`, which is the
     same source the pipeline reads — and this is the test that says so.

     The property is `shown + focus === what actually lands`. If it ever fails,
     a card is advertising a number it will not deliver, which is the single
     fastest way to make the game feel unfair. */
  const cases = [
    { name: 'GUARD, cold, no Focus', stance: 'guard' as const, heat: 0, focus: 0 },
    { name: 'IAI, cold, no Focus', stance: 'iai' as const, heat: 0, focus: 0 },
    { name: 'IAI, over the hot line', stance: 'iai' as const, heat: 5, focus: 0 },
    { name: 'IAI, hot and holding Focus', stance: 'iai' as const, heat: 5, focus: 3 },
    { name: 'IAI, cold and holding Focus', stance: 'iai' as const, heat: 0, focus: 3 },
    // GUARD spends Focus on Block, so the card must NOT advertise damage for it.
    { name: 'GUARD, hot and holding Focus', stance: 'guard' as const, heat: 5, focus: 3 },
  ];

  for (const entry of cases) {
    it(`agrees with the pipeline — ${entry.name}`, () => {
      const state = makeFight({
        stance: entry.stance,
        heat: entry.heat,
        focus: entry.focus,
        enemyHp: 999,
      });
      const def = cardTable.get(IAI_SLASH);
      const figures = damageFigures(6, def, state);
      const enemy = firstEnemy(state);

      const landed = computeDamage(state, {
        amount: 6,
        attacker: PLAYER,
        target: enemyTarget(enemy.uid),
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: true,
      }).toHull;

      expect(figures.shown + figures.focus, entry.name).toBe(landed);
    });
  }

  it('never shows a Focus bonus on a card that keeps its Focus', () => {
    // The Long Draw scales off the whole bank and spends none of it, so a "+2"
    // beside its number would be describing a stack it never takes.
    const state = makeFight({ stance: 'iai', focus: 4, enemyHp: 999 });
    expect(damageFigures(6, cardTable.get('the_long_draw'), state).focus).toBe(0);
  });

  it('shows the bare number with no fight in progress', () => {
    // Reward screens and the deck list render cards outside combat.
    const figures = damageFigures(9, cardTable.get(IAI_SLASH), null);
    expect(figures).toEqual({ shown: 9, hot: 0, focus: 0 });
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
    // 6 base. GUARD's rider is the Weak, not more Block — stacking Block on
    // Block made the stance the only place the card was worth playing.
    expect(combatOf(after).block).toBe(6);
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
