/* The headless balance runner.
 *
 * Runs under bare `node` — no extra dependency, because Node strips the types
 * itself and every relative import in this project carries its `.ts`
 * extension. That is why the extension convention exists.
 *
 * The real thing arrives at M6 and must not be deferred past it: the engine is
 * pure and seeded, so a bot playing 10,000 runs is nearly free once there is a
 * game to play, and per-card pick rate crossed against win rate is worth more
 * than any amount of solo playtesting.
 *
 *   npm run sim -- --runs 5000 --depth 0
 */

import { createInitialState } from '../src/engine/state.ts';
import { applyActions } from '../src/engine/reducer.ts';
import { hashState } from '../src/engine/serialize.ts';
import { loadContent } from '../src/content/index.ts';
import { contentCounts, validateContent } from '../src/content/registry.ts';

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const raw = process.argv[index + 1];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const runs = flag('runs', 100);
const depth = flag('depth', 0);

loadContent();

const issues = validateContent();
if (issues.length > 0) {
  for (const issue of issues) console.error(`content: ${issue.where}: ${issue.problem}`);
  process.exit(1);
}

console.log(`shinwar sim — ${runs} runs at depth ${depth}`);
console.log(`content: ${JSON.stringify(contentCounts())}`);

// Proof the engine runs headless and reproducibly. Everything the build prompt
// §8 asks for — pick rate against win rate, hull lost per encounter,
// per-environment deltas, overheat frequency, estimated minutes — lands at M6,
// once there is a fight for the bot to lose.
const sample = applyActions(createInitialState(`SIM-${depth}`, depth), [{ kind: 'beginRun' }]);
console.log(`sample run state hash: ${hashState(sample)}`);
console.log('No bot yet. The simulator is built at M6.');
