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
    /* The cost moved off Focus and onto the axis.
     *
     * Halving a Focus stack was the same lever Unsheathed Mind pulls the other
     * way, so the two masteries were one argument at two prices — and it made
     * the mastery quietly bad in a Focus deck rather than a decision. Shutting
     * the stance behind you is a cost paid in FLEXIBILITY, which is what IAI
     * actually trades in: no Heat at turn end means you can live up there, and
     * the price is that stepping out is a one-way door until the turn ends. */
    text: 'IAI: no Heat at turn end at all, but once you leave IAI you cannot re-enter it that turn.',
    overrides: {
      text: 'Focus adds damage · no Heat at turn end · Leave IAI and it is shut for the turn',
      heatAtTurnEnd: 0,
      noReentry: true,
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
    text: 'IAI: draw 2 extra cards each turn, but every attack deals 2 less.',
    overrides: {
      text: 'Focus adds damage · +2 Heat at turn end · Draw 2 more · Attacks deal 2 less',
      /* Two, not one. One extra card against two damage off every attack was
         a trade the one-big-hit deck refused and the cheap-cards deck barely
         noticed — a mastery nobody's build actually wanted. Two cards a turn
         is a different hand every turn, which is worth giving up the size of a
         swing for. */
      extraDraw: 2,
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
      text: 'Focus adds Block · Vent 1 Heat at turn end · Retain {block} Block · First attack deals 6 more · Draw 1 fewer',
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
    /* Both halves of this were broken, in opposite directions.
     *
     * The upside retained ALL Block, which does not scale — it multiplies. A
     * deck that stacks Block never loses a wall again, so every point of Block
     * it gains is permanent, and the mastery ends the run at a number no
     * enemy in the game can get through. Half keeps the compounding shape and
     * gives the fight a way to wear it down.
     *
     * The cost was `stanceChangesPerTurn: 1`, and it simply did not work: the
     * limit is read off the stance you are STANDING in, so leaving GUARD put
     * you in IAI where no limit applied, and you walked back in on the same
     * turn having paid nothing. Shutting GUARD behind you is the cost the
     * mastery was always describing — you commit to the wall or you leave it,
     * and you cannot do both. */
    text: 'GUARD: retain half your Block instead of a flat amount, but once you leave GUARD you cannot re-enter it that turn.',
    overrides: {
      text: 'Focus adds Block · Vent 1 Heat at turn end · Retain half your Block · Leave GUARD and it is shut for the turn',
      blockRetainedPct: 0.5,
      noReentry: true,
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
