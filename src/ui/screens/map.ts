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
import { renderCardFace } from '../components/card.ts';
import { definitionOf } from '../../engine/combat/combat.ts';

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
  const environment = environmentName(node);
  const encounter = encounterName(node);
  return el('span', { class: 'star-label' }, [
    el('span', { class: 'star-name' }, [node.name]),
    el('span', { class: 'star-detail' }, [describeNode(node)]),
    // What you are walking into, on its own line and in its own colour. These
    // are the two facts the route decision is actually made on, and folding
    // them into one grey run of text with the node type buried them.
    encounter === null ? null : el('span', { class: 'star-encounter' }, [encounter]),
    environment === null || environment === 'Clear Space'
      ? null
      : el('span', { class: 'star-env', 'data-environment': node.environmentId }, [environment]),
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

  /* Whether the deck list is open. UI state — it changes nothing about the
     world, so it never goes near the reducer. */
  const view = { showDeck: false };
  let host: HTMLElement | null = null;

  const rerender = (): void => {
    const state = store.getState();
    if (state.run === null || state.run.screen !== 'map') return;
    host?.replaceChildren(buildMap(store, state, false, scroll, view, rerender));
  };

  host = liveScreen(store, 'map screen', (state) => {
    if (state.run === null || state.run.screen !== 'map') return null;
    const anchor = state.run.position ?? state.run.map?.startId ?? null;
    const moved = anchor !== lastAnchor;
    lastAnchor = anchor;
    return buildMap(store, state, moved, scroll, view, rerender);
  });
  return host;
}

function buildMap(
  store: Store,
  state: GameState,
  recentre: boolean,
  scroll: { top: number },
  view: { showDeck: boolean },
  rerender: () => void,
): HTMLElement {
  const run = requireRun(state);
  if (view.showDeck) return buildDeckList(store, state, view, rerender);
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
    // A space fight is a different game with a different build behind it, so it
    // has to be legible from across the chart — you route toward or away from
    // one several nodes out, not when you arrive at it.
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
      /*
       * Every place is named, all the time.
       *
       * The earlier version captioned only the lanes you could reach, on the
       * theory that fifty labels is noise — but a chart where most of the sky
       * is anonymous cannot be read ahead, and reading ahead is the entire
       * point of showing three columns of it. So the NAME is always on; the
       * type and environment ride under it only where you are actually choosing.
       */
      isReachable
        ? captionOf(node)
        : el(
            'span',
            {
              class: `star-label star-label--${visited.has(node.id) ? 'past' : 'far'}`,
            },
            [el('span', { class: 'star-name' }, [node.name])],
          ),
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
  /* Two frames, not one. A single `requestAnimationFrame` still fires while the
     screen is detached on a fresh mount, so `scrollHeight` equals `clientHeight`
     and every scroll calculation below quietly resolves to zero. The second
     frame is the first one that sees real layout. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    /*
     * Before the first move there is no `is-here`, and the chart is drawn
     * boss-first — so the starting row sits at the BOTTOM and an untouched
     * viewport opens looking at the boss. Pinning to the bottom is done here
     * rather than inside `recentre` because the screen renders twice on mount
     * and the second render was restoring a scroll position captured before the
     * first one had laid out. Idempotent, so whichever render wins is fine.
     */
    if (field.querySelector('.star.is-here') === null && scroll.top === 0) {
      viewport.scrollTop = viewport.scrollHeight;
      scroll.top = viewport.scrollTop;
      return;
    }

    if (recentre) {
      /*
       * Before the first move nothing is `is-here`, and the fallback found
       * whichever reachable star came first in document order — which is near
       * the top of a chart that is drawn boss-first. So a run opened scrolled
       * away from its own starting row and you had to scroll down to begin.
       * With no position, the answer is simply the bottom.
       */
      const here = field.querySelector('.star.is-here');
      if (here === null) {
        viewport.scrollTop = viewport.scrollHeight;
        scroll.top = viewport.scrollTop;
        return;
      }
      const anchor = here;
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
  }));

  // The Manifest sits on the chart, not behind the pause key. What you are
  // carrying is part of reading the route.
  return el('div', { class: 'map-inner' }, [
    renderRunBar(store, state),
    el('div', { class: 'map-head' }, [
      el('span', { class: 'map-act' }, [`Act ${map.act}`]),
      renderWavefront(run),
      /* Reading the route means knowing what you will draw while you walk it.
         Deck size alone was on the run bar; the deck itself was only behind the
         pause key, which is a strange place to hide the thing the map decision
         is actually about. */
      button(`Deck (${run.pilot.deck.length})`, { class: 'btn btn-quiet' }, () => {
        view.showDeck = true;
        rerender();
      }),
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

/**
 * The deck, from the map.
 *
 * Reading a route means knowing what you will draw while you walk it. Deck size
 * was on the run bar and the list itself was behind the pause key, which is an
 * odd place to keep the thing the routing decision is actually about.
 */
function buildDeckList(
  store: Store,
  state: GameState,
  view: { showDeck: boolean },
  rerender: () => void,
): HTMLElement {
  const run = requireRun(state);
  const sorted = [...run.pilot.deck].sort((a, b) => {
    const left = definitionOf(a);
    const right = definitionOf(b);
    return left.cost === right.cost
      ? left.name.localeCompare(right.name)
      : Number(left.cost) - Number(right.cost);
  });

  return el('div', { class: 'map-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, [`Deck (${sorted.length})`]),
    el('div', { class: 'picker-actions' }, [
      button('Back to the chart', { class: 'btn btn-primary' }, () => {
        view.showDeck = false;
        rerender();
      }),
    ]),
    el(
      'div',
      { class: 'deck-list' },
      sorted.map((card) =>
        renderCardFace(definitionOf(card), {
          state,
          badge: card.upgraded ? 'Forged' : null,
          changedVs: null,
          extraClass: null,
        }),
      ),
    ),
  ]);
}
