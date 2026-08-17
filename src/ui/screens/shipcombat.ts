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
import { adjacencyActive, cellsOf } from '../../engine/ship/grid.ts';
import { shipStats } from '../../engine/ship/stats.ts';
import { hullFraction } from '../../engine/queries.ts';
import { SHIP_COMBAT } from '../../content/balance.ts';
import { modules as moduleTable, shipEnemies, weapons } from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderLog, scrollLogToEnd } from '../components/log.ts';
import { setBarFill } from '../anim.ts';
import { moduleTip } from '../components/moduletip.ts';

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

    /* Where the volley goes. Free to change, decided fresh every turn — this
       is the choice you always get, whatever the grid looks like. */
    el('div', { class: 'targets' }, [
      aimButton(store, 'hull', enemyDef.name, fight.target === 'hull', false, null),
      ...enemyDef.subsystems.map((sub) => {
        const live = fight.enemy.subsystems.find((entry) => entry.id === sub.id);
        const wrecked = (live?.hp ?? 0) <= 0;
        return aimButton(
          store,
          sub.id,
          `${sub.name} ${wrecked ? '—' : `${live?.hp ?? 0}/${live?.maxHp ?? sub.hp}`}`,
          fight.target === sub.id,
          wrecked,
          sub.text,
        );
      }),
    ]),
  ]);

  /* -- the grid -- */
  const cells: HTMLElement[] = [];
  for (let y = 0; y < ship.gridH; y++) {
    for (let x = 0; x < ship.gridW; x++) {
      cells.push(el('div', { class: 'grid-cell', style: `grid-column:${x + 1};grid-row:${y + 1}` }));
    }
  }

  // One tile per occupied cell: with real shapes on the grid, a span across a
  // bounding box would paint over the notch an L leaves behind.
  const tiles = ship.placed.flatMap((placed) => {
    const def = moduleTable.get(placed.moduleId);
    const bonus = adjacencyActive(ship, placed.moduleId);
    const order = fight.triggered.indexOf(placed.moduleId);

    return cellsOf(placed).map((cell, index) =>
      el(
        'div',
        {
          class: `grid-tile grid-tile--${def.kind}${bonus ? ' is-linked' : ''}`,
          style:
            `grid-column:${cell.x + 1};grid-row:${cell.y + 1}` +
            // Staggered off the resolver's own firing order, so the chain
            // lights up in the order it actually resolved rather than in
            // whatever order the array happens to be in.
            (order >= 0 ? `;--fire-delay:${order * 110}ms` : ''),
          title: moduleTip(placed.moduleId, ship),
          'data-fired': order >= 0 ? String(fight.turn) : null,
        },
        [
          index === 0 ? el('span', { class: 'tile-name' }, [def.name]) : null,
          index === 0 && bonus ? el('span', { class: 'tile-link', 'aria-hidden': 'true' }, ['⚯']) : null,
        ],
      ),
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

  /* -- what the grid currently adds up to --
     The build is doing something every turn whether or not you press anything,
     so it has to be on screen. Scaling stats move as the pools move, which is
     the whole reason they are worth having. */
  const stats = shipStats(ship, fight.pools);
  const statRow = el('div', { class: 'ship-stats' }, [
    stats.critChance > 0
      ? statChip('CRIT', `${Math.round(stats.critChance * 100)}%`, `x${(1.5 + stats.critBonus).toFixed(2)} when it lands`)
      : null,
    stats.flatDamage > 0 ? statChip('DMG', `+${Math.round(stats.flatDamage)}`, 'per shot') : null,
    stats.extraShots > 0 ? statChip('SHOTS', `+${Math.round(stats.extraShots)}`, 'per volley') : null,
    stats.pierce > 0 ? statChip('PIERCE', String(Math.round(stats.pierce)), 'ignores this much shield') : null,
    stats.damageReduction > 0
      ? statChip('SOAK', `-${Math.round(stats.damageReduction)}`, 'off every hit taken')
      : null,
    stats.parryChance > 0 ? statChip('PARRY', `${Math.round(stats.parryChance * 100)}%`, 'to turn a volley aside') : null,
    stats.lifesteal > 0 ? statChip('SIPHON', `+${Math.round(stats.lifesteal)}`, 'hull a turn') : null,
  ]);

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
    statRow,
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

function aimButton(
  store: Store,
  target: string,
  label: string,
  aimed: boolean,
  wrecked: boolean,
  hint: string | null,
): HTMLElement {
  return button(
    label,
    {
      class: `target${aimed ? ' is-aimed' : ''}${wrecked ? ' is-wrecked' : ''}`,
      disabled: wrecked,
      'aria-pressed': aimed ? 'true' : 'false',
      title: hint ?? 'Aim at the hull. Ends the fight sooner.',
    },
    () => store.dispatch({ kind: 'aimAt', target }),
  );
}

function statChip(label: string, value: string, hint: string): HTMLElement {
  return el('span', { class: 'ship-stat', title: hint }, [
    el('span', { class: 'stat-label' }, [label]),
    el('span', { class: 'ship-stat-value' }, [value]),
  ]);
}

function pool(label: string, value: number, hint: string, hot: boolean): HTMLElement {
  return el('div', { class: `pool${hot ? ' is-hot' : ''}`, title: hint }, [
    el('span', { class: 'stat-label' }, [label]),
    el('span', { class: 'pool-value' }, [String(value)]),
    el('span', { class: 'pool-hint' }, [hint]),
  ]);
}
