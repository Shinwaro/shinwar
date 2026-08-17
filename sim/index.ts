/* The headless balance runner.
 *
 * Runs under bare `node` — no extra dependency, because Node strips the types
 * itself and every relative import in this project carries its `.ts` extension.
 * That is why the extension convention exists.
 *
 *   npm run sim
 *   npm run sim -- --runs 2000 --depth 0
 *   npm run sim -- --runs 2000 --cards      (the full per-card table)
 *
 * What it reports and why, from `CLAUDE.md`:
 *
 *   pick rate x win rate   The pair is what identifies a problem. High pick AND
 *                          high win is overpowered; under 8% pick is a card
 *                          that is not in the game. Target band 8-60%.
 *   win rate by act        Where runs actually end. A cliff between two acts is
 *                          a difficulty step, not a difficulty curve.
 *   run length             Median target 45-70 minutes. With no saves, drifting
 *                          past 90 is a real problem.
 *   health per encounter   The attrition rate the whole run economy is priced
 *                          against.
 *   overheat frequency     Whether Heat is a mechanic or a decoration.
 *   per-environment delta   An environment that swings the win rate more than a
 *                          few points is rewriting the fight, not colouring it.
 *
 * Deterministic: same flags in, same numbers out. A diff in this report is a
 * diff in the game.
 */

import { loadContent } from '../src/content/index.ts';
import { contentCounts, validateContent, cards as cardTable } from '../src/content/registry.ts';
import { PLAYER, TARGETS } from '../src/content/balance.ts';
import { playRun, type RunReport } from './bot.ts';

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const runs = flag('runs', 400);
const depth = flag('depth', 0);
const showAllCards = process.argv.includes('--cards');

loadContent();

const issues = validateContent();
if (issues.length > 0) {
  for (const issue of issues) console.error(`content: ${issue.where}: ${issue.problem}`);
  process.exit(1);
}

/**
 * Turns to minutes.
 *
 * A rough constant, and it is honest about being rough: what it is really
 * tracking is whether run length is drifting, and for that a stable multiplier
 * is worth more than an accurate one. Roughly seven seconds of decision per
 * combat turn, plus the map, rewards and menus between fights.
 */
const SECONDS_PER_TURN = 7;
const SECONDS_PER_ENCOUNTER = 16;

function minutesOf(report: RunReport): number {
  return (report.turns * SECONDS_PER_TURN + report.encounters * SECONDS_PER_ENCOUNTER) / 60;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '  — ';
  return `${((part / whole) * 100).toFixed(0).padStart(3)}%`;
}

console.log(`shinwar sim — ${runs} runs at depth ${depth}`);
console.log(`content: ${JSON.stringify(contentCounts())}\n`);

const reports: RunReport[] = [];
for (let i = 0; i < runs; i++) reports.push(playRun(`SIM-${depth}-${i}`, depth));

const stuck = reports.filter((report) => report.outcome === 'stuck');
const played = reports.filter((report) => report.outcome !== 'stuck');

/* A stuck run means the bot asked the reducer for something it refused. That is
   a bug in the bot or a dead end in the run loop, and either way the numbers
   below are computed on fewer runs than were asked for — so it is loud. */
if (stuck.length > 0) {
  console.log(`!! ${stuck.length}/${runs} runs got stuck. The rest of this report excludes them.\n`);
}

const wins = played.filter((report) => report.won);

console.log('--- outcome ---');
console.log(`win rate        ${pct(wins.length, played.length)}   (target ${Math.round(TARGETS.winRateDepth0.min * 100)}-${Math.round(TARGETS.winRateDepth0.max * 100)}% at depth 0)`);
for (const act of [1, 2, 3] as const) {
  const reached = played.filter((report) => report.actReached >= act);
  const died = played.filter((report) => report.actReached === act && !report.won);
  console.log(`  act ${act}         reached ${pct(reached.length, played.length)}   ended here ${pct(died.length, played.length)}`);
}

console.log('\n--- length ---');
const minutes = played.map(minutesOf);
console.log(
  `median run      ${median(minutes).toFixed(0)} min   (target ${TARGETS.runMinutes.min}-${TARGETS.runMinutes.max}, ceiling ${TARGETS.runMinutes.hardCeiling})`,
);
console.log(`median turns    ${median(played.map((report) => report.turns)).toFixed(0)}`);
console.log(`median fights   ${median(played.map((report) => report.encounters)).toFixed(0)}`);

console.log('\n--- attrition ---');
const perEncounter = played
  .filter((report) => report.encounters > 0)
  .map((report) => report.healthLost / report.encounters);
console.log(`health / fight  ${median(perEncounter).toFixed(1)}`);
const overheats = played.map((report) => report.overheats);
console.log(
  `overheats / run ${median(overheats).toFixed(1)}   mean ${(overheats.reduce((a, b) => a + b, 0) / Math.max(1, overheats.length)).toFixed(2)}`,
);
const neverOverheated = played.filter((report) => report.overheats === 0).length;
console.log(`runs that never overheated  ${pct(neverOverheated, played.length)}`);

/* Where the health actually goes. A total says attrition is too high; this says
   which encounter is spending it, which is the number you can act on. */
const lost = new Map<string, number>();
const fights = new Map<string, number>();
for (const report of played) {
  for (const [kind, amount] of Object.entries(report.lostBy)) {
    lost.set(kind, (lost.get(kind) ?? 0) + amount);
  }
  for (const [kind, count] of Object.entries(report.fightsBy)) {
    fights.set(kind, (fights.get(kind) ?? 0) + count);
  }
}
const totalLost = [...lost.values()].reduce((a, b) => a + b, 0);
console.log('\nhealth spent, by what spent it:');
for (const [kind, amount] of [...lost.entries()].sort((a, b) => b[1] - a[1])) {
  const count = fights.get(kind) ?? 0;
  const each = count === 0 ? '' : `  ${(amount / count).toFixed(1)} each over ${count}`;
  console.log(`  ${kind.padEnd(12)} ${pct(amount, totalLost)} of all health lost${each}`);
}

/* ---------- the power curve ----------
   The question Robin actually asked: does the character change between the
   first fight and the first boss? A deck that grows while nothing else moves is
   the shape of "you are the same character". */

console.log('\n--- the power curve, at the end of a run ---');
console.log(`relics held     ${median(played.map((r) => r.relics)).toFixed(1)}`);
console.log(`implants fitted ${median(played.map((r) => r.implants)).toFixed(1)}`);
console.log(`masteries       ${median(played.map((r) => r.masteries)).toFixed(1)}`);
console.log(
  `deck size       ${median(played.map((r) => r.deckSize)).toFixed(0)}   (starts at ${PLAYER.startingDeckSize})`,
);
console.log(`cards forged    ${median(played.map((r) => r.upgraded)).toFixed(1)}`);
console.log(
  `max health      ${median(played.map((r) => r.maxHealth)).toFixed(0)}   (starts at ${PLAYER.maxHealth})`,
);

const reachedAct2 = played.filter((r) => r.actReached >= 2);
if (reachedAct2.length > 0) {
  console.log(
    `  of runs reaching Act 2: ${median(reachedAct2.map((r) => r.relics)).toFixed(1)} relics, ` +
      `${median(reachedAct2.map((r) => r.upgraded)).toFixed(1)} forged, ` +
      `deck ${median(reachedAct2.map((r) => r.deckSize)).toFixed(0)}`,
  );
}

/* ---------- cards ----------
   Offered against taken is the pick rate; win rate is measured over the runs
   that ended with the card in the deck. Neither number means much alone. */

console.log('\n--- cards: pick rate x win rate ---');

interface CardStat {
  offered: number;
  taken: number;
  inDeckRuns: number;
  inDeckWins: number;
}

const stats = new Map<string, CardStat>();
function statOf(id: string): CardStat {
  const existing = stats.get(id);
  if (existing !== undefined) return existing;
  const fresh: CardStat = { offered: 0, taken: 0, inDeckRuns: 0, inDeckWins: 0 };
  stats.set(id, fresh);
  return fresh;
}

for (const report of played) {
  for (const id of report.offered) statOf(id).offered += 1;
  for (const id of report.taken) statOf(id).taken += 1;
  for (const id of new Set(report.finalDeck)) {
    const stat = statOf(id);
    stat.inDeckRuns += 1;
    if (report.won) stat.inDeckWins += 1;
  }
}

const rows = [...stats.entries()]
  .filter(([id]) => cardTable.find(id)?.rarity !== 'basic')
  .map(([id, stat]) => ({
    id,
    name: cardTable.find(id)?.name ?? id,
    rarity: cardTable.find(id)?.rarity ?? '?',
    pick: stat.offered === 0 ? null : stat.taken / stat.offered,
    win: stat.inDeckRuns === 0 ? null : stat.inDeckWins / stat.inDeckRuns,
    offered: stat.offered,
  }))
  .sort((a, b) => (b.pick ?? -1) - (a.pick ?? -1));

const low = TARGETS.pickRateBand.min;
const high = TARGETS.pickRateBand.max;

function flagOf(row: (typeof rows)[number]): string {
  if (row.pick === null || row.offered < 8) return 'thin sample';
  if (row.pick > high && (row.win ?? 0) > 0.6) return 'OVERPOWERED';
  if (row.pick > high) return 'near-mandatory';
  if (row.pick < low) return 'not in the game';
  return '';
}

const shown = showAllCards ? rows : rows.filter((row) => flagOf(row) !== '');
if (!showAllCards) {
  console.log(`(only cards outside the ${low * 100}-${high * 100}% band; --cards for all ${rows.length})\n`);
}

console.log('  card                     rarity      pick    win   seen');
for (const row of shown) {
  console.log(
    `  ${row.name.padEnd(24)} ${String(row.rarity).padEnd(10)} ` +
      `${row.pick === null ? '  — ' : `${(row.pick * 100).toFixed(0).padStart(3)}%`} ` +
      `${row.win === null ? '  — ' : `${(row.win * 100).toFixed(0).padStart(4)}%`} ` +
      `${String(row.offered).padStart(6)}  ${flagOf(row)}`,
  );
}
if (shown.length === 0) console.log('  every card inside the band.');

/* ---------- environments ---------- */

console.log('\n--- environments: win rate delta ---');
const envRuns = new Map<string, { runs: number; wins: number }>();
for (const report of played) {
  for (const id of new Set(report.environments)) {
    const entry = envRuns.get(id) ?? { runs: 0, wins: 0 };
    entry.runs += 1;
    if (report.won) entry.wins += 1;
    envRuns.set(id, entry);
  }
}
const baseline = wins.length / Math.max(1, played.length);
for (const [id, entry] of [...envRuns.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const rate = entry.wins / Math.max(1, entry.runs);
  const delta = (rate - baseline) * 100;
  console.log(
    `  ${id.padEnd(20)} ${pct(entry.wins, entry.runs)}  ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts   over ${entry.runs} runs`,
  );
}

console.log('');
