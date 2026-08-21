/* The animation layer.
 *
 * Small on purpose. Numbers that rise off what they hit, bars that drain
 * instead of snapping, a beat between a card leaving your hand and its effect
 * landing, and — since M7 — the thing struck reacting to being struck.
 *
 * The M7 addition is one idea, not a pile of effects: **a hit that reaches the
 * hull has to look different from one the plating ate.** That is the single
 * most important fact in any given moment of a fight, it was previously
 * carried by two floating numbers alone, and floating numbers are the part of
 * the screen a player stops reading once they know the deck.
 *
 * Two rules it must never break:
 *
 *   1. **The engine stays instant.** Nothing here gates a state transition.
 *      State is already final by the time any of this runs; the timeline is
 *      pure decoration played over a result that has already happened. If it
 *      ever gated anything, the simulator and the tests would diverge from the
 *      game.
 *
 *   2. **The combat log is the event stream.** Every state change already
 *      appends an ordered entry, so the timeline is built by reading entries
 *      added since the last render. It cannot desync from what actually
 *      happened, and it needs no event system of its own.
 *
 * Under `prefers-reduced-motion` the timeline is skipped entirely and every
 * value jumps to its final state.
 */

import type { LogEntry } from '../engine/types.ts';
import { shakeAllowed } from './settings.ts';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- the floating-number layer ----------
   Fixed to the viewport and outside every screen's subtree, because screens
   are replaced wholesale on re-render and a floater mid-flight must not be
   swept away with them. */

let layer: HTMLElement | null = null;

function fxLayer(): HTMLElement {
  if (layer !== null && layer.isConnected) return layer;
  const node = document.createElement('div');
  node.className = 'fx-layer';
  node.setAttribute('aria-hidden', 'true');
  document.body.append(node);
  layer = node;
  return node;
}

/**
 * `shield` is damage that never reached the hull.
 *
 * It gets its own number and its own colour rather than the word "blocked",
 * because a hit that is half absorbed is two facts — how much the plating ate
 * and how much got through — and one label cannot carry both. A partly blocked
 * hit now floats a blue number and a red one.
 */
export type FloatKind = 'damage' | 'shield' | 'block' | 'heal' | 'heat';

export interface FloatRequest {
  readonly text: string;
  readonly kind: FloatKind;
  /** Where it starts, in viewport coordinates. */
  readonly x: number;
  readonly y: number;
  readonly delay: number;
}

export function floatText(request: FloatRequest): void {
  if (prefersReducedMotion()) return;

  const node = document.createElement('span');
  node.className = `fx-float fx-float--${request.kind}`;
  node.textContent = request.text;
  node.style.left = `${request.x}px`;
  node.style.top = `${request.y}px`;
  fxLayer().append(node);

  const animation = node.animate(
    [
      { opacity: 0, transform: 'translate(-50%, 0) scale(0.8)' },
      { opacity: 1, transform: 'translate(-50%, -16px) scale(1)', offset: 0.22 },
      { opacity: 1, transform: 'translate(-50%, -34px) scale(1)', offset: 0.68 },
      { opacity: 0, transform: 'translate(-50%, -52px) scale(0.95)' },
    ],
    { duration: 880, delay: request.delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
  );

  void animation.finished.then(
    () => node.remove(),
    () => node.remove(),
  );
}

/**
 * Empty the effects layer. Tests, and screen teardown.
 *
 * Named for the layer rather than for floaters, because cards in flight live
 * here too now — and a full-size card ghost left over a fight that has ended
 * is a great deal more than litter. This is also the backstop for the one case
 * the per-animation cleanup cannot cover: the document timeline freezes while
 * the tab is hidden, so an animation started just before a switch away never
 * reaches `finished` until the player returns.
 */
export function clearEffects(): void {
  layer?.replaceChildren();
}

/* ---------- bars that drain ----------
   A re-render builds a brand new bar element, so a CSS transition has nothing
   to transition FROM. Remembering the last width per bar and starting there
   gives the drain back without keeping the DOM alive across renders. */

const lastWidth = new Map<string, number>();

export function setBarFill(fill: HTMLElement, key: string, pct: number, animate: boolean): void {
  const clamped = Math.max(0, Math.min(100, pct));
  const previous = lastWidth.get(key);
  lastWidth.set(key, clamped);

  if (!animate || previous === undefined || previous === clamped || prefersReducedMotion()) {
    fill.style.width = `${clamped}%`;
    return;
  }

  fill.style.width = `${previous}%`;
  requestAnimationFrame(() => {
    fill.style.width = `${clamped}%`;
  });
}

export function forgetBars(): void {
  lastWidth.clear();
}

/* ---------- impact ----------

   The struck thing reacts. Two distinct reactions, because they are two
   distinct facts: plating that absorbed a blow flashes cold and stays put,
   and a hit that got through to the hull knocks the target sideways. If both
   read the same, the player is back to reading numbers to find out whether
   their Block did anything, which is the question the shield floater was
   added to answer and the one the whole defensive layer turns on.

   Deliberately short — 260ms, inside the beat between blows — so a four-hit
   move reads as four reactions rather than one long smear. */

const IMPACT_MS = 260;

export function impactFx(anchor: Element, kind: 'hull' | 'shield', delay: number): void {
  if (prefersReducedMotion()) return;

  const frames: Keyframe[] =
    kind === 'shield'
      ? [
          { offset: 0, filter: 'brightness(1)', transform: 'scale(1)' },
          { offset: 0.25, filter: 'brightness(1.9)', transform: 'scale(1.02)' },
          { offset: 1, filter: 'brightness(1)', transform: 'scale(1)' },
        ]
      : [
          { offset: 0, transform: 'translateX(0)', filter: 'brightness(1)' },
          { offset: 0.18, transform: 'translateX(-6px)', filter: 'brightness(1.6) saturate(1.4)' },
          { offset: 0.42, transform: 'translateX(4px)', filter: 'brightness(1.2)' },
          { offset: 0.7, transform: 'translateX(-2px)', filter: 'brightness(1)' },
          { offset: 1, transform: 'translateX(0)', filter: 'brightness(1)' },
        ];

  anchor.animate(frames, { duration: IMPACT_MS, delay, easing: 'ease-out' });
}

/* ---------- screen shake ----------

   Only for damage that reaches the PLAYER's hull, and scaled by how much of
   the health bar it took. Shaking on every poke is noise, and noise on every
   hit is indistinguishable from no signal at all — the shake has to mean "that
   one actually hurt" or it means nothing.

   Off under `prefers-reduced-motion`, and off when the player says so; see
   `settings.ts` for why that toggle is not in `GameState`. */

const SHAKE_MS = 300;
/** A hit for this share of max health shakes as hard as the shake ever goes. */
const SHAKE_FULL_AT = 0.25;
/** Below this share, nothing moves. A 2-damage chip is not an event. */
const SHAKE_FLOOR = 0.04;
const SHAKE_MAX_PX = 9;

export function shakeScreen(stage: Element, share: number, delay: number): void {
  if (!shakeAllowed()) return;
  if (share < SHAKE_FLOOR) return;

  const weight = Math.min(1, share / SHAKE_FULL_AT);
  const amplitude = SHAKE_MAX_PX * weight;
  const step = (multiplier: number): string =>
    `translate3d(${(amplitude * multiplier).toFixed(2)}px, ${(amplitude * multiplier * 0.4).toFixed(2)}px, 0)`;

  stage.animate(
    [
      { transform: 'translate3d(0,0,0)' },
      { transform: step(-1) },
      { transform: step(0.72) },
      { transform: step(-0.45) },
      { transform: step(0.22) },
      { transform: 'translate3d(0,0,0)' },
    ],
    { duration: SHAKE_MS, delay, easing: 'ease-out' },
  );
}

/* ---------- cards in motion ----------

   The hand is rebuilt from scratch on every render, so a card is not a thing
   that moves — it is a node that stops existing and a different node that
   starts. Both halves of that are handled here, and they need opposite tricks.

   **Arriving** is a FLIP on the real node: it already exists at its resting
   place, so it is animated *from* the deck pile back to zero. Nothing is
   cloned and nothing can be left behind.

   **Leaving** cannot use the real node, because by the time we know the card is
   gone the render has already destroyed it. But a node removed from the
   document is still a live object, so the outgoing node is captured *before*
   the render and then re-adopted into the effects layer as its own ghost. That
   is better than cloning: it is not a copy of what was on screen, it is what
   was on screen.

   The ghost layer is the same fixed, body-level layer the damage numbers use,
   and for the same reason — a card mid-flight must not be swept away by the
   next render. */

const CARD_FX_CLASS = 'fx-card';

/** How long a card takes to reach a pile. Short: this happens constantly. */
const CARD_FLY_MS = 320;
/** The beat a played card holds before it leaves, so "played" reads as an act. */
const CARD_PLAY_HOLD_MS = 150;
/** Spacing when a whole hand is discarded at once. */
const CARD_STAGGER_MS = 45;
/** Arriving cards. Slightly quicker than leaving — you want to read them. */
const CARD_DEAL_MS = 280;

export type CardExit = 'play' | 'discard' | 'exhaust';

function centreOf(rect: DOMRect): { readonly x: number; readonly y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Fly a card that has left the hand to the pile it landed in.
 *
 * `node` is the element that *was* in the hand — already detached by the
 * render that removed it. It is adopted rather than copied.
 */
export function flyCardOut(
  node: HTMLElement,
  from: DOMRect,
  to: DOMRect,
  kind: CardExit,
  delay: number,
): void {
  if (prefersReducedMotion()) return;
  if (from.width === 0 || to.width === 0) return;

  node.classList.add(CARD_FX_CLASS, `${CARD_FX_CLASS}--${kind}`);
  node.style.left = `${from.left}px`;
  node.style.top = `${from.top}px`;
  node.style.width = `${from.width}px`;
  node.style.height = `${from.height}px`;
  fxLayer().append(node);

  const start = centreOf(from);
  const end = centreOf(to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  /* A played card holds for a beat first — it lifts and brightens where it
     was, and only then goes to the pile. Without that, playing a card and
     discarding a card look identical, and the one you chose should not. */
  const held = kind === 'play';
  const frames: Keyframe[] = held
    ? [
        { offset: 0, transform: 'translate3d(0,0,0) scale(1)', opacity: 1, filter: 'brightness(1)' },
        {
          offset: 0.3,
          transform: 'translate3d(0,-14px,0) scale(1.06)',
          opacity: 1,
          filter: 'brightness(1.45)',
        },
        {
          offset: 1,
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.16)`,
          opacity: 0,
          filter: 'brightness(1)',
        },
      ]
    : [
        { offset: 0, transform: 'translate3d(0,0,0) scale(1)', opacity: 0.95 },
        {
          offset: 1,
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.16)`,
          opacity: 0,
        },
      ];

  const animation = node.animate(frames, {
    duration: held ? CARD_PLAY_HOLD_MS + CARD_FLY_MS : CARD_FLY_MS,
    delay,
    easing: held ? 'cubic-bezier(.3,.0,.2,1)' : 'cubic-bezier(.4,0,.25,1)',
    fill: 'both',
  });

  void animation.finished.then(
    () => node.remove(),
    () => node.remove(),
  );
}

/**
 * A card arriving in the hand, dealt from the deck pile.
 *
 * FLIP: the node is already where it belongs, so it is animated from the pile
 * to nowhere. If it is interrupted by the next render the node simply goes
 * with it — there is no ghost to clean up.
 */
export function dealCardIn(node: HTMLElement, from: DOMRect, delay: number): void {
  if (prefersReducedMotion()) return;

  const to = node.getBoundingClientRect();
  if (to.width === 0 || from.width === 0) return;

  const start = centreOf(from);
  const end = centreOf(to);
  const dx = start.x - end.x;
  const dy = start.y - end.y;

  node.animate(
    [
      {
        offset: 0,
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.18)`,
        opacity: 0,
      },
      { offset: 1, transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
    ],
    { duration: CARD_DEAL_MS, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
  );
}

/** Spacing for a batch — a whole hand discarded should read as several cards. */
export function cardStagger(index: number): number {
  return index * CARD_STAGGER_MS;
}

/** How long a batch of exits occupies, so the caller can wait it out. */
export function cardExitDuration(count: number, held: boolean): number {
  if (count === 0) return 0;
  return cardStagger(count - 1) + CARD_FLY_MS + (held ? CARD_PLAY_HOLD_MS : 0);
}

/* ---------- the timeline ---------- */

/**
 * How long after the render the first number appears — the beat.
 *
 * Slow. A fight where every number arrives in the same frame reads as a
 * spreadsheet updating rather than as blows landing, and the player cannot tell
 * a four-hit card from a single big one. These are pacing numbers, not
 * animation ones: the state has already changed, this is only how long the eye
 * is given to follow it.
 */
const FIRST_BEAT = 140;
/**
 * Spacing between consecutive hits, so a multi-hit reads as several blows.
 *
 * This is the number that actually buys reading order, so it was tightened
 * rather than cut when the enemy-turn pacing was halved at M7 — a four-hit
 * card still has to arrive as four blows.
 */
const BEAT_STEP = 230;

interface Hit {
  readonly target: string;
  readonly text: string;
  readonly kind: FloatKind;
  /** How much hull this instance actually cost. Zero for a full absorb. */
  readonly toHull: number;
}

/**
 * One log entry can produce two numbers.
 *
 * A hit for 9 into 6 Block is `-6` in blue and `-3` in red, in that order. The
 * old version printed the word "blocked" for a full absorb and nothing at all
 * about the shield otherwise, which meant the most common question in a fight —
 * "did my Block do anything" — had no answer on screen.
 */
function hitsFromEntry(entry: LogEntry): readonly Hit[] {
  const detail = entry.detail;
  if (detail === null) return [];

  const target = typeof detail['to'] === 'string' ? detail['to'] : null;
  if (target === null) return [];

  if (entry.kind === 'damage') {
    const amount = typeof detail['toHull'] === 'number' ? detail['toHull'] : 0;
    const blocked = typeof detail['blocked'] === 'number' ? detail['blocked'] : 0;
    if (amount === 0 && blocked === 0) return [];

    const out: Hit[] = [];
    if (blocked > 0) out.push({ target, text: `-${blocked}`, kind: 'shield', toHull: 0 });
    if (amount > 0) out.push({ target, text: `-${amount}`, kind: 'damage', toHull: amount });
    return out;
  }

  if (entry.kind === 'block') {
    const amount = typeof detail['amount'] === 'number' ? detail['amount'] : 0;
    if (amount <= 0) return [];
    return [{ target, text: `+${amount}`, kind: 'block', toHull: 0 }];
  }

  return [];
}

/**
 * Play the entries added since the last render.
 *
 * `locate` maps a target key — `'player'` or an enemy uid — to the element the
 * number should rise from. Returning `null` drops the floater rather than
 * guessing a position; a number floating over nothing is worse than no number.
 */
export interface LogFxOptions {
  /**
   * What shakes. The combat screen's own root, not `document.body` — moving
   * the whole page drags the log and the hand along with it, which reads as the
   * browser hiccuping rather than as the ship being hit.
   */
  readonly stage: Element | null;
  /** Denominator for the shake weight. A 9 is a lot at 40 health and not at 90. */
  readonly playerMaxHealth: number;
}

export function playLogFx(
  fresh: readonly LogEntry[],
  locate: (target: string) => Element | null,
  options: LogFxOptions,
): number {
  if (prefersReducedMotion() || fresh.length === 0) return 0;

  let slot = 0;
  for (const entry of fresh) {
    for (const hit of hitsFromEntry(entry)) {
      const anchor = locate(hit.target);
      if (anchor === null) continue;

      const box = anchor.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;

      const delay = FIRST_BEAT + slot * BEAT_STEP;

      // The thing struck reacts on the same beat as its number, so the two
      // read as one event rather than as a number and then a wobble.
      if (hit.kind === 'damage' || hit.kind === 'shield') {
        impactFx(anchor, hit.kind === 'shield' ? 'shield' : 'hull', delay);
      }

      if (hit.target === 'player' && hit.toHull > 0 && options.stage !== null) {
        shakeScreen(options.stage, hit.toHull / Math.max(1, options.playerMaxHealth), delay);
      }

      floatText({
        text: hit.text,
        kind: hit.kind,
        // The shield number sits a little left of the hull number so a split
        // hit reads as two numbers rather than one flickering twice.
        x: box.left + box.width / 2 + (hit.kind === 'shield' ? -22 : 22),
        y: box.top + box.height * 0.32,
        delay,
      });
      slot += 1;
    }
  }

  // How long the whole sequence takes, so the caller can wait for it. The enemy
  // turn should not start while the player's last three numbers are still in
  // the air — that is exactly the "everything at once" the pacing is fixing.
  return slot === 0 ? 0 : FIRST_BEAT + (slot - 1) * BEAT_STEP;
}
