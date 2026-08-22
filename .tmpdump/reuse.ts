import { reloadContent } from '../src/content/index.ts';
reloadContent();
import { ENCOUNTERS } from '../src/content/encounters.ts';
import { ENEMIES } from '../src/content/enemies/index.ts';
const by = new Map(ENEMIES.map((e) => [e.id, e]));
const uses = new Map<string, string[]>();
for (const e of ENCOUNTERS) {
  if (e.tutorial === true) continue;
  for (const id of e.enemyIds) uses.set(id, [...(uses.get(id) ?? []), `${e.name}[${e.tier}]`]);
}
for (const [id, where] of [...uses].sort()) {
  const d = by.get(id);
  if (d === undefined || d.tier === 'normal') continue;
  console.log(`${d.tier.padEnd(5)} act${d.act} ${d.name.padEnd(20)} hull ${String(d.maxHp).padStart(3)}  in: ${where.join(', ')}`);
}
