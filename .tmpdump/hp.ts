import { reloadContent } from '../src/content/index.ts';
reloadContent();
import { ENCOUNTERS } from '../src/content/encounters.ts';
import { ENEMIES } from '../src/content/enemies/index.ts';
const by = new Map(ENEMIES.map((e) => [e.id, e]));

// Rough per-turn output: sum the biggest attack template on each move, averaged.
function threat(id: string): number {
  const d = by.get(id);
  if (d === undefined) return 0;
  const per = d.moves.map((m) =>
    m.intent.reduce((n, h) => n + (h.kind === 'attack' ? h.amount * Math.max(1, h.times) : 0), 0),
  );
  return per.length === 0 ? 0 : Math.round(per.reduce((a, b) => a + b, 0) / per.length);
}

const rows = ENCOUNTERS.filter((e) => e.tutorial !== true).map((e) => ({
  act: e.act, tier: e.tier, name: e.name, n: e.enemyIds.length,
  hp: e.enemyIds.reduce((s, id) => s + (by.get(id)?.maxHp ?? 0), 0),
  dpt: e.enemyIds.reduce((s, id) => s + threat(id), 0),
  solo: e.enemyIds.length === 1,
  parts: e.enemyIds.map((id) => `${by.get(id)?.name}(${by.get(id)?.maxHp})`).join(' + '),
}));

for (const act of [1, 2, 3] as const) {
  for (const tier of ['normal', 'elite', 'boss'] as const) {
    const set = rows.filter((r) => r.act === act && r.tier === tier);
    if (set.length === 0) continue;
    const hp = set.map((r) => r.hp);
    console.log(`\n=== act ${act} ${tier} — hull ${Math.min(...hp)}..${Math.max(...hp)} (avg ${Math.round(hp.reduce((a,b)=>a+b,0)/hp.length)})`);
    for (const r of set.sort((a, b) => a.hp - b.hp)) {
      console.log(`  ${String(r.hp).padStart(4)} hull ${String(r.dpt).padStart(3)}/turn  ${r.solo ? 'SOLO ' : `${r.n}-wide`}  ${r.name.padEnd(18)} ${r.parts}`);
    }
  }
}
