/* The wreck — three parts off a ship you just beat, take one.
 *
 * After the fight rather than before it. A module handed out on the approach to
 * every space battle arrived on a schedule, and a reward on a schedule is not a
 * reward; it also filled the grid without the player ever choosing what went on
 * it. Here it is a decision about the run, made knowing what the fight cost.
 *
 * The loadout is one click away, because "will this even fit" is half of what
 * you are deciding.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { freeCells } from '../../engine/ship/grid.ts';
import { RARITY_LABEL } from '../../content/balance.ts';
import { modules as moduleTable, shipEnemies } from '../../content/registry.ts';
import { button, el, withChildren } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { moduleLines } from '../components/moduletip.ts';

export function renderSalvage(store: Store): HTMLElement {
  return liveScreen(store, 'salvage screen', (state) => {
    if (state.run === null || state.run.screen !== 'salvage') return null;
    return build(store, state);
  });
}

function build(store: Store, state: GameState): HTMLElement | null {
  const run = requireRun(state);
  const salvage = run.pendingSalvage;
  if (salvage === null) return null;

  const enemy = shipEnemies.find(salvage.enemyId);
  const free = freeCells(run.ship);

  return el('div', { class: 'salvage-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['The Wreck']),
    el('p', { class: 'safe-note' }, [
      enemy === undefined
        ? 'Whatever it was, it is parts now.'
        : `${enemy.name}, in pieces. Three of them are worth carrying.`,
    ]),
    el('p', { class: 'ship-note' }, [
      `Take one. ${free} free cell${free === 1 ? '' : 's'} on the grid — a shape that will not fit today is a reason to buy a bay extension, not a reason to leave it.`,
    ]),

    el(
      'div',
      { class: 'relic-row' },
      salvage.moduleIds.map((moduleId) => {
        const def = moduleTable.find(moduleId);
        if (def === undefined) return null;
        const taken = salvage.taken === moduleId;
        const node = button(
          '',
          {
            class: `relic-card${taken ? ' is-selected' : ''}`,
            'data-rarity': def.rarity,
            'aria-pressed': taken ? 'true' : 'false',
          },
          () => store.dispatch({ kind: 'takeSalvage', moduleId }),
        );
        return withChildren(node, [
          el('div', { class: 'card-head' }, [
            el('span', { class: 'card-cost' }, [`${def.footprint.w}x${def.footprint.h}`]),
            el('span', { class: 'card-name' }, [def.name]),
            el('span', { class: `card-badge card-badge--${def.rarity}` }, [RARITY_LABEL[def.rarity]]),
          ]),
          ...moduleLines(moduleId, run.ship).map((line) => el('p', { class: 'card-text' }, [line])),
          def.flavor === undefined ? null : el('p', { class: 'card-flavor' }, [def.flavor]),
        ]);
      }),
    ),

    el('div', { class: 'reward-actions' }, [
      button('Open the loadout', { class: 'btn' }, () => store.dispatch({ kind: 'openLoadout' })),
      button(
        salvage.taken === null ? 'Leave it all' : 'Take it and go',
        { class: 'btn btn-primary' },
        () => store.dispatch({ kind: 'leaveSalvage' }),
      ),
    ]),
  ]);
}
