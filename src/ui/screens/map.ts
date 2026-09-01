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
import { renderCarried } from '../components/carried.ts';
import {
  implants as implantTable,
  masteries as masteryTable,
  relics as relicTable,
} from '../../content/registry.ts';
import { describeImplant } from '../../engine/run/describe.ts';
import { mapInfo, renderInfoPanel } from '../components/info.ts';
import { renderCardFace } from '../components/card.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { RARITY_LABEL } from '../../content/balance.ts';
import { play } from '../sound.ts';
import type { SoundKey } from '../sound.ts';
import { ENCOUNTERS } from '../../content/encounters.ts';

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
function captionOf(node: MapNode, tone: 'now' | 'far' | 'past'): HTMLElement {
  const environment = environmentName(node);
  return el('span', { class: `star-label${tone === 'now' ? '' : ` star-label--${tone}`}` }, [
    el('span', { class: 'star-name' }, [node.name]),
    el('span', { class: 'star-detail' }, [describeNode(node)]),
    // The environment, on its own line and in its own colour: it is the fact
    // the route decision is actually made on. Who is waiting is not.
    environment === null || environment === 'Clear Space'
      ? null
      : el('span', { class: 'star-env', 'data-environment': node.environmentId }, [environment]),
  ]);
}

/**
 * What a place sounds like, from the chart.
 *
 * Read off the node rather than off the screen that follows it, so it can play
 * on the click. A fight's weight comes from the encounter it names — an act
 * finale and an Elite are the same kind of promise and share a sound.
 */
function nodeSound(node: MapNode): SoundKey | null {
  switch (node.type) {
    case 'event':
      return 'nodeAnomaly';
    case 'station':
      return 'nodeStation';
    case 'safe':
      return 'nodeSafe';
    case 'elite':
    case 'boss':
      return 'fightElite';
    case 'combat': {
      const tier = ENCOUNTERS.find((entry) => entry.id === node.encounterId)?.tier ?? 'normal';
      return tier === 'normal' ? 'fightNormal' : 'fightElite';
    }
    default:
      // An Unknown. Not a place yet.
      return null;
  }
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
   *
   * `settling` is the other half of that, and it exists because of a lie the
   * browser tells: a freshly inserted scroll box accepts `scrollTop`, reads it
   * back correctly, and then resets itself to zero when its own first layout
   * lands — announcing the reset as an ordinary scroll event. Recording that
   * event as "where the player is looking" is what threw the placement away a
   * frame after making it. While a placement is settling, the chart is moving
   * under its own instructions and nothing it emits is the player's opinion.
   */
  const scroll = { top: 0, settling: false };

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
   * Opening the chart on where you are standing.
   *
   * The rule is one rule now: centre the ANCHOR — the node you are on, or the
   * act's entry before you have moved. It used to be two, and the seam between
   * them was the bug: re-centring after a fight was script, and opening on the
   * starting row was a `column-reverse` trick in the stylesheet. So a chart
   * that opened in the middle of an act still opened at the bottom, because the
   * only thing that put you anywhere was CSS whose whole idea was "the bottom".
   *
   * Four earlier scripted attempts failed for one reason and it is worth
   * recording: every screen in this app is BUILT DETACHED and appended
   * afterwards, and a detached box reports `scrollHeight === clientHeight`, so
   * a single `requestAnimationFrame` measures a chart with no height and
   * carefully scrolls it to zero. The answer is not a longer delay, it is a
   * CONDITION — connected, and taller than itself — polled for a few frames and
   * then given up on. Same shape as the info panel's focus retry, same reason.
   *
   * A generation counter, because a re-render schedules another one and two
   * polls racing to write `scrollTop` is exactly the flicker this is here to
   * remove.
   */
  let placement = 0;

  const place = (): void => {
    placement += 1;
    const mine = placement;
    let tries = 0;
    scroll.settling = view.recentre;

    const attempt = (): void => {
      if (mine !== placement) return;
      const viewport = host?.querySelector('.map-viewport');
      const ready =
        viewport instanceof HTMLElement &&
        viewport.isConnected &&
        viewport.scrollHeight > viewport.clientHeight;
      if (!ready) {
        tries += 1;
        if (tries < 40) requestAnimationFrame(attempt);
        return;
      }

      const anchor = view.recentre ? viewport.querySelector('.star.is-anchor') : null;
      if (anchor instanceof HTMLElement) {
        /* Measured off the rects rather than `offsetTop`, so it does not depend
           on which ancestor happens to be the offset parent — and off the
           element's CENTRE, because a star is drawn translated by half itself.
           Arithmetic rather than `scrollIntoView`, which also scrolls the page
           the chart is sitting on. */
        const box = anchor.getBoundingClientRect();
        const frame = viewport.getBoundingClientRect();
        const middle = box.top + box.height / 2 - frame.top + viewport.scrollTop;
        const want = Math.max(0, middle - viewport.clientHeight / 2);
        if (Math.abs(viewport.scrollTop - want) > 1) viewport.scrollTop = want;
        scroll.top = viewport.scrollTop;

        /* Re-asserted for a few frames, and this is the whole trick.
         *
         * Setting `scrollTop` on a box that has only just been inserted is a
         * request, not a fact: it reads back as the number you wrote and then
         * the browser's own first layout of the scroller puts it back to zero.
         * One write, however carefully timed, loses that race every time —
         * which is why four previous attempts at this ended up as a stylesheet
         * trick. Holding the position for a handful of frames wins it, and
         * costs nothing when there was no race to win. */
        tries += 1;
        if (tries < 8) {
          requestAnimationFrame(attempt);
          return;
        }
        /* Once. A re-render that changes nothing about where you are should
           restore what the player was looking at, not haul them back to their
           own feet. */
        view.recentre = false;
        scroll.settling = false;
        return;
      }

      viewport.scrollTop = scroll.top;
      scroll.settling = false;
    };

    attempt();
  };

  host = liveScreen(store, 'map screen', (state) => {
    if (state.run === null || state.run.screen !== 'map') return null;
    const anchor = state.run.position ?? state.run.map?.startId ?? null;
    const moved = anchor !== lastAnchor;
    lastAnchor = anchor;
    if (moved) view.recentre = true;
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
  scroll: { top: number; settling: boolean },
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

  /* What the chart opens looking at: where you are standing, or the way in
     before you have taken a step. One anchor, so there is one rule — see
     `place` in `renderMap` for why that matters. */
  const anchorId = run.position ?? map.startId;

  /* The readout was here: a line under the act heading that named whatever star
     you were pointing at — "Kell Yard · Station · Clear Space".
     Removed, because the chart says all three under every star now, on every
     node rather than only the one under the cursor. A caption that repeats what
     is already written a centimetre away is a second place to look for the same
     fact. Nothing is lost for the keyboard either: each star carries the same
     string as its `aria-label`, so focusing one announces it natively instead
     of through a live region that had to be kept in step by hand. */

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
    if (node.id === anchorId) classes.push('is-anchor');
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
        /* On the CLICK, not on arrival.
         *
         * It was moved to the landing screen first, on the theory that the
         * arrival is the moment the place is named — and that turned out to be
         * a beat too late in practice. The click is the commitment; the sound
         * belongs to the decision, and audio takes a moment to start, so
         * anything later than this reads as a delayed reaction to a button.
         *
         * An Unknown is the one exception and stays quiet, because it is not a
         * place yet: whatever it resolves into announces itself then. A fight
         * is NOT an exception — it used to wait for the board to appear, which
         * is two screens later, so you pressed a star, read a paragraph,
         * pressed again, and only then heard where you had gone. */
        store.dispatch({ kind: 'moveToNode', nodeId: node.id });
      },
    );

    fill(star, [
      el('span', { class: 'star-dot', 'aria-hidden': 'true' }),
      /*
       * Every place is named AND typed, all the time.
       *
       * First only the reachable lanes were captioned, on the theory that fifty
       * labels is noise. Then the name went on everywhere, because a chart
       * where most of the sky is anonymous cannot be read ahead. This is the
       * rest of that argument: a name alone does not let you plan either. "Kell
       * Yard, then the Station" is a route; "Kell Yard, then a word I cannot
       * see the type of" is a guess, and routing several nodes out is the whole
       * reason three columns are on screen at once.
       *
       * The hierarchy is carried by weight and colour rather than by absence —
       * see `star-label--far`. Where you are choosing is loud; the rest is
       * quiet and still readable.
       */
      captionOf(node, isReachable ? 'now' : visited.has(node.id) ? 'past' : 'far'),
    ]);

    /* The sound goes on POINTERDOWN, not on the click.
     *
     * A click only exists once the finger or the button comes back up, and
     * between those two moments there is a whole gesture the player has already
     * committed to. Audio also takes a moment to actually begin. Starting it at
     * the press buys both back — it is the earliest instant the intent is
     * known, and it is what makes the sound feel like part of the button rather
     * than a reaction to it. */
    if (isReachable) {
      const voice = nodeSound(node);
      if (voice !== null) star.addEventListener('pointerdown', () => play(voice));
    }

    stars.append(star);
  }

  const field = el('div', { class: 'map-field' }, [chart, stars]);

  /* The two rails. Either can be null — `renderCarried` and `renderManifest`
     both return nothing rather than an empty box — and neither absence changes
     the shape of the row any more: the grid is three fixed tracks whatever is
     standing in them. See `.map-body`. */
  const manifest = renderManifest(state, 'Manifest');
  const carried = renderCarried(state);

  const viewport = el('div', { class: 'map-viewport', role: 'group', 'aria-label': actLabel(map) }, [
    field,
  ]);
  viewport.addEventListener('scroll', () => {
    // Not while the chart is placing itself — see `scroll.settling` above.
    if (scroll.settling) return;
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
  /* `--chart` because the chart wants the whole window and the Inventory that
     shares this class does not. The Inventory is a document — a deck list, a
     relic list — and a document read across 1700px is a document nobody reads.
     Set here rather than asked for with `:has(.map-body)`: the screen already
     knows which of the two it is building, and a selector is a worse way to ask
     a question you have the answer to. */
  // The rails sit on the chart, not behind the pause key. What you are carrying
  // and what you owe are both part of reading the route.
  return el('div', { class: 'map-inner map-inner--chart' }, [
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
    /* Carrying on the left, the sky, the Manifest on the right.
     *
     * Both rails used to be conditional and the grid used to change shape
     * around them — the Manifest arriving switched the row from one track to
     * three and took a third of the chart's width away with it. So the sky
     * shrank because of an event somewhere else, and the same act read
     * differently depending on your luck.
     *
     * Three tracks, always, and the rails simply stand in them or do not. What
     * you are carrying moves onto the chart for the same reason it is beside
     * the health bar in a fight: routing is a decision, and it is made out of
     * what a turn can currently do. */
    el('div', { class: 'map-body' }, [carried, viewport, manifest]),
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
              el('div', { class: 'mastery-head' }, [
                el('span', { class: 'mastery-name' }, [def.name]),
                el('span', { class: 'mastery-tier' }, [RARITY_LABEL[def.rarity]]),
              ]),
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
              el('div', { class: 'mastery-head' }, [
                el('span', { class: 'mastery-name' }, [
                  count > 1 ? `${def.name} x${count}` : def.name,
                ]),
                el('span', { class: 'mastery-tier' }, [RARITY_LABEL[def.rarity]]),
              ]),
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

