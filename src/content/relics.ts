/* Relics — the progression the run was missing.
 *
 * Cards make the deck better at what it already does. Relics change what the
 * deck is *allowed* to do, and they are the only thing in the game that raises
 * Energy or draw — which is why a run without them felt like standing still no
 * matter how many cards you picked up.
 *
 * One per act finale, chosen from three. That is the shape the reward should
 * have had all along: an act ending should hand you a decision about what the
 * rest of the run is, not a thing that happened to you.
 *
 * Every relic here is declared rather than hooked. A hook cannot change a
 * number the engine is about to produce, only react after it has, and every
 * field on `RelicPassive` modifies something the turn loop or the damage
 * pipeline is already computing. A relic that needs to act *at a moment* would
 * register a handler as well — its id is a hook source like anything else.
 *
 * The tiering rule: a relic that adds Energy is worth more than anything else
 * on this list, because Energy multiplies the whole deck rather than adding to
 * it. Those are priced and rolled accordingly.
 */

import type { GameState, RelicDef } from '../engine/types.ts';
import { appendLog, withCombat, withRun } from '../engine/state.ts';
import { defineHook, registerHooks } from '../engine/hooks.ts';
import { draw } from '../engine/combat/piles.ts';
import { PLAYER, applyDamage, enemyTarget, livingEnemies } from '../engine/combat/damage.ts';
import { addStacks } from '../engine/combat/keywords.ts';
import { VULNERABLE } from './statuses.ts';
import { ventHeat } from '../engine/combat/heat.ts';
import { FOCUS_MAX, HOOK_PRIORITY } from './balance.ts';

export const RELICS: readonly RelicDef[] = [
  /* ---- the yardsticks ---- */
  {
    id: 'ballast_weave',
    name: 'Ballast Weave',
    text: 'Start each turn with 3 Block.',
    rarity: 'uncommon',
    passive: { blockPerTurn: 3 },
    flavor: 'Sect underlayer. Wears through in a season and saves you twice a fight.',
  },
  {
    id: 'whetted_edge',
    name: 'Whetted Edge',
    text: 'Every attack deals 1 more.',
    rarity: 'rare',
    passive: { damageFlat: 1 },
    flavor: 'Nothing clever. A better edge, kept better.',
  },
  {
    id: 'ceramic_underplate',
    name: 'Ceramic Underplate',
    text: 'Every attack against you deals 2 less.',
    rarity: 'uncommon',
    passive: { damageTakenFlat: 2 },
    flavor: 'It cracks instead of you. Once per crack.',
  },
  {
    id: 'bleed_valve',
    name: 'Bleed Valve',
    text: 'Vent 1 Heat at the start of each turn.',
    rarity: 'common',
    passive: { ventPerTurn: 1 },
    flavor: 'Runs constantly. Sounds like something is wrong. Nothing is.',
  },
  {
    id: 'sect_bracer',
    name: 'Sect Bracer',
    text: 'Gain 12 max health.',
    rarity: 'common',
    passive: { maxHealth: 12 },
    flavor: 'Fitted to an arm that is not yours. Close enough.',
  },

  /* ---- the rule-changers ---- */
  {
    id: 'wide_aperture',
    name: 'Wide Aperture',
    text: 'Draw 1 more card each turn.',
    rarity: 'epic',
    passive: { drawPerTurn: 1 },
    flavor: 'You were always seeing this much. Now you are looking at it.',
  },
  {
    id: 'heat_shroud',
    name: 'Heat Shroud',
    text: 'The overheat threshold rises by 1.',
    rarity: 'uncommon',
    passive: { overheatThreshold: 1 },
    flavor: 'It does not cool anything. It moves the line you are not allowed to cross.',
  },
  {
    id: 'drawn_string',
    name: 'Drawn String',
    text: 'Each stack of Focus is worth 2 more when it is spent.',
    rarity: 'rare',
    passive: { focusPerStackBonus: 2 },
    flavor: 'Wound tighter than it should be. That is the entire technique.',
  },
  {
    id: 'coldforge_lining',
    name: 'Coldforge Lining',
    text: 'Every attack deals 2 more and every attack against you deals 1 less.',
    rarity: 'epic',
    passive: { damageFlat: 2, damageTakenFlat: 1 },
    flavor: 'Forged in a shadow. The sect argued about whether that mattered.',
  },

  /* ---- the run-definers ----
     Energy multiplies the whole deck rather than adding to it, so these are the
     rarest things in the pool and the reason a boss is worth reaching. */
  {
    id: 'second_reactor',
    name: 'Second Reactor',
    text: 'Gain 1 Energy each turn.',
    rarity: 'legendary',
    passive: { energyPerTurn: 1 },
    flavor: 'The cutter was built for one. Somebody disagreed, at length, with a torch.',
  },
  {
    id: 'the_long_sight',
    name: 'The Long Sight',
    text: 'Gain 1 Energy and draw 1 more card each turn, but every attack against you deals 2 more.',
    rarity: 'legendary',
    passive: { energyPerTurn: 1, drawPerTurn: 1, damageTakenFlat: -2 },
    flavor: 'You see all of it coming. Seeing is not the same as moving.',
  },
  {
    id: 'the_unmoved_centre',
    name: 'The Unmoved Centre',
    text: 'Start each fight with 4 Focus, gain 1 Focus a turn, and each stack is worth 1 more.',
    rarity: 'artifact',
    passive: { startingFocus: 4, focusPerTurn: 1, focusPerStackBonus: 1 },
    flavor: 'The last thing the sect agreed on, and the only one that survived them.',
  },

  /* ---------- relics that read the play ----------
     Everything above is a number added to a number. These are the ones that
     watch what you are doing and pay out for doing it -- a stance change, a
     long turn, a kill, a vent. They carry no `passive` at all; the whole effect
     is a hook, which is why they can care about *when* rather than only *how
     much*. Adding one is a def here plus a handler below. */

  /* Robin's idea, and the reason it is a good one: it puts the two mechanics
       on speaking terms. Heat is the thing you accumulate by being greedy and
       Focus is the thing you accumulate by being patient — a relic that turns
       one into the other makes a hot deck able to cash out, and makes venting a
       choice about what you get rather than only about what you avoid. */
  {
    id: 'sublimation_coil',
    name: 'Sublimation Coil',
    text: 'Gain 1 Focus whenever you vent Heat.',
    rarity: 'rare',
    flavor: 'What leaves the reactor does not have to leave the ship.',
  },
  {
    id: 'turning_point',
    name: 'Turning Point',
    text: 'Gain 1 Focus whenever you enter IAI.',
    rarity: 'uncommon',
    flavor: 'The sect taught that the turn is the technique. The cut is punctuation.',
  },
  {
    id: 'kindling_ledger',
    name: 'Kindling Ledger',
    text: 'Draw a card whenever you vent Heat.',
    rarity: 'rare',
    flavor: 'Every degree it sheds, it writes down.',
  },
  {
    id: 'momentum_core',
    name: 'Momentum Core',
    text: 'Gain 1 Energy whenever an enemy dies.',
    rarity: 'epic',
    flavor: 'It does not celebrate. It reallocates.',
  },
  {
    id: 'long_form_ledger',
    name: 'Long Form',
    text: 'Every third card you play in a turn, gain 1 Focus.',
    rarity: 'rare',
    flavor: 'Counting is the discipline. The rest is only swordsmanship.',
  },
  {
    id: 'backdraft',
    name: 'Backdraft',
    text: 'Draw 2 cards when you overheat.',
    rarity: 'common',
    flavor: 'Something has to come out of it.',
  },

  /* ---- the second batch ----

     The first nineteen answered one question well — "how do I get more of what
     I already do" — and left three whole systems with nothing pointing at them.
     Nothing paid attention to a kill, nothing paid attention to a Thread coming
     due, and nothing turned a fight into Alloy. Each of those is a decision the
     player is already making, and a relic that reads one changes what the
     decision is worth rather than making the numbers bigger. */

  {
    id: 'exchange_coil',
    name: 'Exchange Coil',
    /* A conversion, so it needs something to convert.
    
       As two independent passives it vented 1 and granted 1 whether or not
       there was any Heat to trade — free Focus every turn in a cold deck, which
       is not what the name says and not what the rarity is priced for. Now it
       is one exchange: no Heat, no Focus. */
    text: 'At the start of each turn, convert 1 Heat into 1 Focus.',
    rarity: 'rare',
    flavor: 'What comes off the reactor has to go somewhere. It may as well go into your hands.',
  },
  {
    id: 'third_lung',
    name: 'The Third Lung',
    text: 'The overheat threshold rises by 1, and vent 2 Heat at the start of each turn.',
    rarity: 'epic',
    passive: { overheatThreshold: 1, ventPerTurn: 2 },
    flavor: 'Grafted in by somebody who had clearly done it before, on somebody else.',
  },
  {
    id: 'ash_rosary',
    name: 'Ash Rosary',
    text: 'Heal 4 after every fight you win.',
    rarity: 'common',
    flavor: 'Forty-one beads. One for each of them, and none for you.',
  },
  {
    id: 'bounty_ledger',
    name: 'Bounty Ledger',
    text: 'Gain 18 Alloy whenever an enemy dies.',
    rarity: 'uncommon',
    flavor: 'Somebody is still keeping the books out here, and they are surprisingly prompt.',
  },
  {
    id: 'scavengers_rig',
    name: 'Scavenger’s Rig',
    text: 'Draw 1 card whenever an enemy dies.',
    rarity: 'rare',
    flavor: 'It goes through the wreckage while you are still busy making it.',
  },
  {
    id: 'cauterising_plate',
    name: 'Cauterising Plate',
    text: 'Gain 10 Block when you overheat.',
    rarity: 'common',
    flavor: 'The plate does not mind the heat. That is the entire design brief.',
  },
  {
    id: 'duelists_mark',
    name: 'Duelist’s Mark',
    text: 'Apply 1 Vulnerable to all enemies at the start of each fight.',
    rarity: 'rare',
    flavor: 'You are announced before you arrive, and it has stopped being a courtesy.',
  },
  {
    id: 'splitfire_core',
    name: 'Splitfire Core',
    text: 'Every third card you play in a turn, deal 5 damage to all enemies.',
    rarity: 'epic',
    flavor: 'It discharges on a count of three whether or not you were counting.',
  },
  {
    id: 'sect_reliquary',
    name: 'The Sect Reliquary',
    /* The only relic that reads the story layer. A run that engages with
       Threads is a run that took risks it did not have to, and this is the one
       thing in the game that pays for having done that. */
    text: 'Heal 8 and gain 70 Alloy whenever a Thread comes due.',
    rarity: 'legendary',
    flavor: 'Everything the order still owned, in a box the size of a fist.',
  },
];

/* ---------- the handlers ----------
   Registered by id, so the bus only fires them while the run is carrying the
   relic -- `activeHookSources()` gates on `pilot.relics`. Pure, like every
   handler: `(state, payload) => state`. */

/** Focus, capped, with a line in the log so the payout is never a mystery. */
function grantFocus(state: GameState, amount: number, source: string, why: string): GameState {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return state;
  const gained = Math.min(FOCUS_MAX, combat.focus + amount) - combat.focus;
  if (gained <= 0) return state;
  return appendLog(
    withCombat(state, (current) => ({ ...current, focus: current.focus + gained })),
    { source, kind: 'status', text: `${why} Focus +${gained}.`, detail: { focus: gained } },
  );
}

/** Cards, off the run's own stream so a relic draw never moves the map. */
function grantDraw(state: GameState, count: number, source: string, why: string): GameState {
  const run = state.run;
  if (run === null || run.combat === null) return state;
  const pulled = draw(run.combat, run.rng, count);
  if (pulled.combat.hand.length === run.combat.hand.length) return state;
  return appendLog(
    withRun(state, (current) => ({ ...current, rng: pulled.rng, combat: pulled.combat })),
    { source, kind: 'combat', text: `${why} Draw ${count}.`, detail: { count } },
  );
}

/** Alloy, from inside a fight. Same shape as the execution riders pay in. */
function grantAlloy(state: GameState, amount: number, source: string, why: string): GameState {
  if (state.run === null) return state;
  return appendLog(
    withRun(state, (current) => ({ ...current, alloy: current.alloy + amount })),
    { source, kind: 'run', text: `${why} Alloy +${amount}.`, detail: { alloy: amount } },
  );
}

/** Health, capped at max. Used by the two relics that pay in hull. */
function grantHeal(state: GameState, amount: number, source: string, why: string): GameState {
  const run = state.run;
  if (run === null) return state;
  const healed = Math.min(run.pilot.maxHealth, run.pilot.health + amount) - run.pilot.health;
  if (healed <= 0) return state;
  return appendLog(
    withRun(state, (current) => ({
      ...current,
      pilot: { ...current.pilot, health: current.pilot.health + healed },
    })),
    { source, kind: 'run', text: `${why} Health +${healed}.`, detail: { health: healed } },
  );
}

function grantBlock(state: GameState, amount: number, source: string, why: string): GameState {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return state;
  return appendLog(
    withCombat(state, (current) => ({ ...current, block: current.block + amount })),
    { source, kind: 'block', text: `${why} Block +${amount}.`, detail: { amount, to: 'player' } },
  );
}

export function registerRelicHooks(): void {
  registerHooks('exchange_coil', [
    defineHook({
      hook: 'onTurnStart',
      priority: HOOK_PRIORITY.module,
      /* A trade, not two gifts. It has to see Heat on the gauge before it hands
         anything back, which is what the name always claimed and what the two
         independent passives never did — in a cold deck it was a free Focus a
         turn and the vent did nothing. */
      handle: (state) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null || combat.heat <= 0) return state;
        const cooled = ventHeat(state, 1, 'exchange_coil');
        return grantFocus(cooled, 1, 'exchange_coil', 'Exchange Coil.');
      },
    }),
  ]);

  registerHooks('turning_point', [
    defineHook({
      hook: 'onStanceChange',
      priority: HOOK_PRIORITY.module,
      /* Entering IAI only. On any change it paid for the round trip, so the
         optimal line was to flip back and forth for Focus — which is the stance
         axis being farmed rather than used, and it made the relic best in the
         deck that cared least about either stance. */
      handle: (state, payload) =>
        payload.to === 'iai' ? grantFocus(state, 1, 'turning_point', 'Turning Point.') : state,
    }),
  ]);

  registerHooks('sublimation_coil', [
    defineHook({
      hook: 'onHeatVented',
      priority: HOOK_PRIORITY.module,
      handle: (state) => grantFocus(state, 1, 'sublimation_coil', 'Sublimation Coil.'),
    }),
  ]);

  registerHooks('kindling_ledger', [
    defineHook({
      hook: 'onHeatVented',
      priority: HOOK_PRIORITY.module,
      handle: (state) => grantDraw(state, 1, 'kindling_ledger', 'Kindling Ledger.'),
    }),
  ]);

  registerHooks('momentum_core', [
    defineHook({
      hook: 'onEnemyKilled',
      priority: HOOK_PRIORITY.module,
      handle: (state) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null || combat.outcome !== 'ongoing') return state;
        return appendLog(
          withCombat(state, (current) => ({ ...current, energy: current.energy + 1 })),
          { source: 'momentum_core', kind: 'combat', text: 'Momentum Core. Energy +1.', detail: null },
        );
      },
    }),
  ]);

  registerHooks('long_form_ledger', [
    defineHook({
      hook: 'onCardPlayed',
      priority: HOOK_PRIORITY.module,
      handle: (state) => {
        // `cardsPlayedThisTurn` is already incremented by the time this fires,
        // so the third card sees 3 -- read it, never count separately.
        const played = state.run?.combat?.cardsPlayedThisTurn ?? 0;
        if (played === 0 || played % 3 !== 0) return state;
        return grantFocus(state, 1, 'long_form_ledger', `Long Form, card ${played}.`);
      },
    }),
  ]);

  registerHooks('backdraft', [
    defineHook({
      hook: 'onOverheat',
      priority: HOOK_PRIORITY.module,
      handle: (state) => grantDraw(state, 2, 'backdraft', 'Backdraft.'),
    }),
  ]);

  registerHooks('ash_rosary', [
    defineHook({
      hook: 'onCombatEnd',
      priority: HOOK_PRIORITY.module,
      // Won only. A relic that pays out on the fight that killed you is a
      // relic that has never once mattered.
      handle: (state, payload) =>
        payload.outcome === 'won' ? grantHeal(state, 4, 'ash_rosary', 'Ash Rosary.') : state,
    }),
  ]);

  registerHooks('bounty_ledger', [
    defineHook({
      hook: 'onEnemyKilled',
      priority: HOOK_PRIORITY.module,
      handle: (state) => grantAlloy(state, 18, 'bounty_ledger', 'Bounty Ledger.'),
    }),
  ]);

  registerHooks('scavengers_rig', [
    defineHook({
      hook: 'onEnemyKilled',
      priority: HOOK_PRIORITY.module,
      handle: (state) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null || combat.outcome !== 'ongoing') return state;
        return grantDraw(state, 1, 'scavengers_rig', 'Scavenger’s Rig.');
      },
    }),
  ]);

  registerHooks('cauterising_plate', [
    defineHook({
      hook: 'onOverheat',
      priority: HOOK_PRIORITY.module,
      handle: (state) => grantBlock(state, 10, 'cauterising_plate', 'Cauterising Plate.'),
    }),
  ]);

  registerHooks('duelists_mark', [
    defineHook({
      hook: 'onCombatStart',
      priority: HOOK_PRIORITY.module,
      handle: (state) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null) return state;
        return appendLog(
          withCombat(state, (current) => ({
            ...current,
            enemies: current.enemies.map((enemy) => ({
              ...enemy,
              statuses: addStacks(enemy.statuses, VULNERABLE, 1),
            })),
          })),
          {
            source: 'duelists_mark',
            kind: 'status',
            text: 'Duelist’s Mark. 1 Vulnerable to all enemies.',
            detail: { status: VULNERABLE, stacks: 1 },
          },
        );
      },
    }),
  ]);

  registerHooks('splitfire_core', [
    defineHook({
      hook: 'onCardPlayed',
      priority: HOOK_PRIORITY.module,
      handle: (state) => {
        // Reads `cardsPlayedThisTurn` rather than counting separately, the same
        // way Long Form does — two counters for one fact drift.
        const combat = state.run?.combat;
        if (combat === undefined || combat === null || combat.outcome !== 'ongoing') return state;
        if (combat.cardsPlayedThisTurn === 0 || combat.cardsPlayedThisTurn % 3 !== 0) return state;

        let next = state;
        for (const enemy of livingEnemies(combat)) {
          next = applyDamage(
            next,
            {
              amount: 5,
              attacker: PLAYER,
              target: enemyTarget(enemy.uid),
              isAttack: false,
              attackOrdinal: 0,
              consumesFocus: false,
            },
            'splitfire_core',
          );
        }
        return next;
      },
    }),
  ]);

  registerHooks('sect_reliquary', [
    defineHook({
      hook: 'onThreadResolved',
      priority: HOOK_PRIORITY.module,
      handle: (state) => {
        const healed = grantHeal(state, 8, 'sect_reliquary', 'The Sect Reliquary.');
        return grantAlloy(healed, 70, 'sect_reliquary', 'The Sect Reliquary.');
      },
    }),
  ]);

}
