/* Ship combat.
 *
 * The grid is the screen. You watch it tick, and you spend one verb a turn —
 * and which verbs you have at all is decided by what is bolted to the grid.
 *
 * Deliberately not a card game: no hand, no targeting, no per-shot decisions.
 * The build already made those.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import {
  VERB_LABEL,
  VERB_TEXT,
  availableInterventions,
  canIntervene,
  requireShipCombat,
  shipIntent,
} from '../../engine/ship/combat.ts';
import { adjacencyActive, footprintOf } from '../../engine/ship/grid.ts';
import { hullFraction } from '../../engine/queries.ts';
import { SHIP_COMBAT } from '../../content/balance.ts';
import { modules as moduleTable, shipEnemies, weapons } from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderLog, scrollLogToEnd } from '../components/log.ts';
import { setBarFill } from '../anim.ts';

export function renderShipCombat(store: Store): HTMLElement {
  return liveScreen(store, 'shipfight screen', (state) => {
    if (state.run === null || state.run.screen !== 'shipCombat') return null;
    const node = build(store, state);
    queueMicrotask(() => {
      const log = document.querySelector('.shipfight .log');
      if (log !== null) scrollLogToEnd(log);
    });
    return node;
  });
}

function build(store: Store, state: GameState): HTMLElement {
  const run = requireRun(state);
  const fight = requireShipCombat(state);
  const ship = run.ship;
  const enemyDef = shipEnemies.get(fight.enemy.defId);
  const weapon = weapons.get(ship.weaponId);
  const intent = shipIntent(state);
  const verbs = availableInterventions(ship);

  /* -- hull bars -- */
  const hullFill = el('span', { class: 'bar-fill' });
  setBarFill(hullFill, 'shipHull', hullFraction(run) * 100, true);

  const enemyFill = el('span', { class: 'bar-fill' });
  setBarFill(enemyFill, `shipEnemy:${fight.enemy.defId}`, (fight.enemy.hull / fight.enemy.maxHull) * 100, true);

  /* -- the enemy -- */
  const enemyPanel = el('section', { class: 'shipenemy' }, [
    el('div', { class: 'enemy-head' }, [
      el('span', { class: 'enemy-name' }, [enemyDef.name]),
      el('span', { class: 'enemy-hp' }, [`${fight.enemy.hull}/${fight.enemy.maxHull}`]),
      el('span', { class: `shield ${fight.enemy.shield > 0 ? 'is-up' : 'is-down'}` }, [
        el('span', { class: 'shield-icon', 'aria-hidden': 'true' }, ['⛨']),
        String(fight.enemy.shield),
      ]),
    ]),
    el('div', { class: 'bar bar--hp' }, [enemyFill]),
    el('div', { class: `intent ${intent !== null && intent.damage > 0 ? 'intent--attack' : 'intent--other'}` }, [
      el('span', { class: 'intent-icon', 'aria-hidden': 'true' }, [
        intent !== null && intent.damage > 0 ? '⚔' : '◆',
      ]),
      el('span', { class: 'intent-text' }, [
        intent === null
          ? 'Waiting'
          : intent.damage > 0
            ? `${intent.label}: ${intent.shots > 1 ? `${intent.shots} x ${intent.damage}` : intent.damage}`
            : `${intent.label}: shield ${intent.shield}`,
      ]),
    ]),
    el('p', { class: 'ship-flavor' }, [enemyDef.flavor ?? '']),
  ]);

  /* -- the grid -- */
  const cells: HTMLElement[] = [];
  for (let y = 0; y < ship.gridH; y++) {
    for (let x = 0; x < ship.gridW; x++) {
      cells.push(el('div', { class: 'grid-cell', style: `grid-column:${x + 1};grid-row:${y + 1}` }));
    }
  }

  const tiles = ship.placed.map((placed) => {
    const def = moduleTable.get(placed.moduleId);
    const size = footprintOf(placed.moduleId);
    const bonus = adjacencyActive(ship, placed.moduleId);
    return el(
      'div',
      {
        class: `grid-tile grid-tile--${def.kind}${bonus ? ' is-linked' : ''}`,
        style: `grid-column:${placed.x + 1}/span ${size.w};grid-row:${placed.y + 1}/span ${size.h}`,
        title: `${def.name}${bonus ? ' — linked' : ''}`,
      },
      [
        el('span', { class: 'tile-name' }, [def.name]),
        bonus ? el('span', { class: 'tile-link', 'aria-hidden': 'true' }, ['⚯']) : null,
      ],
    );
  });

  const grid = el(
    'div',
    {
      class: 'ship-grid',
      style: `grid-template-columns:repeat(${ship.gridW},1fr);grid-template-rows:repeat(${ship.gridH},1fr)`,
      'aria-label': 'Ship grid',
    },
    [...cells, ...tiles],
  );

  /* -- pools -- */
  const pools = el('div', { class: 'pools' }, [
    pool('HEAT', fight.pools.heat, `Overheats at ${SHIP_COMBAT.overheatAt} for ${SHIP_COMBAT.overheatDamage}. Carries between turns.`, fight.pools.heat >= SHIP_COMBAT.overheatAt - 2),
    pool('ENERGY', fight.pools.energy, 'Resets every turn.', false),
    pool('SINGULARITY', fight.pools.singularity, 'Carries. Amplifies every shot.', false),
    pool('SHIELD', fight.shield, 'Absorbs damage this turn.', false),
  ]);

  /* -- the one lever -- */
  const spent = fight.usedIntervention !== null;
  const verbButtons = verbs.map((verb) =>
    button(
      VERB_LABEL[verb],
      {
        class: `btn verb${fight.usedIntervention === verb ? ' is-used' : ''}`,
        disabled: spent || !canIntervene(state, verb),
        title: VERB_TEXT[verb],
      },
      () => store.dispatch({ kind: 'intervene', verb }),
    ),
  );

  const leverRow =
    verbs.length === 0
      ? el('p', { class: 'ship-note' }, [
          'Nothing on this grid grants a verb. Bolt on a heat sink, an array or an anchor and the fight stops being a spectator sport.',
        ])
      : el('div', { class: 'verbs' }, verbButtons);

  return el('div', { class: 'shipfight-inner' }, [
    renderRunBar(store, state),
    el('div', { class: 'stat stat--hull' }, [
      el('div', { class: 'hull-head' }, [
        el('span', { class: 'stat-label' }, ['CUTTER']),
        el('span', { class: 'stat-value' }, [`${ship.hull}/${ship.maxHull}`]),
        el('span', { class: 'shield is-down' }, [`${weapon.name} · ${weapon.shots} x ${weapon.damage}`]),
      ]),
      el('div', { class: 'bar bar--hull' }, [hullFill]),
    ]),
    enemyPanel,
    grid,
    pools,
    el('p', { class: 'ship-note' }, [
      spent
        ? `${VERB_LABEL[fight.usedIntervention!]} spent. Resolve the turn.`
        : 'One move a turn. Spend it, or hold it and let the grid do the work.',
    ]),
    leverRow,
    el('div', { class: 'tray-actions' }, [
      button('Resolve turn', { class: 'btn btn-primary' }, () => {
        store.dispatch({ kind: 'resolveShipTurn' });
      }),
    ]),
    renderLog(state, true),
  ]);
}

function pool(label: string, value: number, hint: string, hot: boolean): HTMLElement {
  return el('div', { class: `pool${hot ? ' is-hot' : ''}`, title: hint }, [
    el('span', { class: 'stat-label' }, [label]),
    el('span', { class: 'pool-value' }, [String(value)]),
    el('span', { class: 'pool-hint' }, [hint]),
  ]);
}
