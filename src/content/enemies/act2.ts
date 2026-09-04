/* Act 2 enemies.
 *
 * Bands from DESIGN.md §8: 45-80 HP, 12-20 damage a turn, elites 130-170.
 *
 * Act 2 is where the player is supposed to feel powerful and then greedy, so
 * these are not simply Act 1 with bigger numbers — each one taxes a resource
 * rather than just spending HP:
 *
 *   Sable Drifter  — pure damage, but only every other turn. The turn it does
 *                    not hit is the turn you are supposed to overreach.
 *   Arc Welder     — armours itself on a fixed cycle. Punishes chip damage and
 *                    rewards saving a big swing for the gap in the cycle.
 *   Ash Choir      — weak alone; it buffs whatever it is standing next to.
 *   Void Ronin     — mirrors the stance layer back at you. Hits harder the
 *                    longer you sit still.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { RUST, STRENGTH, TEMPERED, VULNERABLE, WEAK } from '../statuses.ts';

export const SABLE_DRIFTER = 'sable_drifter';
export const ARC_WELDER = 'arc_welder';
export const ASH_CHOIR = 'ash_choir';
export const VOID_RONIN = 'void_ronin';
export const BLOOM_WEEVIL = 'bloom_weevil';

export const IRON_PROCESSION = 'iron_procession';
export const SIPHON_ENGINE = 'siphon_engine';
export const WAVEFRONT_HERALD = 'wavefront_herald';
export const TALLY_KEEPER = 'tally_keeper';
export const SPLINT_CHORUS = 'splint_chorus';

export const ACT2_ENEMIES: readonly EnemyDef[] = [
  {
    id: SABLE_DRIFTER,
    name: 'Sable Drifter',
    maxHp: 46,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'lunge',
        label: 'Lunge',
        /* 19 -> 16. It banks Strength on the alternate turn, so the printed
           figure is the floor rather than the number you actually take — by
           the third Lunge it was well past what an Act 2 normal should be
           asking for on its own. */
        intent: [{ kind: 'attack', amount: 16, times: 1, label: 'Lunge' }],
        effects: [{ op: 'damage', amount: 16, target: 'enemy' }],
      },
      {
        id: 'drift',
        label: 'Drift',
        intent: [{ kind: 'buff', amount: 2, times: 1, label: 'Strength +2' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' }],
      },
    ],
    script: { kind: 'sequence', moves: ['drift', 'lunge'] },
    flavor: 'It does not accelerate. It decides where it already was.',
  },

  {
    id: ARC_WELDER,
    name: 'Arc Welder',
    maxHp: 56,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'seal',
        label: 'Seal',
        intent: [{ kind: 'block', amount: 14, times: 1, label: 'Plate 14' }],
        effects: [{ op: 'block', amount: 14 }],
      },
      {
        id: 'arc',
        label: 'Arc',
        intent: [
          { kind: 'attack', amount: 8, times: 2, label: 'Arc' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'damage', amount: 8, target: 'enemy', times: 2 },
          { op: 'gainHeat', amount: 2 },
        ],
      },
      {
        id: 'grind',
        label: 'Grind',
        intent: [{ kind: 'attack', amount: 11, times: 1, label: 'Grind' }],
        effects: [{ op: 'damage', amount: 11, target: 'enemy' }],
      },
    ],
    script: { kind: 'sequence', moves: ['seal', 'arc', 'grind'] },
    flavor: 'Repairs itself with the same torch it uses on you. No irony intended.',
  },

  {
    id: ASH_CHOIR,
    name: 'Ash Choir',
    maxHp: 38,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'hymn',
        label: 'Hymn',
        intent: [{ kind: 'buff', amount: 2, times: 1, label: 'Strength +2 to all' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'allAllies' }],
      },
      {
        id: 'dirge',
        label: 'Dirge',
        intent: [
          { kind: 'attack', amount: 7, times: 1, label: 'Dirge' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' },
        ],
        effects: [
          { op: 'damage', amount: 7, target: 'enemy' },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['hymn', 'dirge'] },
    flavor: 'Singing the names of a crew that has not finished dying yet.',
  },

  {
    id: VOID_RONIN,
    name: 'Void Ronin',
    maxHp: 52,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'draw_cut',
        label: 'Draw Cut',
        intent: [{ kind: 'attack', amount: 15, times: 1, label: 'Draw Cut' }],
        effects: [{ op: 'damage', amount: 15, target: 'enemy' }],
      },
      {
        id: 'guard_form',
        label: 'Guard Form',
        intent: [
          { kind: 'block', amount: 10, times: 1, label: 'Guard 10' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Vulnerable 2' },
        ],
        effects: [
          { op: 'block', amount: 10 },
          /* 2, not 1. Vulnerable sheds a stack at the end of the target's
             turn, and the move that follows this one in the script does not
             attack — so a single stack was always spent on a turn that could
             not use it, and the debuff read as a threat the enemy never
             collected on. Two means at least one attacking turn lands under
             it. */
          { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'sheathe',
        label: 'Sheathe',
        intent: [{ kind: 'buff', amount: 3, times: 1, label: 'Strength +3' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' }],
      },
    ],
    script: { kind: 'sequence', moves: ['guard_form', 'sheathe', 'draw_cut'] },
    flavor: 'Another sect, another collapse. They kept the forms and lost the reason.',
  },

  /* ---- elites: 130-170 HP, 22-30 a turn ---- */

  {
    /* Act 2's clock. Almost no damage of its own and a lot of health, so it
       cannot be out-blocked and cannot be ignored -- the rust runs for as long
       as it is alive, which makes killing it the play even when something else
       is hitting harder.

       Rust 4 and 2 became 3 and 1 when Rust went to 2 damage a stack. Those
       numbers were written against 1, and the doubling did not double the
       Weevil -- it compounds. The script re-seeds every third turn while a
       stack decays every turn, so the pile grows: over a four-turn fight it
       went from 20 unblockable to 40, out of 70 health, from one NORMAL-tier
       enemy. At 3 and 1 the same four turns cost 28, which is still the most
       frightening thing in the act to leave alive. */
    id: BLOOM_WEEVIL,
    name: 'Bloom Weevil',
    /* 48, down from 62.

       It was the largest normal-tier enemy in the act by six health — bigger
       than two of the Act 2 elites' opening phases feel — while ALSO being the
       one whose damage compounds if you leave it alive. Those two properties
       fight: the Rust pile is the threat, and health is what stops you dealing
       with the threat. In line with the Sable Drifter now, and the Rust is
       still the reason you kill it first. */
    maxHp: 48,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'seed',
        label: 'Seed',
        intent: [{ kind: 'debuff', amount: 3, times: 1, label: 'Rust 3' }],
        effects: [{ op: 'applyStatus', status: RUST, stacks: 3, target: 'enemy' }],
      },
      {
        id: 'gnaw',
        label: 'Gnaw',
        intent: [
          { kind: 'attack', amount: 4, times: 1, label: 'Gnaw' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Rust 1' },
        ],
        effects: [
          { op: 'damage', amount: 4, target: 'enemy' },
          { op: 'applyStatus', status: RUST, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'harden',
        label: 'Harden',
        intent: [{ kind: 'block', amount: 12, times: 1, label: 'Harden 12' }],
        effects: [{ op: 'block', amount: 12 }],
      },
    ],
    script: { kind: 'sequence', moves: ['seed', 'harden', 'gnaw'] },
    flavor: 'It is not attacking you. It is planting.',
  },

  {
    id: IRON_PROCESSION,
    name: 'Iron Procession',
    maxHp: 136,
    act: 2,
    tier: 'elite',
    moves: [
      {
        id: 'advance',
        label: 'Advance',
        intent: [
          { kind: 'attack', amount: 11, times: 2, label: 'Advance' },
          { kind: 'block', amount: 12, times: 1, label: 'Plate 12' },
        ],
        effects: [
          { op: 'damage', amount: 11, target: 'enemy', times: 2 },
          { op: 'block', amount: 12 },
        ],
      },
      {
        id: 'toll',
        label: 'Toll',
        intent: [
          { kind: 'attack', amount: 20, times: 1, label: 'Toll' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Vulnerable 2' },
        ],
        effects: [
          { op: 'damage', amount: 20, target: 'enemy' },
          { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'reform',
        label: 'Reform',
        intent: [
          { kind: 'block', amount: 20, times: 1, label: 'Plate 20' },
          { kind: 'buff', amount: 2, times: 1, label: 'Strength +2' },
        ],
        effects: [
          { op: 'block', amount: 20 },
          { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['advance', 'reform', 'toll'] },
    flavor: 'Nine hulls welded nose to tail, still keeping formation out of habit.',
  },

  {
    id: SIPHON_ENGINE,
    name: 'Siphon Engine',
    maxHp: 98,
    act: 2,
    tier: 'elite',
    moves: [
      {
        id: 'draw_off',
        label: 'Draw Off',
        intent: [
          { kind: 'attack', amount: 11, times: 1, label: 'Draw Off' },
          { kind: 'debuff', amount: 3, times: 1, label: 'Heat +3' },
        ],
        effects: [
          { op: 'damage', amount: 11, target: 'enemy' },
          { op: 'gainHeat', amount: 3 },
        ],
      },
      {
        id: 'overpressure',
        label: 'Overpressure',
        intent: [{ kind: 'attack', amount: 10, times: 3, label: 'Overpressure' }],
        effects: [{ op: 'damage', amount: 10, target: 'enemy', times: 3 }],
      },
      {
        id: 'bank',
        label: 'Bank',
        intent: [
          { kind: 'block', amount: 16, times: 1, label: 'Plate 16' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'block', amount: 16 },
          { op: 'gainHeat', amount: 2 },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['draw_off', 'bank', 'overpressure'] },
    flavor: 'It is not attacking you. It is drinking, and you are the nearest reactor.',
  },

  /* ---- the Act 2 boss ----
     A culmination, not a curveball. It asks the two questions Act 2 has been
     asking all along — can you survive a turn you cannot block, and can you
     keep the gauge down when something else is filling it. */

  {
    /* Act 2 asks one question: can your deck actually kill something?
     *
     * It is the damage check, and it is built so that arriving underprepared is
     * a loss you have already taken rather than one you might play out of.
     * Three mechanisms, and they are the same mechanism seen from three sides:
     *
     *   - **Rust, applied slowly.** Two on Compression, one on Shockfall, so
     *     the pile sits at two or three stacks for the whole fight and takes 4
     *     to 6 off you at the end of every turn. Rust IGNORES BLOCK, which is
     *     the point: it is a clock measured in the health you walked in with,
     *     and it cannot be answered by playing better. Come in at 30 and the
     *     Rust alone gives you six turns.
     *   - **Weak, on the turn it plates.** Compression is a 30-point wall that
     *     also cuts your output, so a deck that cannot break it quickly gets
     *     slower at exactly the moment it needed to be faster.
     *   - **Strength, on Arrival.** Under 40% it drops Compression entirely and
     *     alternates its two biggest moves, so the Strength lands every other
     *     turn instead of every third and the last third of the fight runs far
     *     hotter than the first two.
     *
     * A finished deck at full health kills it before the Rust matters. That is
     * the fight working. */
    id: WAVEFRONT_HERALD,
    name: 'Herald of the Front',
    /* 236, up from 182. At 182 it was answerable by a merely adequate deck at
       full health, which meant a player could cross the whole of Act 2 without
       once finding out what their build could not do. */
    maxHp: 236,
    act: 2,
    tier: 'boss',
    moves: [
      {
        id: 'shockfall',
        label: 'Shockfall',
        intent: [
          { kind: 'attack', amount: 14, times: 3, label: 'Shockfall' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Rust 1' },
        ],
        effects: [
          { op: 'damage', amount: 14, target: 'enemy', times: 3 },
          /* The Heat that used to be here has gone to the Kiln Sovereign, whose
             whole fight is about the gauge. This one is about the clock, and
             Rust is the clock: it is on the move that survives into the second
             phase, so the timer keeps running after the plating stops. */
          { op: 'applyStatus', status: RUST, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'compression',
        label: 'Compression',
        intent: [
          { kind: 'block', amount: 30, times: 1, label: 'Plate 30' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Weak 2' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Rust 2' },
        ],
        effects: [
          { op: 'block', amount: 30 },
          { op: 'applyStatus', status: WEAK, stacks: 2, target: 'enemy' },
          { op: 'applyStatus', status: RUST, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'arrival',
        label: 'Arrival',
        intent: [
          { kind: 'attack', amount: 34, times: 1, label: 'Arrival' },
          { kind: 'buff', amount: 3, times: 1, label: 'Strength +3' },
        ],
        effects: [
          { op: 'damage', amount: 34, target: 'enemy' },
          { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
        ],
      },
    ],
    script: {
      kind: 'phased',
      threshold: 40,
      opening: ['shockfall', 'compression', 'arrival'],
      closing: ['arrival', 'shockfall'],
    },
    flavor: 'It arrived here first. It has been waiting for the rest of the front to catch up.',
  },

/* ---- the second batch ----

   Written to one constraint that shapes every enemy in the game and is easy to
   forget: **the telegraph is rendered from the static `intent` template**, not
   from the effects. So an enemy must never put a `conditional` in front of a
   damage number — the intent would show one figure and the resolver would land
   another, which is the exact failure DESIGN.md calls a P1. Variety here comes
   from move sequences, statuses and hit shapes, all of which the telegraph can
   state honestly a turn ahead.
*/

  {
    /* Takes the shop, not the hull.

       Block answers everything else in the game, and it cannot answer this —
       the Alloy comes off whether or not the blow lands, so the only counter is
       killing it, quickly. That is a new kind of clock: not "survive this" but
       "you are being charged by the turn". */
    id: TALLY_KEEPER,
    name: 'Tally Keeper',
    maxHp: 44,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'levy',
        label: 'Levy',
        intent: [
          { kind: 'attack', amount: 7, times: 1, label: 'Levy' },
          { kind: 'debuff', amount: 35, times: 1, label: 'Alloy -35' },
        ],
        effects: [
          { op: 'damage', amount: 7, target: 'enemy' },
          { op: 'gainAlloy', amount: -35 },
        ],
      },
      {
        id: 'audit',
        label: 'Audit',
        /* 16 -> 12. Measured at 12 damage a turn averaged over its script, the
           Keeper was hitting as hard as the average Act 2 ELITE (12.5) while
           costing a normal's worth of the encounter budget — so any pack
           containing it was quietly an elite fight. */
        intent: [{ kind: 'attack', amount: 12, times: 1, label: 'Audit' }],
        effects: [{ op: 'damage', amount: 12, target: 'enemy' }],
      },
    ],
    script: { kind: 'sequence', moves: ['levy', 'audit'] },
    flavor: 'It has your registration, your tonnage, and a figure it considers reasonable.',
  },

  {
    /* The reason to kill the small one first.

       Tempered on the whole pack halves what you deal for two turns, so a fight
       that was arithmetic becomes target priority — and it is fragile enough
       that doing it is genuinely possible if you commit the turn to it. */
    id: SPLINT_CHORUS,
    name: 'Splint Chorus',
    maxHp: 30,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'brace',
        label: 'Brace',
        intent: [{ kind: 'buff', amount: 2, times: 1, label: 'Tempered 2 to all' }],
        effects: [{ op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'allAllies' }],
      },
      {
        id: 'splint',
        label: 'Splint',
        intent: [{ kind: 'attack', amount: 8, times: 2, label: 'Splint' }],
        effects: [{ op: 'damage', amount: 8, target: 'enemy', times: 2 }],
      },
    ],
    script: { kind: 'sequence', moves: ['brace', 'splint'] },
    flavor: 'It sings the others back together faster than you are taking them apart.',
  },
];
