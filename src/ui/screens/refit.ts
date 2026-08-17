/* The refit — parts before a space battle.
 *
 * A ship fight used to be whatever your grid already happened to be. You could
 * see it coming two nodes out on the map and there was nothing to do about it,
 * because the ship path only moved at Elites and Stations. Now every space node
 * offers parts on the approach and drops one off the wreck afterwards.
 *
 * The grid is still the limit, so this is not power inflation — it is the
 * packing puzzle finally having enough pieces to be a puzzle.
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

export function renderRefit(store: Store): HTMLElement {
  return liveScreen(store, 'refit screen', (state) => {
    if (state.run === null || state.run.screen !== 'refit') return null;
    return build(store, state);
  });
}

function build(store: Store, state: GameState): HTMLElement | null {
  const run = requireRun(state);
  const refit = run.pendingRefit;
  if (refit === null) return null;

  const enemy = shipEnemies.find(refit.enemyId);
  const free = freeCells(run.ship);

  return el('div', { class: 'refit-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Approach']),
    el('p', { class: 'safe-note' }, [
      enemy === undefined
        ? 'Something is holding this lane.'
        : `${enemy.name} is holding this lane. ${enemy.flavor ?? ''}`,
    ]),
    el('p', { class: 'ship-note' }, [
      `Take one. ${free} free cell${free === 1 ? '' : 's'} on the grid — fit it from the loadout before you launch, or carry it.`,
    ]),

    el(
      'div',
      { class: 'relic-row' },
      refit.moduleIds.map((moduleId) => {
        const def = moduleTable.find(moduleId);
        if (def === undefined) return null;
        const taken = refit.taken === moduleId;
        const node = button(
          '',
          {
            class: `relic-card${taken ? ' is-selected' : ''}`,
            'data-rarity': def.rarity,
            'aria-pressed': taken ? 'true' : 'false',
          },
          () => store.dispatch({ kind: 'takeRefitModule', moduleId }),
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
      button(refit.taken === null ? 'Launch with nothing' : 'Launch', { class: 'btn btn-primary' }, () =>
        store.dispatch({ kind: 'launchShipCombat' }),
      ),
    ]),
  ]);
}
