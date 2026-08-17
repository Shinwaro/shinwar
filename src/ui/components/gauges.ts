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
import { liveStance, stanceChangeLimit } from '../../engine/combat/rules.ts';
import { FOCUS_MAX, HEAT } from '../../content/balance.ts';
import { CLEAR_SPACE_ID } from '../../content/environments.ts';
import {
  environments as environmentTable,
  masteries as masteryTable,
} from '../../content/registry.ts';
import { el } from '../dom.ts';

export function renderStanceStrip(state: GameState): HTMLElement {
  const combat = requireCombat(state);
  // The live table, so a Stance Mastery is described rather than hidden. A
  // strip that still reads out the base stance after a Mastery rewrote it is
  // worse than no strip at all.
  const stance = liveStance(state);
  const limit = stanceChangeLimit(state);
  const held = Number.isFinite(limit) && combat.stanceChangesThisTurn >= limit;

  return el('div', { class: `stance-strip${held ? ' is-held' : ''}`, 'data-stance': combat.stance }, [
    el('span', { class: 'stance-name' }, [`▶ ${stance.name} ◀`]),
    el('span', { class: 'stance-text' }, [stance.text]),
    stance.masteries.length === 0
      ? null
      : el('span', { class: 'stance-mastery' }, [
          stance.masteries.map((id) => masteryTable.find(id)?.name ?? id).join(' · '),
        ]),
    !Number.isFinite(limit)
      ? null
      : el('span', { class: 'stance-limit' }, [
          held
            ? 'No stance changes left this turn'
            : `${limit - combat.stanceChangesThisTurn} stance change${limit - combat.stanceChangesThisTurn === 1 ? '' : 's'} left`,
        ]),
  ]);
}

/** The badge for the fight's environment. Always on screen, never on hover. */
export function renderEnvironmentBadge(state: GameState): HTMLElement | null {
  const combat = requireCombat(state);
  const def = environmentTable.find(combat.environmentId);
  if (def === undefined || def.id === CLEAR_SPACE_ID) return null;

  return el('div', { class: 'env-badge', 'data-environment': def.id }, [
    el('span', { class: 'env-name' }, [def.name]),
    el('span', { class: 'env-text' }, [def.text]),
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

  // Which stance you are standing in decides whether Focus is a bank or a
  // payload, so the readout has to say which it is right now. This is the one
  // number on screen whose meaning changes with the axis.
  const stance = liveStance(state);
  const worth = combat.focus * stance.focusPerStack;

  // Block is not here: it lives beside the hull bar, next to the thing it
  // protects. Repeating it would be two numbers to keep in sync on screen.
  return el('div', { class: 'resources' }, [
    el(
      'span',
      {
        class: `resource resource--info${stance.spendsFocus ? ' is-armed' : ' is-banking'}`,
        tabindex: '0',
        title: stance.spendsFocus
          ? `Focus: your next attack takes the whole stack and deals ${stance.focusPerStack} more damage per stack. Stances that bank Focus keep it instead.`
          : `Focus: banked in ${stance.name} and spent nowhere. Change to a stance that spends it to cash the stack. Caps at ${FOCUS_MAX}.`,
      },
      [
        el('span', { class: 'resource-label' }, ['Focus']),
        el('span', { class: 'resource-value' }, [`${combat.focus}${combat.focus >= FOCUS_MAX ? ' (max)' : ''}`]),
        el('span', { class: 'resource-hint' }, [
          combat.focus === 0
            ? `+${stance.focusPerStack} per stack when spent`
            : stance.spendsFocus
              ? `next attack +${worth}, then spent`
              : `banked · worth +${worth} in a stance that spends it`,
        ]),
      ],
    ),
    el('span', { class: 'resource resource--energy' }, [
      el('span', { class: 'resource-label' }, ['Energy']),
      el('span', { class: 'energy-pips', 'aria-label': `${combat.energy} Energy` }, pips),
    ]),
  ]);
}
