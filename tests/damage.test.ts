/* The damage pipeline. The most important test in the project.
 *
 * The headline assertion is that the preview equals the damage actually dealt,
 * across a matrix of stances and statuses. If that ever fails the game lies to
 * the player about what their card will do, which is the single fastest way to
 * make it feel unfair — so it is checked exhaustively rather than by example.
 */

import { describe, expect, it } from 'vitest';
import type { EffectOp, GameState, StanceId, StatusStack } from '../src/engine/types.ts';
import { PLAYER, computeDamage, enemyTarget, previewDamage } from '../src/engine/combat/damage.ts';
import { previewCard } from '../src/engine/combat/preview.ts';
import { blockFigures, damageFigures } from '../src/engine/combat/describe.ts';
import { pilotRules } from '../src/engine/combat/rules.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import { playCard } from '../src/engine/combat/combat.ts';
import { FOCUS_DAMAGE_PER_STACK, STANCES } from '../src/content/balance.ts';
import { STRENGTH, VULNERABLE, WEAK } from '../src/content/statuses.ts';
import { FANNED_CUT, IAI_SLASH, SEVER, SOLAR_PARRY } from '../src/content/cards/basic.ts';
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
    // 9 x1.25 Vulnerable = 11, minus 5 Block.
    expect(breakdown.beforeBlock).toBe(11);
    expect(breakdown.blocked).toBe(5);
    expect(breakdown.toHull).toBe(6);
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

    // 6 base, +2 for one stack of Focus, x1.25 Vulnerable = 10. One stack a
    // card: Focus is a stream now, not a lump sum.
    expect(breakdown.toHull).toBe(10);
    expect(breakdown.steps.map((step) => step.kind)).toEqual(['base', 'add', 'mult', 'floor']);
    expect(breakdown.focusConsumed).toBe(1);
  });

  it('rounds down rather than up', () => {
    const state = makeFight({ enemyStatuses: [{ status: VULNERABLE, stacks: 1, fresh: false }], enemyHp: 999 });
    const enemy = firstEnemy(state);
    // 5 x 1.25 = 6.25 -> 6, never 7.
    expect(
      computeDamage(state, {
        amount: 5,
        attacker: PLAYER,
        target: enemyTarget(enemy.uid),
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull,
    ).toBe(6);
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

  it('compounds Vulnerable per stack, up to the cap', () => {
    /* One stack is 1.25. Two would compound to 1.5625 and are held at 1.5 — the
       cap is the point of the status: uncapped it runs away, and the correct
       play against anything with real health becomes "stack Vulnerable, then
       hit it once". Mirrors Weak exactly now, other side of the pipeline. */
    const hit = (stacks: number): number => {
      const state = makeFight({
        enemyStatuses: [{ status: VULNERABLE, stacks, fresh: false }],
        enemyHp: 999,
      });
      return computeDamage(state, {
        amount: 8,
        attacker: PLAYER,
        target: enemyTarget(firstEnemy(state).uid),
        isAttack: true,
        attackOrdinal: 0,
        consumesFocus: false,
      }).toHull;
    };

    expect(hit(1), 'one stack').toBe(10);
    expect(hit(2), 'two stacks, at the cap').toBe(12);
    expect(hit(4), 'four stacks, still at the cap').toBe(12);
  });

  it('never lets a card amplify itself with its own Vulnerable', () => {
    /* Effects resolve in order, so a card that applied Vulnerable before its
       own damage op would be hitting a target it had just made softer — the
       number on the face and the number that lands would disagree, and the face
       has no way to know. Nothing does this today; this is what stops the next
       card from being the first. */
    const flat = (list: readonly EffectOp[]): EffectOp[] =>
      list.flatMap((op) =>
        op.op === 'conditional'
          ? [op, ...flat(op.then), ...flat(op.else ?? [])]
          : op.op === 'scaleWith'
            ? [op, ...flat(op.then)]
            : [op],
      );

    const offenders: string[] = [];
    for (const def of cardTable.all()) {
      const lists: readonly (readonly EffectOp[])[] = [
        def.effects,
        def.stanceRider?.effects ?? [],
        def.upgrade?.effects ?? [],
      ];
      for (const ops of lists) {
        const seq = flat(ops);
        const vuln = seq.findIndex(
          (op) => op.op === 'applyStatus' && op.status === VULNERABLE && op.target !== 'self',
        );
        if (vuln === -1) continue;
        if (seq.slice(vuln + 1).some((op) => op.op === 'damage')) offenders.push(def.id);
      }
    }
    expect(offenders, 'cards that soften a target before hitting it').toEqual([]);
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

describe('the Block figure printed on a card', () => {
  /* GUARD spends Focus on Block exactly as IAI spends it on damage, and the
     card face was only saying so on one of the two — a player in GUARD holding
     Focus had no way to know their 6-Block card was about to be an 8 except by
     playing it. Same property as the damage side: shown + focus is what lands. */
  const cases = [
    { name: 'GUARD, no Focus', stance: 'guard' as const, focus: 0 },
    { name: 'GUARD holding Focus', stance: 'guard' as const, focus: 3 },
    // IAI spends Focus on damage, so a Block card must advertise nothing.
    { name: 'IAI holding Focus', stance: 'iai' as const, focus: 3 },
  ];

  for (const entry of cases) {
    it(`agrees with what is gained — ${entry.name}`, () => {
      const state = makeFight({
        stance: entry.stance,
        focus: entry.focus,
        hand: [SOLAR_PARRY],
        enemyHp: 999,
      });
      const figures = blockFigures(6, cardTable.get(SOLAR_PARRY), state);
      const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
      expect(figures.shown + figures.focus, entry.name).toBe(combatOf(after).block);
    });
  }

  it('never claims a hot bonus — no stance adds flat Block over a Heat line', () => {
    const state = makeFight({ stance: 'guard', heat: 9, focus: 2 });
    expect(blockFigures(6, cardTable.get(SOLAR_PARRY), state).hot).toBe(0);
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

describe('flat damage, once a swing', () => {
  /* The interaction that made the late acts trivial: relic and implant flat
     damage applied per damage INSTANCE, so a card swinging three times paid it
     three times. By Act 3 with four flat sources, a multi-hit card was adding
     +18 before its own numbers, and the boss fights were being settled by
     arithmetic rather than by play.

     It is scoped to the card's first SWING now — the same scoping Focus already
     used. Swing, not instance: a card that hits every enemy once is one arc
     through the room and the whole room is in the way of it, so every target of
     that swing is paid. Charging the bonus to whichever enemy resolved first
     made an AoE worse the more targets it had, which is backwards. Three hits
     at ONE target is the thing that had to stop, and that is three swings.

     Strength is deliberately not on this. It is a status you build inside a
     fight, it is on the board where the player can see it, and multi-hit
     paying it off is the whole reason to build it. That interaction is a plan;
     this one was a leak. */

  function armed(state: GameState, relics: readonly string[], implants: readonly string[]): GameState {
    if (state.run === null) throw new Error('test: no run');
    return {
      ...state,
      run: { ...state.run, pilot: { ...state.run.pilot, relics: [...relics], implants: [...implants] } },
    };
  }

  function swing(state: GameState, firstSwingOfCard: boolean): number {
    return computeDamage(state, {
      amount: 6,
      attacker: PLAYER,
      target: enemyTarget(firstEnemy(state).uid),
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: false,
      firstSwingOfCard,
    }).toHull;
  }

  it('pays the flat bonus on the first swing and not the rest', () => {
    const state = armed(makeFight({ enemyHp: 999 }), ['coldforge_lining'], ['honed_edge']);
    const bonus = pilotRules(state).damageFlat;
    expect(bonus, 'the fixture carries no flat damage').toBeGreaterThan(0);

    expect(swing(state, true)).toBe(6 + bonus);
    expect(swing(state, false)).toBe(6);
  });

  it('lands the whole bonus through the card resolver, once per target', () => {
    /* Through `playCard`, not just the pipeline. One enemy on the board, so
       one swing means one payment however many times the card swings. */
    const state = armed(
      makeFight({ enemyIds: ['scrap_hound'], enemyHp: 999, hand: ['fanned_cut'], energy: 3 }),
      ['coldforge_lining'],
      ['honed_edge'],
    );
    const bonus = pilotRules(state).damageFlat;
    const card = combatOf(state).hand[0];
    if (card === undefined) throw new Error('test: no card');

    const before = firstEnemy(state).hp;
    const after = playCard(state, card.uid, firstEnemy(state).uid);
    const dealt = before - firstEnemy(after).hp;

    // Whatever the card's own numbers are, the bonus is in there exactly once.
    const bare = playCard(armed(state, [], []), card.uid, firstEnemy(state).uid);
    const bareDealt = before - firstEnemy(bare).hp;
    expect(dealt).toBe(bareDealt + bonus);
  });

  it('pays every target of an AoE, because they share the swing', () => {
    /* The correction to the fix above. Fanned Cut hits every enemy once — one
       arc, three enemies in the way of it — and charging the bonus only to
       whichever one resolved first made the card WORSE the more targets it
       had. Each of them is hit by the same swing, so each of them is paid.

       Asserted per enemy rather than on a total, because a total would pass if
       the bonus landed three times on one of them. */
    const board = ['scrap_hound', 'cinder_wisp', 'scrap_hound'] as const;
    const state = armed(
      makeFight({ enemyIds: [...board], enemyHp: 999, hand: ['fanned_cut'], energy: 3 }),
      ['coldforge_lining'],
      ['honed_edge'],
    );
    const bonus = pilotRules(state).damageFlat;
    const card = combatOf(state).hand[0];
    if (card === undefined) throw new Error('test: no card');

    const hp = (current: GameState): readonly number[] =>
      combatOf(current).enemies.map((enemy) => enemy.hp);
    const before = hp(state);

    const armedAfter = hp(playCard(state, card.uid, firstEnemy(state).uid));
    const bareAfter = hp(playCard(armed(state, [], []), card.uid, firstEnemy(state).uid));

    for (let i = 0; i < board.length; i++) {
      const withRelics = (before[i] ?? 0) - (armedAfter[i] ?? 0);
      const without = (before[i] ?? 0) - (bareAfter[i] ?? 0);
      expect(withRelics, `enemy ${i}`).toBe(without + bonus);
    }
  });

  it('leaves Strength paying on every swing', () => {
    const state = makeFight({
      enemyHp: 999,
      playerStatuses: [{ status: STRENGTH, stacks: 2, fresh: false }],
    });
    // Same on both, because Strength is not scoped to the first hit.
    expect(swing(state, false)).toBe(swing(state, true));
    expect(swing(state, false)).toBeGreaterThan(6);
  });
});

describe('the swing index a card logs', () => {
  /* The UI groups blows into beats by `${source}#${swing}`: everything sharing
     a swing lands together, and each new swing gets its own beat. That makes
     the index a correctness requirement rather than a cosmetic one — a card
     whose two lines both report swing 0 renders as a single hit, which is
     exactly what IAI Slash did once its stance rider was added.

     The rule is: one swing per blow thrown, counted ACROSS a card's ops. A card
     that hits every enemy once is one swing; a card with a base hit and a rider
     is two. */

  function swings(state: GameState): readonly number[] {
    return state.log
      .filter((entry) => entry.kind === 'damage')
      .map((entry) => (typeof entry.detail?.['swing'] === 'number' ? entry.detail['swing'] : -1));
  }

  it('gives a base hit and its stance rider separate swings', () => {
    const state = makeFight({ enemyHp: 999, hand: [IAI_SLASH], stance: 'iai' });
    const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
    expect(swings(after)).toEqual([0, 1]);
  });

  it('keeps one swing when a card hits every enemy at once', () => {
    // An AoE is one arc through the room, so the whole room reacts together.
    const state = makeFight({ enemyIds: ['scrap_hound', 'cinder_wisp'], enemyHp: 999, hand: [FANNED_CUT] });
    const after = playCard(state, handCard(state, 0).uid, firstEnemy(state).uid);
    expect(swings(after)).toEqual([0, 0]);
  });
});
