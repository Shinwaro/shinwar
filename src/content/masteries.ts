/* Stance Masteries — rare, run-defining, earned only from Elites and bosses.
 *
 * Each one permanently alters a stance for the rest of the run, which makes the
 * player's entire existing deck read differently without adding a single card.
 * That is the "one axis, recontextualized" lever, and it is why the cap is 3:
 * two rewrites of a two-stance game is already a different game.
 *
 * Every one of these is a TRADE, never an upgrade. A mastery that is simply
 * better makes the stance it touches mandatory, and a mandatory stance is the
 * axis collapsing into a stat.
 *
 * FLOW's mastery from DESIGN.md — River Without Banks — is not here, because
 * FLOW is dormant. The content validator rejects a mastery on a stance that is
 * not in rotation, so it cannot creep back in unnoticed.
 */

import type { MasteryDef } from '../engine/types.ts';

export const UNSHEATHED_MIND = 'unsheathed_mind_mastery';
export const IRON_TIDE = 'iron_tide';
export const BANKED_FIRE = 'banked_fire';
export const STILL_WATER = 'still_water';
export const CALCULATED_LOOK = 'calculated_look';
export const OPENING_WALL = 'opening_wall';

export const MASTERIES: readonly MasteryDef[] = [
  {
    id: UNSHEATHED_MIND,
    name: 'Unsheathed Mind',
    stance: 'iai',
    text: 'IAI: each stack of Focus is worth 4 instead of 2, but you gain 3 Heat at turn end instead of 2.',
    overrides: {
      text: 'Attacks spend Focus at 4 each · +3 Heat at turn end',
      focusPerStack: 4,
      heatAtTurnEnd: 3,
    },
  },

  {
    id: BANKED_FIRE,
    name: 'Banked Fire',
    stance: 'iai',
    text: 'IAI: no Heat at turn end at all, but a stack of Focus is only worth 1.',
    overrides: {
      text: 'Attacks spend Focus at 1 each · no Heat at turn end',
      focusPerStack: 1,
      heatAtTurnEnd: 0,
    },
  },

  {
    /* The third IAI mastery, and it moves a different lever from the other two.
     *
     * Unsheathed Mind and Banked Fire are the same trade at two prices — what a
     * Focus stack is worth, against what the stance charges in Heat. Both leave
     * IAI as a stance about the size of one swing. This one asks whether it has
     * to be: another card every turn is another decision every turn, paid for
     * by every swing being smaller.
     *
     * It is the mastery for a deck of many cheap cards, which until now had no
     * reason to stand in IAI at all — and it is actively bad for the one-big-hit
     * deck IAI otherwise rewards, which is what keeps it a trade rather than an
     * upgrade. */
    id: CALCULATED_LOOK,
    name: 'Calculated Look',
    stance: 'iai',
    text: 'IAI: draw 1 extra card each turn, but every attack deals 2 less.',
    overrides: {
      text: 'Focus adds damage · +2 Heat at turn end · Draw 1 more · Attacks deal 2 less',
      extraDraw: 1,
      attackPenalty: 2,
    },
  },

  {
    /* GUARD, made into a stance you attack from.
     *
     * Both existing GUARD masteries are arguments about Block — keep all of it,
     * or trade all of it for the gauge. This one asks the question neither does:
     * what if standing in GUARD were how you opened rather than how you waited?
     * Six on the first attack of a turn is a real number, and it is paid for in
     * the size of the hand rather than in armour, so GUARD stays GUARD.
     *
     * A smaller hand and a bigger opening is a genuinely different turn: you
     * have fewer answers and one of them hits much harder, which rewards
     * knowing what you are going to do before you draw. */
    id: OPENING_WALL,
    name: 'Opening Wall',
    stance: 'guard',
    text: 'GUARD: the first attack each turn deals 6 more, but you draw 1 fewer card.',
    overrides: {
      text: 'Focus adds Block · Vent 1 Heat at turn end · Retain 3 Block · First attack deals 6 more · Draw 1 fewer',
      firstAttackBonus: 6,
      /* Paid for in CARDS, not in Block.
       *
       * It cost the retained Block first, and that was the wrong currency: it
       * made the mastery an argument about Block, which is what both of the
       * other GUARD masteries already are. Taking a card instead makes it an
       * argument about the size of a turn — you open harder and you have less
       * to open with — and it leaves GUARD still recognisably GUARD, which
       * matters for a stance you are supposed to want to stand in. */
      extraDraw: -1,
    },
  },

  {
    id: IRON_TIDE,
    name: 'Iron Tide',
    stance: 'guard',
    text: 'GUARD: retain all Block instead of 3, but you may change stance only once a turn.',
    overrides: {
      text: 'Focus is banked · Vent 1 Heat at turn end · Retain all Block · One stance change a turn',
      blockRetained: 999,
      stanceChangesPerTurn: 1,
    },
  },

  {
    id: STILL_WATER,
    name: 'Still Water',
    stance: 'guard',
    text: 'GUARD: vent 3 Heat at turn end instead of 1, but retain no Block.',
    overrides: {
      text: 'Focus is banked, not spent · Vent 3 Heat at turn end · Retain no Block',
      ventAtTurnEnd: 3,
      blockRetained: 0,
    },
  },
];
