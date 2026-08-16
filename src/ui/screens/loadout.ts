/* The loadout — the grid, out of combat.
 *
 * Two-step, like everything else: pick a module, then pick a cell. Placement
 * is refused with the reason attached, because "installing over budget is
 * rejected with a clear reason" survived the change from a Power budget to
 * space. Un-fitting is always free.
 */

import type { GameState, ModuleDef, ModuleId } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { adjacencyActive, canPlace, footprintOf, freeCells } from '../../engine/ship/grid.ts';
import { availableInterventions, VERB_LABEL, VERB_TEXT } from '../../engine/ship/combat.ts';
import { modules as moduleTable, weapons } from '../../content/registry.ts';
import { button, el, withChildren } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';

interface Local {
  /** The module the player has picked up, waiting for a cell. */
  held: ModuleId | null;
  reason: string | null;
}

export function renderLoadout(store: Store): HTMLElement {
  const local: Local = { held: null, reason: null };
  let host: HTMLElement | null = null;

  const redraw = (): void => {
    const state = store.getState();
    if (state.run === null || state.run.screen !== 'ship') return;
    host?.replaceChildren(build(store, state, local, redraw));
  };

  host = liveScreen(store, 'loadout screen', (state) => {
    if (state.run === null || state.run.screen !== 'ship') return null;
    return build(store, state, local, redraw);
  });
  return host;
}

function build(store: Store, state: GameState, local: Local, redraw: () => void): HTMLElement {
  const run = requireRun(state);
  const ship = run.ship;
  const weapon = weapons.get(ship.weaponId);
  const verbs = availableInterventions(ship);

  /* -- the grid -- */
  const cells: HTMLElement[] = [];
  for (let y = 0; y < ship.gridH; y++) {
    for (let x = 0; x < ship.gridW; x++) {
      const legal = local.held === null ? null : canPlace(ship, local.held, x, y, local.held);
      const cell = button(
        '',
        {
          class: `grid-cell grid-cell--drop${legal?.ok === true ? ' is-legal' : ''}`,
          style: `grid-column:${x + 1};grid-row:${y + 1}`,
          'aria-label': `Cell ${x + 1}, ${y + 1}`,
          disabled: local.held === null,
        },
        () => {
          const held = local.held;
          if (held === null) return;
          const check = canPlace(ship, held, x, y, held);
          if (!check.ok) {
            local.reason = check.reason;
            redraw();
            return;
          }
          const onGrid = ship.placed.some((entry) => entry.moduleId === held);
          store.dispatch(
            onGrid
              ? { kind: 'moveModule', moduleId: held, x, y }
              : { kind: 'placeModule', moduleId: held, x, y },
          );
          local.held = null;
          local.reason = null;
        },
      );
      cells.push(cell);
    }
  }

  const tiles = ship.placed.map((placed) => {
    const def = moduleTable.get(placed.moduleId);
    const size = footprintOf(placed.moduleId);
    const linked = adjacencyActive(ship, placed.moduleId);
    const held = local.held === placed.moduleId;

    const node = button(
      '',
      {
        class: `grid-tile grid-tile--${def.kind}${linked ? ' is-linked' : ''}${held ? ' is-held' : ''}`,
        style: `grid-column:${placed.x + 1}/span ${size.w};grid-row:${placed.y + 1}/span ${size.h}`,
        title: describeModule(def, linked),
      },
      () => {
        local.held = held ? null : placed.moduleId;
        local.reason = null;
        redraw();
      },
    );
    return withChildren(node, [
      el('span', { class: 'tile-name' }, [def.name]),
      linked ? el('span', { class: 'tile-link', 'aria-hidden': 'true' }, ['⚯']) : null,
    ]);
  });

  const grid = el(
    'div',
    {
      class: 'ship-grid ship-grid--edit',
      style: `grid-template-columns:repeat(${ship.gridW},1fr);grid-template-rows:repeat(${ship.gridH},1fr)`,
      'aria-label': 'Ship grid',
    },
    [...cells, ...tiles],
  );

  /* -- storage -- */
  const storeRow =
    ship.stored.length === 0
      ? el('p', { class: 'ship-note' }, ['Nothing in storage. Elites drop modules.'])
      : el(
          'div',
          { class: 'store-row' },
          ship.stored.map((id, index) => {
            const def = moduleTable.get(id);
            const size = def.footprint;
            const held = local.held === id;
            const node = button(
              '',
              {
                class: `store-item${held ? ' is-held' : ''}`,
                title: describeModule(def, false),
                'aria-pressed': held ? 'true' : 'false',
                'data-index': String(index),
              },
              () => {
                local.held = held ? null : id;
                local.reason = null;
                redraw();
              },
            );
            return withChildren(node, [
              el('span', { class: 'store-name' }, [def.name]),
              el('span', { class: 'store-size' }, [`${size.w}×${size.h}`]),
            ]);
          }),
        );

  /* -- the held module's instructions -- */
  const prompt =
    local.reason !== null
      ? el('p', { class: 'ship-note ship-note--bad' }, [local.reason])
      : local.held === null
        ? el('p', { class: 'ship-note' }, [
            'Click a module, then a cell. Taking one off the grid is always free.',
          ])
        : el('p', { class: 'ship-note' }, [
            `${moduleTable.get(local.held).name} — pick a cell, or click it again to put it down.`,
          ]);

  const pullOff =
    local.held !== null && ship.placed.some((entry) => entry.moduleId === local.held)
      ? button('Take it off the grid', { class: 'btn' }, () => {
          const held = local.held;
          if (held === null) return;
          local.held = null;
          store.dispatch({ kind: 'unplaceModule', moduleId: held });
        })
      : null;

  return el('div', { class: 'loadout-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['The Cutter']),
    el('div', { class: 'loadout-facts' }, [
      fact('Hull', `${ship.hull}/${ship.maxHull}`),
      fact('Weapon', `${weapon.name} · ${weapon.shots} × ${weapon.damage}`),
      fact('Free cells', String(freeCells(ship))),
      fact('Verbs', verbs.length === 0 ? 'none' : verbs.map((v) => VERB_LABEL[v]).join(', ')),
    ]),
    run.crash === null
      ? null
      : el('p', { class: 'ship-note ship-note--bad' }, [
          `The drive is dead. ${run.crash.repairCost} Alloy to fly again — a Station or a Safe Planet can do the work.`,
        ]),
    prompt,
    grid,
    el('h2', { class: 'pause-heading' }, ['Storage']),
    storeRow,
    pullOff,
    verbs.length === 0
      ? el('p', { class: 'ship-note' }, [
          'No module here grants a verb, so a space fight would run without you. A heat sink, a sensor array or an anchor each give you something to spend.',
        ])
      : el(
          'ul',
          { class: 'verb-list' },
          verbs.map((verb) =>
            el('li', {}, [
              el('strong', {}, [VERB_LABEL[verb]]),
              ' — ',
              VERB_TEXT[verb],
            ]),
          ),
        ),
    button('Back to the map', { class: 'btn btn-primary' }, () => {
      store.dispatch({ kind: 'leaveNode' });
    }),
  ]);
}

function fact(label: string, value: string): HTMLElement {
  return el('div', { class: 'fact' }, [
    el('span', { class: 'fact-label' }, [label]),
    el('span', { class: 'fact-value' }, [value]),
  ]);
}

function describeModule(def: ModuleDef, linked: boolean): string {
  const parts = def.effects.map(describeEffect);
  if (def.adjacentTo !== undefined && def.adjacencyEffects !== undefined) {
    parts.push(
      `Touching a ${def.adjacentTo.join(' or ')}: ${def.adjacencyEffects.map(describeEffect).join(', ')}${linked ? ' (live)' : ''}`,
    );
  }
  if (def.grants !== undefined) parts.push(`Grants ${VERB_LABEL[def.grants]}.`);
  return `${def.name} — ${parts.join(' ')}`;
}

function describeEffect(effect: ModuleDef['effects'][number]): string {
  switch (effect.kind) {
    case 'produce':
      return `+${effect.amount} ${effect.resource} a turn.`;
    case 'convert':
      return `Turns up to ${effect.cap} ${effect.from} into ${effect.to} each turn.`;
    case 'damage':
      return `+${effect.amount} damage a turn.`;
    case 'shield':
      return `+${effect.amount} shield a turn.`;
    case 'amplify':
      return effect.perResource === undefined
        ? `Every shot hits for ${effect.amount} more.`
        : `Every shot hits for ${effect.per} more per ${effect.perResource}.`;
    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}
