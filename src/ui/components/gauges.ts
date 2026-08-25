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
import { stageHeat } from '../anim.ts';
import { renderSigil } from './sigil.ts';

export function renderStanceStrip(state: GameState): HTMLElement {
  const combat = requireCombat(state);
  // The live table, so a Stance Mastery is described rather than hidden. A
  // strip that still reads out the base stance after a Mastery rewrote it is
  // worse than no strip at all.
  const stance = liveStance(state);
  const limit = stanceChangeLimit(state);
  const held = Number.isFinite(limit) && combat.stanceChangesThisTurn >= limit;

  return el('div', { class: `stance-strip${held ? ' is-held' : ''}`, 'data-stance': combat.stance }, [
    /* The ronin, holding the stance. It goes here rather than in a panel of
       its own because the mark and the stance are the same fact — one body,
       differently held — and giving them separate homes would say otherwise. */
    renderSigil(combat.stance),
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

  /* Drawn at the value the gauge was ALREADY showing, not at the one state
     holds — `stageHeat` hands back whichever that is, and `stepHeat` walks the
     ticks the rest of the way on the same beat as the sound. Without the stage
     the gauge would snap to the answer before the animation that explains it,
     which is the same bug the health bars had. */
  const ticks = Array.from({ length: heat.max }, (_, index) =>
    el('span', {
      class: `heat-tick${index + 1 >= heat.threshold ? ' is-danger' : ''}`,
      'aria-hidden': 'true',
    }),
  );
  const drawAt = stageHeat(ticks, heat.heat);
  ticks.forEach((tick, index) => {
    if (index < drawAt) tick.classList.add('is-filled');
  });

  return el('div', { class: `heat ${heat.overheating ? 'is-overheating' : ''}` }, [
    el('div', { class: 'heat-row' }, [
      el('span', { class: 'heat-label' }, ['HEAT']),
      el('div', { class: 'heat-ticks' }, ticks),
      el('span', { class: 'heat-value' }, [`${heat.heat} / ${heat.max}`]),
    ]),
    /* Both thresholds on one line.
     *
     * The gauge only ever announced the soft one, so the hard one arrived as a
     * surprise — you reach the cap, the turn ends under you, and nothing on
     * screen had ever said it would. A cost you cannot read before paying it is
     * the definition of unfair. It sits in the same sentence rather than its
     * own paragraph because it is the same fact: this is what the gauge does to
     * you, at these two points.
     *
     * aria-live so crossing a threshold is announced, not just coloured. */
    el('p', { class: 'heat-consequence', role: 'status', 'aria-live': 'polite' }, [
      heat.overheating
        ? `OVERHEATING — end this turn and take ${heat.consequence}. At ${HEAT.criticalAt} the turn ends immediately.`
        : `Overheat at ${HEAT.overheatAt} → ${heat.consequence.replace(`Overheat at ${HEAT.overheatAt} — `, '')}. At ${HEAT.criticalAt} the turn ends immediately.`,
    ]),
  ]);
}

export function renderResources(state: GameState): HTMLElement {
  const combat = requireCombat(state);
  const stance = liveStance(state);

  /*
   * Focus is a bar, not a number.
   *
   * It used to be a digit plus a sentence explaining what the digit would be
   * worth — which is a lot of reading for a resource you glance at mid-turn,
   * and the sentence changed meaning with the stance so it never became
   * furniture you could stop parsing. Ticks are read at a glance and match the
   * Heat gauge directly above, so the two pressure readouts have one grammar.
   *
   * White rather than an accent colour: Heat owns hot, the stances own their
   * own hues, and Focus is the neutral thing both of them act on.
   */
  const focusTicks = Array.from({ length: FOCUS_MAX }, (_, index) =>
    el('span', {
      class: `focus-tick${index < combat.focus ? ' is-filled' : ''}`,
      'aria-hidden': 'true',
    }),
  );

  const pips = Array.from({ length: Math.max(3, combat.energy) }, (_, index) =>
    el('span', { class: `energy-pip${index < combat.energy ? ' is-full' : ''}`, 'aria-hidden': 'true' }),
  );

  // Block is not here: it lives beside the hull bar, next to the thing it
  // protects. Repeating it would be two numbers to keep in sync on screen.
  return el('div', { class: 'resources' }, [
    el(
      'span',
      {
        class: `resource resource--focus is-${stance.focusMode}`,
        tabindex: '0',
        // The explanation moves to the tooltip. It is worth reading once and
        // then never again, which is exactly what a tooltip is for.
        title:
          stance.focusMode === 'damage'
            ? `Focus ${combat.focus}/${FOCUS_MAX}: one stack is spent per card, adding ${stance.focusPerStack} damage to your next attack. In GUARD the same stack adds Block instead.`
            : `Focus ${combat.focus}/${FOCUS_MAX}: one stack is spent per card, adding ${stance.focusPerStack} Block to the next card that grants any. In IAI the same stack adds damage instead.`,
      },
      [
        el('span', { class: 'resource-label' }, ['Focus']),
        el(
          'span',
          { class: 'focus-ticks', 'aria-label': `${combat.focus} of ${FOCUS_MAX} Focus` },
          focusTicks,
        ),
      ],
    ),
    el('span', { class: 'resource resource--energy' }, [
      el('span', { class: 'resource-label' }, ['Energy']),
      el('span', { class: 'energy-pips', 'aria-label': `${combat.energy} Energy` }, pips),
    ]),
  ]);
}
