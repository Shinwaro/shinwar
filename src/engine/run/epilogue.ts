/* The epilogue. What the run says about itself once it is over.
 *
 * With no saves and no scores, the end screen is the only artefact a run
 * leaves behind. At M1 it was four numbers and an apology. This builds an
 * account instead — where it ended, what ended it, what was on the ship, and
 * what was still owed when the lights went out.
 *
 * Three rules it keeps:
 *
 *   1. **Pure, like everything else in `engine/`.** No clock, no platform
 *      generator — and the guard test greps for the name of that generator,
 *      so this comment cannot spell it either. Phrasing that varies is picked
 *      by hashing the run's own facts, so the same death always reads the same
 *      way and the text is part of the seed rather than a thing that happens
 *      to it.
 *
 *   2. **Nothing is invented.** Every sentence is a fact already in state. An
 *      epilogue that embellishes is a review, and a review of your own run that
 *      you cannot check is worthless. The near-misses in here — the boss on
 *      four health, the Alloy you never spent — are the load-bearing parts,
 *      because they are the ones that teach.
 *
 *   3. **It costs the run nothing.** It reads `GameState` and returns strings.
 *      It never advances an RNG stream: a run is finished by the time this
 *      runs, and burning a roll to choose an adjective would mean the wording
 *      of one death changed the contents of the next run on that seed.
 *
 * The unresolved Threads are the emotional payload and the reason this file is
 * worth having. A Thread that never came due is the one thing the player took
 * on deliberately and did not get to see through, and naming it is what turns
 * "I died in Act 2" into a run they remember.
 */

import type { GameState, RunState, ThreadDef } from '../types.ts';
import { hashString } from '../rng.ts';
import { HEAT } from '../../content/balance.ts';
import { ACT_FINALES } from '../../content/places.ts';
import {
  enemies as enemyTable,
  environments as environmentTable,
  implants as implantTable,
  masteries as masteryTable,
  relics as relicTable,
  threads as threadTable,
} from '../../content/registry.ts';

/** One row of the ledger — a named fact, rendered as a definition list. */
export interface LedgerEntry {
  readonly label: string;
  readonly value: string;
}

export interface Epilogue {
  readonly headline: string;
  /** A one-line subtitle under the headline. The place and the depth. */
  readonly standfirst: string;
  /** The account. Two to four paragraphs, none of them padding. */
  readonly paragraphs: readonly string[];
  /**
   * Threads still open when the run ended, in the order they were taken on.
   * Rendered apart from the prose because they are the part worth re-reading.
   */
  readonly unfinished: readonly ThreadDef[];
  readonly ledger: readonly LedgerEntry[];
}

/* ---------- deterministic phrasing ----------
   A pick is a hash of the run's own facts, not a roll. Same run, same words;
   different runs, different words; and no stream moves. */

function pick<T>(options: readonly T[], key: string): T {
  const index = hashString(key) % options.length;
  return options[index] ?? (options[0] as T);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function list(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] as string}`;
}

/** `['a','a','b'] -> 'a x2, b'`. Implants stack, so the count is the point. */
function tally(names: readonly string[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count === 1 ? name : `${name} x${count}`));
}

/* ---------- the pieces of the account ----------

   Every lookup here goes through `find`, never `get`. `get` throws on an id
   the registry does not know, and the one screen in the game that must never
   throw is the one that runs after the run is already over — a crash there
   eats the entire artefact of an hour's play. If content drops a relic that a
   live run is carrying, the epilogue should be one name shorter, not gone. */

function named(
  table: { find(id: string): { readonly name: string } | undefined },
  ids: readonly string[],
): readonly string[] {
  return ids.map((id) => table.find(id)?.name).filter((name): name is string => name !== undefined);
}

/** `null` before the first move, when there is genuinely no place to name. */
function placeName(run: RunState): string | null {
  if (run.position === null) return null;
  return run.map?.nodes.find((entry) => entry.id === run.position)?.name ?? null;
}

/** Rows still between you and the act's landmark. The "how close" number. */
function rowsToBoss(run: RunState): number | null {
  const map = run.map;
  if (map === null || run.position === null) return null;
  const here = map.nodes.find((entry) => entry.id === run.position);
  const boss = map.nodes.find((entry) => entry.id === map.bossId);
  if (here === undefined || boss === undefined) return null;
  return Math.max(0, boss.row - here.row);
}

function atBoss(run: RunState): boolean {
  return run.map !== null && run.position === run.map.bossId;
}

function headlineFor(state: GameState, run: RunState): string {
  const key = `${run.seed}:${run.act}:${run.visited.length}:headline`;

  if (run.outcome === 'won') {
    return pick(
      ['The frontier holds.', 'The horizon closes behind you.', 'You come out the far side.'],
      key,
    );
  }

  if (run.outcome === 'abandoned') {
    return pick(['You break off.', 'You turn back.', 'You stop flying.'], key);
  }

  // Death, and where it happened changes what it means. Dying on the boss is a
  // different sentence from dying two nodes out of Arrival, and flattening
  // both into "You fall." wastes the one line the player actually reads.
  if (atBoss(run)) {
    return pick(['So close.', 'At the last door.', 'One fight short.'], key);
  }
  if (run.visited.length <= 3) {
    return pick(['A short flight.', 'It ends early.', 'Barely out of the gate.'], key);
  }
  if (state.run?.combat?.heat !== undefined && state.run.combat.heat >= HEAT.overheatAt) {
    return pick(['You cook.', 'The reactor wins.', 'Too hot to fly.'], key);
  }
  return pick(['You fall.', 'The cutter goes dark.', 'It ends here.'], key);
}

function standfirstFor(run: RunState): string {
  const environment =
    run.combat === null ? null : environmentTable.find(run.combat.environmentId)?.name ?? null;
  const parts = [`Act ${run.act}`, placeName(run), environment, `Depth ${run.depth}`];
  return parts.filter((part): part is string => part !== null).join(' · ');
}

/** Where the run stopped, and how far short of the landmark. */
function arrivalParagraph(run: RunState): string {
  const finale = ACT_FINALES[run.act];
  const place = placeName(run);
  const walked = plural(run.visited.length, 'place', 'places');

  if (run.outcome === 'won') {
    return `${walked} behind you, and ${finale} is one of them. The sect is still dead and the frontier is still collapsing, but you flew the whole line and came out the other end of it — which is more than the order you belonged to managed.`;
  }

  /* Before the first move there is no place to name and no distance to be
     short by, and the general sentence degenerates into "0 places into the
     act", which reads as a bug rather than as a fact. The outcome still has to
     survive that branch: quitting at the open chart is the ordinary way a run
     ends without starting, and it should not read like a death. */
  if (place === null) {
    return run.outcome === 'abandoned'
      ? 'You broke off at the arrival point, with the chart still open and nothing flown.'
      : 'The run ended at the arrival point, before the cutter went anywhere at all.';
  }

  if (run.outcome === 'abandoned') {
    return `You broke off at ${place}, ${walked} into the run, and did not come back for the rest of it.`;
  }

  if (atBoss(run)) {
    return `You reached ${finale}. ${walked} to get there, and it is where the cutter stopped.`;
  }

  const rows = rowsToBoss(run);
  const short =
    rows === null || rows <= 0
      ? ''
      : ` ${finale} was ${plural(rows, 'row', 'rows')} further up the chart.`;
  return `You fell at ${place}, ${walked} into the act.${short}`;
}

/**
 * The last fight, in the detail that makes it a memory.
 *
 * The enemy's remaining health is the whole reason this paragraph exists. "You
 * died in Act 2" is a fact; "you died with the Kiln Sovereign on four health"
 * is a run you will talk about, and it is also the clearest possible statement
 * of how much better a line you needed.
 */
function fightParagraph(run: RunState): string | null {
  const combat = run.combat;
  if (combat === null) return null;

  const standing = combat.enemies.filter((enemy) => enemy.hp > 0);
  const turns = plural(combat.turn, 'turn', 'turns');

  const survivors =
    standing.length === 0
      ? null
      : list(
          standing.map(
            (enemy) => `${enemyTable.find(enemy.defId)?.name ?? 'something'} on ${enemy.hp}`,
          ),
        );

  const opening =
    run.outcome === 'died'
      ? `It took ${turns}.`
      : `The last contact took ${turns}.`;

  const left = survivors === null ? ' Nothing was left standing.' : ` Still up: ${survivors}.`;

  const cooked =
    combat.heat >= HEAT.overheatAt
      ? ` The gauge read ${combat.heat} of ${HEAT.max} at the end — you were flying it hot and it was flying you back.`
      : '';

  const burned =
    combat.exhaust.length > 0
      ? ` ${plural(combat.exhaust.length, 'card', 'cards')} burned away and did not come back.`
      : '';

  return `${opening}${left}${cooked}${burned}`;
}

/** What was on the ship. Reads as an inventory because that is what it is. */
function shipParagraph(run: RunState): string | null {
  const pilot = run.pilot;
  const upgraded = pilot.deck.filter((card) => card.upgraded).length;
  const carried: string[] = [];

  const relicNames = named(relicTable, pilot.relics);
  const implantNames = named(implantTable, pilot.implants);
  const masteryNames = named(masteryTable, pilot.masteries);

  if (relicNames.length > 0) {
    carried.push(`${plural(relicNames.length, 'relic', 'relics')} — ${list(relicNames)}`);
  }
  if (implantNames.length > 0) {
    carried.push(
      `${plural(implantNames.length, 'implant', 'implants')} — ${list(tally(implantNames))}`,
    );
  }
  if (masteryNames.length > 0) {
    carried.push(
      `the ${list(masteryNames)} ${masteryNames.length === 1 ? 'mastery' : 'masteries'}`,
    );
  }

  const deck = `${plural(pilot.deck.length, 'card', 'cards')}${
    upgraded === 0 ? ', none of them upgraded' : `, ${upgraded} upgraded`
  }`;

  // Semicolons, not "and". Each entry already contains an em-dash sublist that
  // ends in "and", so joining the entries the same way produced "2 relics — X
  // and Y and 2 implants — Z", which is one sentence pretending to be two.
  const hold =
    carried.length === 0 ? 'Nothing in the hold but the deck.' : `In the hold: ${carried.join('; ')}.`;

  // The unspent Alloy is the most instructive number on the screen and the one
  // nobody wants to see. A death with a Station's worth of money on board is
  // not bad luck, and the epilogue should say so plainly rather than politely.
  const hoard =
    run.outcome !== 'won' && run.alloy >= 120
      ? ` ${run.alloy} Alloy went down with the ship, unspent.`
      : '';

  return `You were flying ${deck}. ${hold}${hoard}`;
}

/**
 * The bill you did not live to pay, or the favour you did not live to collect.
 *
 * Deliberately last. The Threads are the part of the run the player chose, and
 * an unfinished one is the strongest thing the end screen can say.
 */
function threadParagraph(run: RunState, unfinished: readonly ThreadDef[]): string | null {
  if (unfinished.length === 0) {
    const taken = run.threads.length;
    if (taken === 0) return null;
    return `Every thread you picked up came due before the end. ${plural(taken, 'obligation', 'obligations')}, all of them settled.`;
  }

  if (run.outcome === 'won') {
    return `${list(unfinished.map((def) => def.name))} never came due. Whatever they were going to be, they are somebody else's problem now.`;
  }

  const owed = unfinished.filter((def) => def.tone === 'costly');
  const due = unfinished.filter((def) => def.tone !== 'costly');

  const parts: string[] = [];
  if (due.length > 0) {
    parts.push(
      `${list(due.map((def) => def.name))} never paid out — you did not get far enough to collect.`,
    );
  }
  if (owed.length > 0) {
    parts.push(
      `${list(owed.map((def) => def.name))} will go uncollected too, which is the only good news here.`,
    );
  }
  return parts.join(' ');
}

/* ---------- the ledger ---------- */

function ledgerFor(run: RunState): readonly LedgerEntry[] {
  const pilot = run.pilot;
  const upgraded = pilot.deck.filter((card) => card.upgraded).length;
  const place = placeName(run);
  const rows: LedgerEntry[] = [
    { label: 'Reached', value: place === null ? `Act ${run.act}` : `Act ${run.act} — ${place}` },
    { label: 'Places', value: String(run.visited.length) },
    { label: 'Health', value: `${pilot.health} / ${pilot.maxHealth}` },
    { label: 'Deck', value: `${pilot.deck.length} cards, ${upgraded} upgraded` },
    { label: 'Alloy', value: String(run.alloy) },
    { label: 'Relics', value: pilot.relics.length === 0 ? '—' : String(pilot.relics.length) },
    { label: 'Implants', value: pilot.implants.length === 0 ? '—' : String(pilot.implants.length) },
    {
      label: 'Masteries',
      value: pilot.masteries.length === 0 ? '—' : list(named(masteryTable, pilot.masteries)),
    },
    { label: 'Anomalies', value: String(run.seenEvents.length) },
  ];
  return rows;
}

/* ---------- the whole thing ---------- */

export function epilogueFor(state: GameState): Epilogue | null {
  const run = state.run;
  if (run === null) return null;

  const unfinished = run.threads
    .filter((entry) => !entry.resolved)
    .map((entry) => threadTable.find(entry.threadId))
    .filter((def): def is ThreadDef => def !== undefined);

  const paragraphs = [
    arrivalParagraph(run),
    fightParagraph(run),
    shipParagraph(run),
    threadParagraph(run, unfinished),
  ].filter((part): part is string => part !== null && part !== '');

  return {
    headline: headlineFor(state, run),
    standfirst: standfirstFor(run),
    paragraphs,
    unfinished,
    ledger: ledgerFor(run),
  };
}
