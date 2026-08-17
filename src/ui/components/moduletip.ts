/* What a module says about itself.
 *
 * One implementation, used by the loadout, the shop and the reward screen, so a
 * module cannot describe itself two different ways depending on where you meet
 * it. Generated from the data — the same rule as card text, for the same
 * reason: hand-written module text drifts the instant a number is tuned.
 *
 * The synergy line is the important one. Adjacency bonuses are keyed to KINDS,
 * which is invisible unless the tooltip says so out loud — "wants to touch a
 * reactor" is a packing instruction, and a packing puzzle whose rules you have
 * to infer from a glowing border is a puzzle nobody solves on purpose.
 */

import type { ModuleDef, ModuleId, ShipState, ShipStat, ShipStats } from '../../engine/types.ts';
import { VERB_LABEL } from '../../engine/ship/combat.ts';
import { activeSynergies } from '../../engine/ship/stats.ts';
import { modules as moduleTable } from '../../content/registry.ts';

const STAT_TEXT: { readonly [K in ShipStat]: (value: number) => string } = {
  critChance: (v) => `+${Math.round(v * 100)}% crit chance`,
  critBonus: (v) => `+${Math.round(v * 100)}% crit damage`,
  flatDamage: (v) => `+${v} damage per shot`,
  damageReduction: (v) => `-${v} from every hit taken`,
  parryChance: (v) => `${Math.round(v * 100)}% to parry`,
  pierce: (v) => `pierces ${v} shield`,
  shieldPerTurn: (v) => `+${v} shield a turn`,
  lifesteal: (v) => `+${v} hull a turn while firing`,
  extraShots: (v) => `+${v} shot${v === 1 ? '' : 's'}`,
};

const RESOURCE_TEXT: Readonly<Record<string, string>> = {
  heat: 'Heat',
  energy: 'Energy',
  singularity: 'Singularity',
};

export function describeStats(stats: ShipStats | undefined): readonly string[] {
  if (stats === undefined) return [];
  const out: string[] = [];

  for (const key of Object.keys(STAT_TEXT) as readonly ShipStat[]) {
    const value = stats[key];
    if (value === undefined || value === 0) continue;
    out.push(STAT_TEXT[key](value));
  }

  for (const entry of stats.scaling ?? []) {
    const per = STAT_TEXT[entry.stat](entry.per).replace(/^\+?/, '');
    out.push(`${per} per ${RESOURCE_TEXT[entry.resource] ?? entry.resource} (up to ${entry.cap})`);
  }

  return out;
}

function describeEffect(effect: ModuleDef['effects'][number]): string {
  switch (effect.kind) {
    case 'produce':
      return `+${effect.amount} ${effect.resource} a turn`;
    case 'convert':
      return `turns up to ${effect.cap} ${effect.from} into ${effect.to} each turn`;
    case 'damage':
      return `+${effect.amount} damage a turn`;
    case 'shield':
      return `+${effect.amount} shield a turn`;
    case 'amplify':
      return effect.perResource === undefined
        ? `every shot hits for ${effect.amount} more`
        : `every shot hits for ${effect.per} more per ${effect.perResource}`;
    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}

/**
 * The full description, as lines.
 *
 * `ship` is optional: on a shop shelf there is no grid to be adjacent to yet,
 * so the synergy line states what it *wants* rather than what it has.
 */
export function moduleLines(moduleId: ModuleId, ship?: ShipState): readonly string[] {
  const def = moduleTable.get(moduleId);
  const lines: string[] = [];

  const base = [...def.effects.map(describeEffect), ...describeStats(def.stats)];
  if (base.length > 0) lines.push(base.join(' · '));

  const wants = def.adjacentTo;
  if (wants !== undefined && wants.length > 0) {
    const bonus = [
      ...(def.adjacencyEffects ?? []).map(describeEffect),
      ...describeStats(def.adjacencyStats),
    ];
    const kinds = wants.length >= 6 ? 'anything' : `a ${wants.join(' or a ')}`;
    const live = ship === undefined ? [] : activeSynergies(ship, moduleId);

    lines.push(
      live.length > 0
        ? `LINKED to ${live.join(', ')} — ${bonus.join(' · ')}`
        : `Touching ${kinds}: ${bonus.join(' · ')}`,
    );
  }

  if (def.grants !== undefined) lines.push(`Grants ${VERB_LABEL[def.grants]}.`);
  if (def.kind === 'cargo') lines.push('Cargo. Takes up room and does nothing else.');

  return lines;
}

/** One string, for a `title` attribute. */
export function moduleTip(moduleId: ModuleId, ship?: ShipState): string {
  return `${moduleTable.get(moduleId).name} — ${moduleLines(moduleId, ship).join('\n')}`;
}
