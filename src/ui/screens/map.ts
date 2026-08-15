/* The star map.
 *
 * Drawn boss-first, top to bottom, the way the player climbs it. Every combat
 * node shows its environment badge **before** the player commits to the route
 * — that is the whole reason the map is a decision surface and not a corridor.
 *
 * Reachable nodes are the only ones that respond. Everything else is legible
 * but inert, so the player can read three columns ahead and plan.
 */

import type { GameState, MapNode } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { availableMoves, currentNode, describeNode, rowsOf } from '../../engine/map/route.ts';
import { encountersFor } from '../../content/encounters.ts';
import { environments } from '../../content/registry.ts';
import { button, el, fill } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';

const GLYPH: Record<MapNode['type'], string> = {
  combat: '⚔',
  elite: '☠',
  boss: '✷',
  event: '◈',
  station: '⌾',
  safe: '◉',
  unknown: '?',
  crash: '✖',
  wreck: '⚒',
};

function environmentName(node: MapNode): string | null {
  if (node.environmentId === null) return null;
  return environments.find(node.environmentId)?.name ?? null;
}

function encounterName(node: MapNode): string | null {
  if (node.encounterId === null) return null;
  const all = [...encountersFor(1, 'normal'), ...encountersFor(1, 'elite'), ...encountersFor(1, 'boss')];
  return all.find((entry) => entry.id === node.encounterId)?.name ?? null;
}

export function renderMap(store: Store): HTMLElement {
  return liveScreen(store, 'map screen', (state) => {
    if (state.run === null || state.run.screen !== 'map') return null;
    return buildMap(store, state);
  });
}

function buildMap(store: Store, state: GameState): HTMLElement {
  const run = requireRun(state);
  const map = run.map;
  if (map === null) return el('div', { class: 'map-inner' }, ['No map.']);

  const reachable = new Set(availableMoves(run).map((node) => node.id));
  const here = currentNode(run);
  const visited = new Set(run.visited);

  const rows = rowsOf(map).map((row, index) =>
    el(
      'div',
      { class: 'map-row', 'data-row': String(index) },
      row.map((node) => renderNode(store, state, node, {
        reachable: reachable.has(node.id),
        current: here?.id === node.id,
        visited: visited.has(node.id),
      })),
    ),
  );

  return el('div', { class: 'map-inner' }, [
    renderRunBar(store, state),
    el('p', { class: 'map-hint' }, [
      run.position === null
        ? 'Choose where to enter the system. Every combat shows its environment before you commit.'
        : 'Choose your next jump.',
    ]),
    el('div', { class: 'map-grid', role: 'group', 'aria-label': 'Star map' }, rows),
  ]);
}

interface NodeFlags {
  readonly reachable: boolean;
  readonly current: boolean;
  readonly visited: boolean;
}

function renderNode(store: Store, state: GameState, node: MapNode, flags: NodeFlags): HTMLElement {
  const classes = ['map-node', `map-node--${node.type}`];
  if (flags.reachable) classes.push('is-reachable');
  if (flags.current) classes.push('is-current');
  if (flags.visited) classes.push('is-visited');

  const environment = environmentName(node);
  const encounter = encounterName(node);

  const label = [describeNode(node), encounter, environment].filter((part) => part !== null).join(' · ');

  const node_ = button(
    '',
    {
      class: classes.join(' '),
      style: `--col:${node.col}`,
      disabled: !flags.reachable,
      'aria-label': label,
      title: label,
    },
    () => {
      if (!flags.reachable) return;
      store.dispatch({ kind: 'moveToNode', nodeId: node.id });
    },
  );

  fill(node_, [
    el('span', { class: 'map-glyph', 'aria-hidden': 'true' }, [GLYPH[node.type]]),
    // The environment badge is on the node, not behind a hover — a route
    // decision the player cannot see is not a decision.
    environment === null ? null : el('span', { class: 'map-env' }, [environment]),
  ]);

  void state;
  return node_;
}
