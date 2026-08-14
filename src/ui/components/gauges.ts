/* The stance strip and the heat gauge.
 *
 * Both state their own consequences in plain words. The stance strip says what
 * the stance is doing; the heat gauge says the exact threshold and exactly
 * what happens at it. Never make the player remember, and never make them
 * infer — Darkest Dungeon's lesson was that hiding the number added confusion,
 * not tension.
 *
 * Every number here comes from an engine query. The UI computes nothing.
 */

import type { GameState } from '../../engine/types.ts';
import { heatStatus } from '../../engine/combat/heat.ts';
import { requireCombat } from '../../engine/state.ts';
import { HEAT, STANCES } from '../../content/balance.ts';
import { el } from '../dom.ts';

export function renderStanceStrip(state: GameState): HTMLElement {
  const combat = requireCombat(state);
  const stance = STANCES[combat.stance];

  return el('div', { class: 'stance-strip', 'data-stance': combat.stance }, [
    el('span', { class: 'stance-name' }, [`▶ ${stance.name} ◀`]),
    el('span', { class: 'stance-text' }, [stance.text]),
  ]);
}

export function renderHeatGauge(state: GameState): HTMLElement {
  const heat = heatStatus(state);

  const ticks = Array.from({ length: heat.max }, (_, index) => {
    const filled = index < heat.heat;
    const past = index + 1 >= heat.threshold;
    return el('span', {
      class: `heat-tick${filled ? ' is-filled' : ''}${past ? ' is-danger' : ''}`,
      'aria-hidden': 'true',
    });
  });

  return el('div', { class: `heat ${heat.overheating ? 'is-overheating' : ''}` }, [
    el('div', { class: 'heat-row' }, [
      el('span', { class: 'heat-label' }, ['HEAT']),
      el('div', { class: 'heat-ticks' }, ticks),
      el('span', { class: 'heat-value' }, [`${heat.heat} / ${heat.max}`]),
    ]),
    // aria-live so crossing a threshold is announced, not just coloured.
    el('p', { class: 'heat-consequence', role: 'status', 'aria-live': 'polite' }, [
      heat.overheating
        ? `OVERHEATING — end this turn and take ${heat.consequence}`
        : `Overheat at ${HEAT.overheatAt} → ${heat.consequence.replace(`Overheat at ${HEAT.overheatAt} — `, '')}`,
    ]),
  ]);
}

export function renderResources(state: GameState): HTMLElement {
  const combat = requireCombat(state);

  const pips = Array.from({ length: Math.max(3, combat.energy) }, (_, index) =>
    el('span', { class: `energy-pip${index < combat.energy ? ' is-full' : ''}`, 'aria-hidden': 'true' }),
  );

  return el('div', { class: 'resources' }, [
    el('span', { class: 'resource' }, [
      el('span', { class: 'resource-label' }, ['Block']),
      el('span', { class: 'resource-value' }, [String(combat.block)]),
    ]),
    el('span', { class: 'resource' }, [
      el('span', { class: 'resource-label' }, ['Focus']),
      el('span', { class: 'resource-value' }, [String(combat.focus)]),
    ]),
    el('span', { class: 'resource resource--energy' }, [
      el('span', { class: 'resource-label' }, ['Energy']),
      el('span', { class: 'energy-pips', 'aria-label': `${combat.energy} Energy` }, pips),
    ]),
  ]);
}
