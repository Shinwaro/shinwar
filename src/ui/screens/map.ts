/* The star chart.
 *
 * Lanes are drawn as one SVG layer behind the nodes; the nodes themselves are
 * real `<button>`s positioned over it. That split is deliberate: SVG gets the
 * clean hairline lanes and the glow, and the player still gets genuine buttons
 * with keyboard reach and a focus ring, which an `<svg><circle>` would not be.
 *
 * Noise discipline: only the nodes you can actually reach carry a label. The
 * requirement is that a combat's environment is visible **before you commit to
 * the route** — that is satisfied by labelling the three-to-six lanes you are
 * choosing between, not by printing fifty captions across the sky. Everything
 * else is a coloured star, with its detail on hover, focus, or in the readout.
 */

import type { GameState, MapNode, RunMap, RunState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { availableMoves, currentNode, describeNode } from '../../engine/map/route.ts';
import { ENCOUNTERS } from '../../content/encounters.ts';
import { environments } from '../../content/registry.ts';
import { button, el, fill } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderManifest } from '../components/manifest.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The chart is drawn in this coordinate space and scaled by CSS. */
const VIEW_W = 1000;
const VIEW_H = 1400;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function environmentName(node: MapNode): string | null {
  if (node.environmentId === null) return null;
  return environments.find(node.environmentId)?.name ?? null;
}

function encounterName(node: MapNode): string | null {
  if (node.encounterId === null) return null;
  return ENCOUNTERS.find((entry) => entry.id === node.encounterId)?.name ?? null;
}

/** Everything about a node, for the readout and the accessible name. */
function labelOf(node: MapNode): string {
  return [node.name, describeNode(node), encounterName(node), environmentName(node)]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
}

/**
 * What sits under the star.
 *
 * The name first and alone on its line, because a name is what a route is made
 * of — you pick "Kessel Deep, then the Station", not "the second dot". The type
 * and the environment sit under it in smaller type: needed to decide, but not
 * what you are scanning for.
 */
function captionOf(node: MapNode): HTMLElement {
  const detail = [describeNode(node), environmentName(node)]
    .filter((part) => part !== null && part !== '')
    .join(' · ');

  return el('span', { class: 'star-label' }, [
    el('span', { class: 'star-name' }, [node.name]),
    el('span', { class: 'star-detail' }, [detail]),
  ]);
}

export function renderMap(store: Store): HTMLElement {
  /*
   * The chart is taller than the viewport, so the player's position is scrolled
   * into view — but only when it actually MOVES. Re-centring on every render
   * would yank the view back the moment anything else changed, which makes
   * reading ahead impossible: you scroll up to look at the boss, something
   * re-renders, and you are back at your feet.
   */
  let lastAnchor: string | null = null;

  /*
   * A rebuild replaces the scroller, which resets its scroll to the top. So
   * where the player had scrolled to is remembered here and restored — without
   * it, glancing at the boss and then hovering anything snaps you back to the
   * top of the chart.
   */
  const scroll = { top: 0 };

  return liveScreen(store, 'map screen', (state) => {
    if (state.run === null || state.run.screen !== 'map') return null;
    const anchor = state.run.position ?? state.run.map?.startId ?? null;
    const moved = anchor !== lastAnchor;
    lastAnchor = anchor;
    return buildMap(store, state, moved, scroll);
  });
}

function buildMap(
  store: Store,
  state: GameState,
  recentre: boolean,
  scroll: { top: number },
): HTMLElement {
  const run = requireRun(state);
  const map = run.map;
  if (map === null) return el('div', { class: 'map-inner' }, ['No map.']);

  const reachable = new Set(availableMoves(run).map((node) => node.id));
  const here = currentNode(run);
  const visited = new Set(run.visited);

  /* -- the readout, driven by hover and focus -- */
  const readout = el('p', { class: 'map-readout', role: 'status', 'aria-live': 'polite' }, [
    run.position === null
      ? 'You arrive. One way in — the choices start after it.'
      : 'Choose your next jump.',
  ]);
  const setReadout = (text: string | null): void => {
    readout.textContent =
      text ?? (run.position === null ? 'You arrive. One way in — the choices start after it.' : 'Choose your next jump.');
  };

  /* -- lanes -- */
  const chart = svg('svg', {
    class: 'map-lanes',
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });

  for (const node of map.nodes) {
    for (const nextId of node.next) {
      const target = map.nodes.find((entry) => entry.id === nextId);
      if (target === undefined) continue;
      const live = here?.id === node.id && reachable.has(nextId);
      const travelled = visited.has(node.id) && visited.has(nextId);
      chart.append(
        svg('line', {
          x1: node.x * VIEW_W,
          y1: node.y * VIEW_H,
          x2: target.x * VIEW_W,
          y2: target.y * VIEW_H,
          class: `lane${live ? ' is-live' : ''}${travelled ? ' is-travelled' : ''}`,
        }),
      );
    }
  }

  /* -- stars -- */
  const stars = el('div', { class: 'map-stars' });

  for (const node of map.nodes) {
    const isReachable = reachable.has(node.id);
    const isHere = here?.id === node.id;
    const label = labelOf(node);

    const classes = ['star', `star--${node.type}`];
    if (isReachable) classes.push('is-reachable');
    if (isHere) classes.push('is-here');
    if (visited.has(node.id)) classes.push('is-visited');

    const star = button(
      '',
      {
        class: classes.join(' '),
        style: `left:${(node.x * 100).toFixed(3)}%; top:${(node.y * 100).toFixed(3)}%`,
        // A centred label on a star near the edge runs off the chart and gets
        // clipped. Near the sides it hangs inward instead.
        'data-edge': node.x < 0.18 ? 'left' : node.x > 0.82 ? 'right' : null,
        disabled: !isReachable,
        'aria-label': label,
      },
      () => {
        if (!isReachable) return;
        store.dispatch({ kind: 'moveToNode', nodeId: node.id });
      },
    );

    fill(star, [
      el('span', { class: 'star-dot', 'aria-hidden': 'true' }),
      // Only the lanes you are choosing between are captioned. Fifty labels is
      // the noise; three to six is the decision. Visited places keep their name
      // alone, so the route you took reads back as a route.
      isReachable
        ? captionOf(node)
        : visited.has(node.id)
          ? el('span', { class: 'star-label star-label--past' }, [
              el('span', { class: 'star-name' }, [node.name]),
            ])
          : null,
    ]);

    const show = (): void => setReadout(label);
    const hide = (): void => setReadout(null);
    star.addEventListener('pointerenter', show);
    star.addEventListener('pointerleave', hide);
    star.addEventListener('focus', show);
    star.addEventListener('blur', hide);

    stars.append(star);
  }

  const field = el('div', { class: 'map-field' }, [chart, stars]);

  const viewport = el('div', { class: 'map-viewport', role: 'group', 'aria-label': actLabel(map) }, [
    field,
  ]);
  viewport.addEventListener('scroll', () => {
    scroll.top = viewport.scrollTop;
  });

  /* `requestAnimationFrame`, not a microtask: on a fresh mount the screen is
     still detached when microtasks run, and setting `scrollTop` on an element
     with no layout does nothing at all. */
  requestAnimationFrame(() => {
    if (recentre) {
      const anchor = field.querySelector('.star.is-here') ?? field.querySelector('.star.is-reachable');
      if (anchor instanceof HTMLElement) {
        // Centre by arithmetic rather than `scrollIntoView`, which also walks
        // up and scrolls the page itself.
        const target = anchor.offsetTop - viewport.clientHeight / 2;
        viewport.scrollTop = Math.max(0, target);
      }
      scroll.top = viewport.scrollTop;
      return;
    }
    viewport.scrollTop = scroll.top;
  });

  // The Manifest sits on the chart, not behind the pause key. What you are
  // carrying is part of reading the route.
  return el('div', { class: 'map-inner' }, [
    renderRunBar(store, state),
    el('div', { class: 'map-head' }, [
      el('span', { class: 'map-act' }, [`Act ${map.act}`]),
      renderWavefront(run),
    ]),
    readout,
    renderManifest(state, 'Carrying'),
    viewport,
  ]);
}

function actLabel(map: RunMap): string {
  return `Act ${map.act} star chart`;
}

/**
 * The collapse front, in rows of lead.
 *
 * It says the rule out loud rather than making the player infer it from a
 * moving bar: a Station or a Safe Planet costs two rows instead of one, and
 * that sentence is the entire mechanism. Hiding it would turn a priced decision
 * into a surprise.
 */
function renderWavefront(run: RunState): HTMLElement | null {
  const front = run.wavefront;
  if (front === null) return null;

  const here = run.position === null ? 0 : (run.map?.nodes.find((node) => node.id === run.position)?.row ?? 0);
  const lead = here - front.row;
  const state = lead <= 0 ? 'on-you' : lead <= 2 ? 'close' : 'clear';

  return el('div', { class: `wavefront is-${state}`, role: 'status', 'aria-live': 'polite' }, [
    el('span', { class: 'wavefront-label' }, ['WAVEFRONT']),
    el('span', { class: 'wavefront-value' }, [
      lead <= 0 ? 'On you' : `${lead} row${lead === 1 ? '' : 's'} behind`,
    ]),
    el('span', { class: 'wavefront-hint' }, [
      lead <= 0
        ? 'The next fight starts hot, and they start stronger.'
        : 'A Station or a Safe Planet costs two rows of lead instead of one.',
    ]),
  ]);
}
