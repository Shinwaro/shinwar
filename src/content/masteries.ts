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

export const MASTERIES: readonly MasteryDef[] = [
  {
    id: UNSHEATHED_MIND,
    name: 'Unsheathed Mind',
    stance: 'iai',
    text: 'IAI: first attack each turn deals +8 instead of +4, but you gain 2 Heat at turn end instead of 1.',
    overrides: {
      text: 'First attack each turn +8 · +2 Heat at turn end',
      firstAttackBonus: 8,
      heatAtTurnEnd: 2,
    },
  },

  {
    id: BANKED_FIRE,
    name: 'Banked Fire',
    stance: 'iai',
    text: 'IAI: no Heat at turn end at all, but the first attack bonus drops to +2.',
    overrides: {
      text: 'First attack each turn +2 · no Heat at turn end',
      firstAttackBonus: 2,
      heatAtTurnEnd: 0,
    },
  },

  {
    id: IRON_TIDE,
    name: 'Iron Tide',
    stance: 'guard',
    text: 'GUARD: retain all Block instead of 3, but you may change stance only once a turn.',
    overrides: {
      text: 'Vent 2 Heat at turn end · Retain all Block · One stance change a turn',
      blockRetained: 999,
      stanceChangesPerTurn: 1,
    },
  },

  {
    id: STILL_WATER,
    name: 'Still Water',
    stance: 'guard',
    text: 'GUARD: vent 4 Heat at turn end instead of 2, but retain no Block.',
    overrides: {
      text: 'Vent 4 Heat at turn end · Retain no Block',
      ventAtTurnEnd: 4,
      blockRetained: 0,
    },
  },
];
