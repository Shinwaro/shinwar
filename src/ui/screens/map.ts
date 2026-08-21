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
import { environments } from '../../content/registry.ts';
import { button, el, fill } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderManifest } from '../components/manifest.ts';
import {
  implants as implantTable,
  masteries as masteryTable,
  relics as relicTable,
} from '../../content/registry.ts';
import { describeImplant } from '../../engine/run/describe.ts';
import { mapInfo, renderInfoPanel } from '../components/info.ts';
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

/**
 * The environment, unless the node is an Unknown.
 *
 * An Unknown carries a real environment now — it is rolled with the map so an
 * ambush fights somewhere rather than always in Clear Space — and drawing it
 * would give the `?` away. A node that tells you the weather has told you
 * there is going to be a fight.
 */
function environmentName(node: MapNode): string | null {
  if (node.environmentId === null || node.type === 'unknown') return null;
  return environments.find(node.environmentId)?.name ?? null;
}

/**
 * The route decision is which KIND of place to walk into, not which named pack.
 *
 * The chart used to print the encounter's name on every combat node, which
 * turned routing into looking up a known quantity: you learn that Swarm is
 * three enemies and after that the chart is answering the question instead of
 * asking it. The encounter roster lives in the Info panel, where it is
 * reference rather than a spoiler on the node itself.
 *
 * The environment stays visible. That is a rule about how the fight works,
 * which you are entitled to price before committing — unlike who is in it.
 */

/** Everything about a node, for the readout and the accessible name. */
function labelOf(node: MapNode): string {
  return [node.name, describeNode(node), environmentName(node)]
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
  return el('span', { class: 'star-label' }, [
    el('span', { class: 'star-name' }, [node.name]),
    el('span', { class: 'star-detail' }, [describeNode(node)]),
    // The environment, on its own line and in its own colour: it is the fact
    // the route decision is actually made on. Who is waiting is not.
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
  const view = { showDeck: false, showInfo: false, recentre: false };
  let host: HTMLElement | null = null;

  const rerender = (): void => {
    const state = store.getState();
    if (state.run === null || state.run.screen !== 'map') return;
    host?.replaceChildren(buildMap(store, state, scroll, view, rerender));
  };

  /*
   * Re-centring on the node you just cleared.
   *
   * Only this: opening on the starting row is CSS. Four scripted attempts at
   * that failed for one reason, worth recording — the screen is rebuilt and the
   * element that was scrolled is detached a moment later, so every timing fix
   * was racing a re-render it could not see. Re-centring survives because it
   * runs on `shinwar:mount`, which fires for the screen that is actually in the
   * document, and again on each render for moves that do not remount.
   */
  const place = (): void => {
    const viewport = host?.querySelector('.map-viewport');
    if (!(viewport instanceof HTMLElement)) return;
    if (viewport.scrollHeight <= viewport.clientHeight) return;

    const here = viewport.querySelector('.star.is-here');

    /* Before the first move nothing is `is-here`. The chart opening on the
       starting row is handled by CSS — see `.map-viewport`, which is a reversed
       flex column so its scroll origin is the bottom — because a scripted
       scroll cannot survive the screen being rebuilt underneath it. */
    if (here === null) return;

    // After a fight the map should be looking at the node you just cleared,
    // not wherever you had scrolled to before walking into it.
    if (view.recentre && here instanceof HTMLElement) {
      // Arithmetic rather than `scrollIntoView`, which also scrolls the page.
      viewport.scrollTop = Math.max(0, here.offsetTop - viewport.clientHeight / 2);
      scroll.top = viewport.scrollTop;
      return;
    }

    viewport.scrollTop = scroll.top;
  };

  host = liveScreen(store, 'map screen', (state) => {
    if (state.run === null || state.run.screen !== 'map') return null;
    const anchor = state.run.position ?? state.run.map?.startId ?? null;
    const moved = anchor !== lastAnchor;
    lastAnchor = anchor;
    view.recentre = moved;
    const built = buildMap(store, state, scroll, view, rerender);
    // A re-render of an already-mounted screen fires no mount event, so the
    // chart re-places itself on the next frame — that is the path that puts you
    // back on the node you just cleared when a fight hands the map back.
    requestAnimationFrame(place);
    return built;
  });
  host.addEventListener('shinwar:mount', () => {
    /* Twice: once now, once after the next frame. The shell dispatches the
       moment the screen is in the document, which is not always the moment it
       has been laid out — and `place` no-ops harmlessly when the viewport is
       not yet taller than itself, so the second call is the one that lands. */
    place();
    requestAnimationFrame(place);
  });
  return host;
}

function buildMap(
  store: Store,
  state: GameState,
  scroll: { top: number },
  view: { showDeck: boolean; showInfo: boolean },
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
  /*
   * Scroll once the viewport actually has layout, not once a frame has passed.
   *
   * `requestAnimationFrame` — even two of them — still fires while the screen is
   * detached on a fresh mount, and a detached element reports `scrollHeight`
   * equal to `clientHeight`. Every calculation below then collapses to zero and
   * writes that zero into `scroll.top`, which is why the chart kept opening at
   * the top no matter how many frames it waited. So the condition is the thing
   * we actually need — connected, and taller than its own viewport — polled for
   * a few frames and then given up on rather than looped forever.
   */
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
      button(`Inventory (${run.pilot.deck.length})`, { class: 'btn btn-quiet' }, () => {
        view.showDeck = true;
        rerender();
      }),
      /* The legend. A chart with seven colours on it and no key is a puzzle
         about the interface rather than about the route. */
      button('Info', { class: 'btn btn-quiet', 'aria-label': 'What the chart means' }, () => {
        view.showInfo = true;
        rerender();
      }),
    ]),
    readout,
    renderManifest(state, 'Carrying'),
    viewport,
    view.showInfo
      ? renderInfoPanel('Reading the chart', mapInfo(map.act), () => {
          view.showInfo = false;
          rerender();
        })
      : null,
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
 * The inventory — everything the run is currently carrying.
 *
 * It was the deck list and nothing else, which was a strange thing to call the
 * one place you go to check what you have: the relics, implants and masteries
 * are the half of the run that changes what a turn can *do*, and they were only
 * visible behind the pause key. Reading a route means knowing what you walk it
 * with, and that is not only the cards.
 *
 * Ordered by how much each part changes a turn: the passives first, then what
 * you are owed, then the deck — which is the longest list and the one you
 * scroll to on purpose.
 */
function buildDeckList(
  store: Store,
  state: GameState,
  view: { showDeck: boolean; showInfo: boolean },
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

  const section = (heading: string, count: number, body: HTMLElement | null): HTMLElement | null =>
    body === null
      ? null
      : el('section', { class: 'inv-section' }, [
          el('h2', { class: 'inv-heading' }, [
            heading,
            el('span', { class: 'inv-count' }, [String(count)]),
          ]),
          body,
        ]);

  /* Implants are tallied rather than listed one per copy: two of the same
     implant stack, and "Honed Edge, Honed Edge" reads as a rendering bug. */
  const implantCounts = [...new Set(run.pilot.implants)].map((id) => ({
    id,
    count: run.pilot.implants.filter((held) => held === id).length,
  }));

  const relics =
    run.pilot.relics.length === 0
      ? null
      : el(
          'ul',
          { class: 'mastery-list' },
          run.pilot.relics.map((id) => {
            const def = relicTable.find(id);
            if (def === undefined) return null;
            return el('li', { class: 'mastery-line', 'data-rarity': def.rarity }, [
              el('span', { class: 'mastery-name' }, [def.name]),
              el('span', { class: 'mastery-text' }, [def.text]),
            ]);
          }),
        );

  const implants =
    implantCounts.length === 0
      ? null
      : el(
          'ul',
          { class: 'mastery-list' },
          implantCounts.map(({ id, count }) => {
            const def = implantTable.find(id);
            if (def === undefined) return null;
            return el('li', { class: 'mastery-line', 'data-rarity': def.rarity }, [
              el('span', { class: 'mastery-name' }, [count > 1 ? `${def.name} x${count}` : def.name]),
              el('span', { class: 'mastery-text' }, [describeImplant(def)]),
            ]);
          }),
        );

  const masteries =
    run.pilot.masteries.length === 0
      ? null
      : el(
          'ul',
          { class: 'mastery-list' },
          run.pilot.masteries.map((id) => {
            const def = masteryTable.find(id);
            if (def === undefined) return null;
            return el('li', { class: `mastery-line mastery-line--${def.stance}` }, [
              el('span', { class: 'mastery-name' }, [def.name]),
              el('span', { class: 'mastery-text' }, [def.text]),
            ]);
          }),
        );

  const carrying =
    run.pilot.relics.length + run.pilot.implants.length + run.pilot.masteries.length === 0
      ? el('p', { class: 'pause-empty' }, [
          'Nothing but the deck yet. Relics come from Elites and act finales, implants from Stations.',
        ])
      : null;

  return el('div', { class: 'map-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Inventory']),
    el('div', { class: 'picker-actions' }, [
      button('Back to the chart', { class: 'btn btn-primary' }, () => {
        view.showDeck = false;
        rerender();
      }),
    ]),

    carrying,
    section('Relics', run.pilot.relics.length, relics),
    section('Implants', run.pilot.implants.length, implants),
    section('Stance masteries', run.pilot.masteries.length, masteries),
    renderManifest(state, 'Threads'),

    section(
      'Deck',
      sorted.length,
      el(
        'div',
        { class: 'deck-list' },
        sorted.map((card) =>
          renderCardFace(definitionOf(card), {
            state,
            badge: card.upgraded ? 'Upgraded' : null,
            changedVs: null,
            extraClass: null,
          }),
        ),
      ),
    ),
  ]);
}

