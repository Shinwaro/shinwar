/* Encounters — which enemies show up together, per act and tier.
 *
 * An encounter is an addressable thing with an id rather than an ad-hoc list
 * of enemies chosen at the node, because mapgen has to assert that no two
 * consecutive combats use the identical one.
 *
 * Act 1 node 1 is always a normal combat in Clear Space, and every Act 1 normal
 * qualifies. Elite and boss rosters exist from M5, so the fallback in mapgen
 * that pointed elites at the normal pool is now dead weight rather than the
 * thing holding the map together.
 */

import type { EncounterId, EnemyId } from '../engine/types.ts';
import {
  VARETH_CHITINGUARD,
  VARETH_CLUTCHWARD,
  VARETH_DRONE,
  VARETH_HUNTRESS,
  VARETH_MATRIARCH,
  VARETH_OUTRIDER,
} from './enemies/vareth.ts';
import { TRAINING_HULK, TUTORIAL_ENCOUNTER_ID } from './tutorial.ts';
import {
  CINDER_WISP,
  KILN_ADEPT,
  LATHE_DRONE,
  RUST_TICK,
  SCRAP_HOUND,
  SLAG_WARDEN,
} from './enemies/act1.ts';
import { KILN_ALPHA, KILN_SOVEREIGN, MAG_LATHE } from './enemies/act1elites.ts';
import {
  ARC_WELDER,
  ASH_CHOIR,
  IRON_PROCESSION,
  BLOOM_WEEVIL,
  SABLE_DRIFTER,
  SIPHON_ENGINE,
  SPLINT_CHORUS,
  TALLY_KEEPER,
  VOID_RONIN,
  WAVEFRONT_HERALD,
} from './enemies/act2.ts';
import {
  CHIRALITY_WARDEN,
  COLLAPSE_CHOIR,
  EVENT_HORIZON,
  HEAT_SIPHON,
  CANTOR_OF_ASH,
  MIRROR_RONIN,
  NULLWRIGHT,
  NULL_PRISM,
  RIMEWAKE,
  TESSELLATE_SHARD,
} from './enemies/act3.ts';

export interface EncounterDef {
  readonly id: EncounterId;
  readonly name: string;
  readonly act: 1 | 2 | 3;
  readonly tier: 'normal' | 'elite' | 'boss';
  readonly enemyIds: readonly EnemyId[];
  /**
   * Earliest row this may be placed on. Absent means anywhere.
   *
   * The three-wide Act 1 packs need it. A Swarm on the arrival node is three
   * enemies against the opening twelve cards, before a single reward screen —
   * which is not a hard start, it is a different game. The board can be wide
   * once the deck has had a chance to answer it.
   */
  readonly minRow?: number;
  /**
   * Every enemy opens on the first move in its rotation that actually attacks,
   * instead of rolling a starting move.
   *
   * The roll is right almost everywhere — it is what stops a second meeting
   * from being the first one replayed. It is wrong on a board that is mostly
   * one repeated enemy, where the roll decides how much the encounter does on
   * turn one before the player has seen a card. Set it there and nowhere else.
   */
  readonly openOnAttack?: boolean;
  /**
   * Never placed on a chart. The introduction's fight only.
   *
   * Same shape as `EventDef.pinnedOnly`: content that is reachable by name and
   * by nothing else. Without it a training target with sixty health and no
   * teeth would turn up in Act 1 as a free node.
   */
  readonly tutorial?: boolean;
  /**
   * Never placed on a chart. A Thread's reprisal only.
   *
   * Third member of the pinned-content family, alongside `tutorial` and
   * `EventDef.pinnedOnly`, and it exists for a sharper reason than the others:
   * the Vareth are not wildlife on a route, they are following you. A hunting
   * party that could also turn up as an ordinary Elite would say the opposite
   * of what the Thread says, and it would hand a player who never touched the
   * egg a fight about the egg.
   *
   * `encountersFor` filters these out, so the map generator cannot see them.
   * `forcedEncounter` asks for them by name.
   */
  readonly ambush?: boolean;
}

export const ENCOUNTERS: readonly EncounterDef[] = [
  {
    // The introduction. `tutorial` keeps it out of `encountersFor`, which is
    // the only thing mapgen ever asks.
    id: TUTORIAL_ENCOUNTER_ID,
    name: 'Derelict Hauler',
    act: 1,
    tier: 'normal',
    tutorial: true,
    enemyIds: [TRAINING_HULK],
  },

  /* ---------- Act 1 ---------- */
  {
    id: 'hound_pair',
    name: 'Pack',
    act: 1,
    tier: 'normal',
    minRow: 4,
    /* Held to row 4, and not because it is big — at 56 hull it is mid-table.
       It is the hardest-HITTING fight in the act by a distance: 16 a turn
       against nine for the next one and five for the softest, at a point where
       your best answer is a 6-Block common. Two Hounds on node one is the
       opening deck losing to arithmetic it cannot change.

       This is what the first `minRow` pass missed. It ordered the act by HULL,
       which is a fair proxy in Act 3 where the two move together and a poor one
       here: sorted by hull this pack looked average, and the fight nobody could
       answer went out on row one while a soft three-wide sat behind row 5. */
    enemyIds: [SCRAP_HOUND, SCRAP_HOUND],
  },
  {
    id: 'hound_and_wisp',
    name: 'Scavengers',
    act: 1,
    tier: 'normal',
    enemyIds: [SCRAP_HOUND, CINDER_WISP],
  },
  {
    /* Two, the smallest two in the game. It was one Drone alone, on the
       argument that the opening fight should teach the loop without also
       asking who to kill first — and the introduction does that job now, with
       a hulk that does not fight back. A normal fight is a board, and a board
       is at least two things. */
    id: 'lone_drone',
    name: 'Stray',
    act: 1,
    tier: 'normal',
    enemyIds: [LATHE_DRONE, CINDER_WISP],
  },
  {
    /* The clock and the wall. Burrow makes the Tick slow to kill, and the
       rust runs the whole time you are trying.

       Held back to row 4. Rust ignores Block, which is the one answer the
       opening deck has — so meeting the Tick on node one or two is a fight the
       starting twelve cannot argue with, and losing to it teaches nothing
       except that it happened. Three nodes is enough to have drawn something.
       Work Crew, the other pack carrying a Tick, is already behind row 5. */
    id: 'tick_nest',
    name: 'Nest',
    act: 1,
    tier: 'normal',
    minRow: 4,
    enemyIds: [RUST_TICK, SCRAP_HOUND],
  },
  {
    /* Target priority, stated plainly: the Adept gets worse every turn you
       spend on the Wisp, and the Wisp is Scalding you the whole time. */
    id: 'kindling',
    name: 'Kindling',
    act: 1,
    tier: 'normal',
    enemyIds: [KILN_ADEPT, CINDER_WISP],
  },
  {
    id: 'lathe_watch',
    name: 'Maintenance Loop',
    act: 1,
    tier: 'normal',
    enemyIds: [LATHE_DRONE, CINDER_WISP],
  },
  {
    id: 'alpha_den',
    name: 'The Den',
    act: 1,
    tier: 'elite',
    enemyIds: [KILN_ALPHA],
  },
  {
    id: 'lathe_warden',
    name: 'Tolerance',
    act: 1,
    tier: 'elite',
    enemyIds: [MAG_LATHE, CINDER_WISP],
  },
  {
    id: 'the_kiln',
    name: 'The Kiln',
    act: 1,
    tier: 'boss',
    enemyIds: [KILN_SOVEREIGN],
  },

  /* ---------- Act 2 ---------- */
  {
    id: 'drift_pair',
    name: 'Drifters',
    act: 2,
    tier: 'normal',
    minRow: 5,
    /* Twenty a turn, second only to the Levy, and gated with it for the same
       reason: hull put both of them mid-table and damage puts them at the top. */
    enemyIds: [SABLE_DRIFTER, SABLE_DRIFTER],
  },
  {
    id: 'welder_and_choir',
    name: 'Salvage Crew',
    act: 2,
    tier: 'normal',
    enemyIds: [ARC_WELDER, ASH_CHOIR],
  },
  {
    /* A duel with a second. The Ronin still decides the fight — the Wisp is
       there so the board is a board. */
    id: 'ronin_duel',
    name: 'A Rival School',
    act: 2,
    tier: 'normal',
    enemyIds: [VOID_RONIN, SABLE_DRIFTER],
  },
  {
    id: 'choir_and_drifter',
    name: 'The Wake',
    act: 2,
    tier: 'normal',
    enemyIds: [ASH_CHOIR, SABLE_DRIFTER],
  },
  {
    /* The clock and the spike together: the Weevil cannot be blocked away and
       the Drifter's Crest has to be. You do not have turns for both. */
    id: 'bloom_and_drift',
    name: 'Bloom',
    act: 2,
    tier: 'normal',
    enemyIds: [BLOOM_WEEVIL, SABLE_DRIFTER],
  },
  {
    id: 'the_procession',
    name: 'The Procession',
    act: 2,
    tier: 'elite',
    enemyIds: [IRON_PROCESSION],
  },
  {
    id: 'siphon_run',
    name: 'The Siphon',
    act: 2,
    tier: 'elite',
    enemyIds: [SIPHON_ENGINE, ASH_CHOIR],
  },
  {
    id: 'the_herald',
    name: 'The Herald',
    act: 2,
    tier: 'boss',
    enemyIds: [WAVEFRONT_HERALD],
  },

  /* ---------- Act 3 ----------
     Every normal encounter here counters an archetype, and the player can see
     which one is ahead of them on the map. Routing is the answer, not a perfect
     deck. */
  {
    id: 'chirality_watch',
    name: 'Chirality',
    act: 3,
    tier: 'normal',
    minRow: 5,
    enemyIds: [CHIRALITY_WARDEN, HEAT_SIPHON],
  },
  {
    id: 'prism_pair',
    name: 'Refraction',
    act: 3,
    tier: 'normal',
    minRow: 7,
    enemyIds: [NULL_PRISM, CHIRALITY_WARDEN],
  },
  {
    id: 'the_swarm',
    name: 'Tessellation',
    act: 3,
    tier: 'normal',
    enemyIds: [TESSELLATE_SHARD, TESSELLATE_SHARD, TESSELLATE_SHARD],
  },
  {
    id: 'siphon_and_prism',
    name: 'The Draw',
    act: 3,
    tier: 'normal',
    minRow: 5,
    enemyIds: [HEAT_SIPHON, NULL_PRISM],
  },
  /* ---- Act 3's opening shelf ----

     `minRow` orders this act now — the big packs are gated behind rows 3, 5, 7
     and 9 — and that left rows one and two drawing from exactly two encounters.
     A ramp that repeats itself is not much better than no ramp, so these four
     fill the bottom of the band: 96 to 148, against an act whose gated packs
     run 172 to 226.

     They are also four different SHAPES rather than four sizes: one target
     alone, a pair that rebuilds itself, a heat clock with a chip in front of
     it, and two of the same thing. Act 3's opening should ask what kind of
     fight you are good at before it asks how much you can take. */
  {
    /* The Prism hits harder than anything else its size and the Shard is there
       to make you choose which one you can afford to leave standing. The
       lightest board in the act that still swings like Act 3.

       It was a lone Rimewake first, which the content validator refused: a
       normal fight needs at least two enemies. Correct rule — a single normal
       enemy is an Elite board without the rewards. */
    id: 'prism_and_shard',
    name: 'First Refraction',
    act: 3,
    tier: 'normal',
    enemyIds: [NULL_PRISM, TESSELLATE_SHARD],
  },
  {
    /* The Nullwright anneals what you take off it and the Shard keeps chipping
       while it does. Kill order is the fight: the wrong one first and you are
       fighting the same hull twice. */
    id: 'annealed_pair',
    name: 'The Annealing',
    act: 3,
    tier: 'normal',
    enemyIds: [NULLWRIGHT, TESSELLATE_SHARD],
  },
  {
    /* A clock and a chip. The Siphon is the reason to hurry and the Shard is
       the reason you cannot, which is the smallest version of the argument the
       rest of the act keeps having with you. */
    id: 'siphon_and_shard',
    name: 'The Tap',
    act: 3,
    tier: 'normal',
    enemyIds: [HEAT_SIPHON, TESSELLATE_SHARD],
  },
  {
    /* Two of the same, so what it tests is whether you can do the same thing
       twice before the second one has undone the first. */
    id: 'nullwright_pair',
    name: 'Second Draft',
    act: 3,
    tier: 'normal',
    enemyIds: [NULLWRIGHT, NULLWRIGHT],
  },
  {
    /* Rimewake grows while the Shard blocks for it. Every turn spent on the
       wall is a turn the timer gains three Strength -- and the Scald means
       turtling through it walks you into an overheat instead. */
    id: 'rimewake_screen',
    name: 'Screen',
    act: 3,
    tier: 'normal',
    enemyIds: [RIMEWAKE, TESSELLATE_SHARD],
  },
  {
    id: 'the_mirror',
    name: 'The Mirror',
    act: 3,
    tier: 'elite',
    enemyIds: [MIRROR_RONIN],
  },
  {
    id: 'the_last_choir',
    name: 'The Last Choir',
    act: 3,
    tier: 'elite',
    enemyIds: [COLLAPSE_CHOIR, TESSELLATE_SHARD],
  },
  {
    id: 'the_horizon',
    name: 'The Event Horizon',
    act: 3,
    tier: 'boss',
    enemyIds: [EVENT_HORIZON],
  },

  /* ---- the second batch ----

     Two things this pool did not have. **Three of anything before Act 3** — the
     board was two enemies for two whole acts, so "who do I hit first" had one
     shape and the AoE cards had nothing to be for. And **a pack whose members
     answer different questions**: a pair of the same enemy is one problem
     twice, and a pair that both punish being hit is still one problem.

     Three-wide is only tolerable now because the deck can answer it: the
     starting twelve carry an AoE from node one, and the pool has five more
     above it. Adding these before that existed would have been adding a
     difficulty spike and calling it variety. */

  {
    /* Act 1's only three-wide, and the lesson is the WIDTH, not the fight.
     *
     * Three Wisps, 54 hull, which puts it inside the two-wide band (46-60)
     * rather than above all of it. The Hound it replaced carried 28 on its own
     * and made the widest board in the act also the toughest, which taught the
     * opposite of the intended thing. Wide and thin is the shape: what it asks
     * is whether you can pick a target, and that is the only skill a
     * three-wide has to teach.
     *
     * It opens on attacks because a Wisp that opens on Stoke is a Wisp that
     * does nothing on turn one. With three of them, a rolled opening decided
     * how hard the encounter was before the player had seen a card. */
    id: 'wisp_swarm',
    name: 'Swarm',
    act: 1,
    tier: 'normal',
    minRow: 5,
    openOnAttack: true,
    enemyIds: [CINDER_WISP, CINDER_WISP, CINDER_WISP],
  },
  {
    /* The Adept scales and the Drone does not, in front of a Tick that is
       running a clock through both. Kill order is the entire fight. */
    id: 'kiln_work_crew',
    name: 'Work Crew',
    act: 1,
    tier: 'normal',
    minRow: 5,
    enemyIds: [KILN_ADEPT, LATHE_DRONE, RUST_TICK],
  },
  {
    id: 'drifter_escort',
    name: 'Escort',
    act: 2,
    tier: 'normal',
    minRow: 11,
    enemyIds: [SABLE_DRIFTER, ARC_WELDER, BLOOM_WEEVIL],
  },
  {
    /* Three questions at once: the Choir wants you slow, the Keeper wants you
       poor, and the Ronin wants you in the wrong stance.

       The middle question used to be the Siphon Engine, and that was the bug.
       The Siphon is an ELITE — 98 hull, the same enemy that headlines The Siphon
       one tier up — which made this the only normal encounter in the game
       carrying an elite, at 188 hull against an Act 2 normal median of 94 and an
       Act 2 elite of 136. A normal node twice the size of a normal fight and
       half again the size of an elite, paying normal rewards, placeable on the
       first row of the act.

       The Tally Keeper asks the same question for 44 instead of 98: its Levy
       takes 35 Alloy off you, which is the "wants you rich" angle the pack was
       built around, and 134 total puts it beside Braced Line at 138 where a
       three-wide normal belongs.

       This encounter has caused this class of bug before — it was renamed off
       `the_procession` because the id collided with the elite's and a normal
       node opened the elite outright. There is a test for duplicate ids, and now
       one for elites inside normal packs. */
    id: 'the_long_column',
    name: 'The Long Column',
    act: 2,
    tier: 'normal',
    minRow: 8,
    enemyIds: [ASH_CHOIR, TALLY_KEEPER, VOID_RONIN],
  },
  {
    id: 'welder_pair',
    name: 'Cutting Crew',
    act: 2,
    tier: 'normal',
    minRow: 5,
    enemyIds: [ARC_WELDER, ARC_WELDER],
  },
  {
    /* The things that arrive ahead of the front, not the front itself.
    
       This held the actual Act 2 boss, at its full 182 hull, on a NORMAL node
       paying normal rewards — 244 total against an act average of 125, and it
       meant you could meet the Herald before you met the Herald. The validator
       refuses a boss in a normal encounter now. */
    id: 'herald_and_weevil',
    name: 'Forerunners',
    act: 2,
    tier: 'normal',
    enemyIds: [ASH_CHOIR, BLOOM_WEEVIL],
  },
  {
    id: 'prism_field',
    name: 'Prism Field',
    act: 3,
    tier: 'normal',
    minRow: 9,
    enemyIds: [NULL_PRISM, TESSELLATE_SHARD, HEAT_SIPHON],
  },
  {
    id: 'the_cold_wake',
    name: 'The Cold Wake',
    act: 3,
    tier: 'normal',
    minRow: 7,
    enemyIds: [RIMEWAKE, CHIRALITY_WARDEN],
  },

  /* ---- seating the second batch of enemies ----
     An enemy nothing puts on the board is an enemy that does not exist. Each of
     these exists to make one of the new five the *point* of the fight rather
     than a body next to the real threat. */

  {
    /* The Warden is the point of the fight; the Wisp is the reason you cannot
       simply take your time over it. */
    id: 'warden_post',
    name: 'The Post',
    act: 1,
    tier: 'normal',
    enemyIds: [SLAG_WARDEN, CINDER_WISP],
  },
  {
    /* The Warden will not let you wait and the Wisp punishes you for hurrying.
       Two clocks pulling opposite ways. */
    id: 'warden_and_wisp',
    name: 'Checkpoint',
    act: 1,
    tier: 'normal',
    enemyIds: [SLAG_WARDEN, CINDER_WISP],
  },
  {
    /* Kill order stated as a bill: every turn the Keeper lives costs Alloy, and
       the Drifter is the thing that will kill you if you look away from it. */
    id: 'the_levy',
    name: 'The Levy',
    act: 2,
    tier: 'normal',
    minRow: 5,
    /* Twenty-two a turn is the most in the act, on ninety hull — a short fight
       you lose quickly rather than a long one you lose slowly. Gated with
       Cutting Crew, which it outranks on threat and which was already held. */
    enemyIds: [TALLY_KEEPER, SABLE_DRIFTER],
  },
  {
    id: 'braced_line',
    name: 'Braced Line',
    act: 2,
    tier: 'normal',
    minRow: 8,
    enemyIds: [SPLINT_CHORUS, ARC_WELDER, VOID_RONIN],
  },
  {
    id: 'the_counting_house',
    name: 'The Counting House',
    act: 2,
    tier: 'normal',
    enemyIds: [TALLY_KEEPER, SPLINT_CHORUS],
  },
  {
    id: 'unwritten',
    name: 'Unwritten',
    act: 3,
    tier: 'normal',
    minRow: 3,
    enemyIds: [NULLWRIGHT, NULL_PRISM],
  },
  {
    id: 'the_cantor',
    name: 'The Cantor',
    act: 3,
    tier: 'elite',
    enemyIds: [CANTOR_OF_ASH],
  },
  /* ---------- the hunting parties ----------
   *
   * What being Marked actually means, one per act. Never placed on a chart —
   * see `ambush` on `EncounterDef` — so the only way to meet these is to have
   * done something the Vareth care about.
   *
   * Tier `elite`, and harder than the act's real Elites on purpose. The
   * reprisal pays a relic again, which it did not for a long time: dropping one
   * made being Marked something a player would deliberately ARRANGE, take the
   * Thread and collect a free Elite drop. The answer to that is not to withhold
   * the reward, it is to make the fight worth the reward — an ambush you would
   * choose to walk into is a bill priced too low, and the fix belongs on the
   * price rather than on the receipt.
   *
   * Measured against each act's Elite average, both parties sit roughly a third
   * above on hull and half again on damage per turn. The damage half is the
   * important one and it is why each party has a drone in it: Elites are the
   * TANKY node, not the hard-hitting one — in Act 3 an Elite deals 21 a turn
   * against a normal pack's 30 — so a party that only added hull would have
   * been a longer fight rather than a harder one, and a long fight is the thing
   * that pushes a run past the 45-70 minute target.
   */
  {
    id: 'vareth_hunt_1',
    name: 'The Heading They Have',
    act: 1,
    tier: 'elite',
    ambush: true,
    enemyIds: [VARETH_HUNTRESS, VARETH_DRONE],
  },
  {
    id: 'vareth_hunt_2',
    name: 'What Was Owed The Clutch',
    act: 2,
    tier: 'elite',
    ambush: true,
    enemyIds: [VARETH_CLUTCHWARD, VARETH_OUTRIDER],
  },
  {
    id: 'vareth_hunt_3',
    name: 'The One That Laid It',
    act: 3,
    tier: 'elite',
    ambush: true,
    enemyIds: [VARETH_MATRIARCH, VARETH_CHITINGUARD],
  },
];

export function encountersFor(
  act: 1 | 2 | 3,
  tier: 'normal' | 'elite' | 'boss',
  row?: number,
): readonly EncounterDef[] {
  return ENCOUNTERS.filter(
    (entry) =>
      entry.tutorial !== true &&
      entry.ambush !== true &&
      entry.act === act &&
      entry.tier === tier &&
      (row === undefined || entry.minRow === undefined || row >= entry.minRow),
  );
}

/**
 * The hunting parties a reprisal can open, for one act.
 *
 * Separate from `encountersFor` rather than a flag on it, because these are the
 * complement of what that function is for: it answers "what may a chart place
 * here", and the whole point of an ambush encounter is that the answer is
 * never. No `minRow` — a reprisal is not placed, it arrives.
 */
export function ambushesFor(act: 1 | 2 | 3): readonly EncounterDef[] {
  return ENCOUNTERS.filter((entry) => entry.ambush === true && entry.act === act);
}
