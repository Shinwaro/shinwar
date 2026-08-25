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
import { playCardSound, playDraw, playHeatGain, playVent } from './sound.ts';

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

/**
 * How long a number stays up.
 *
 * It has to outlive the beat that follows it, or the first hit of a move is
 * gone before the eye has walked back to it. At 880ms against a 290ms beat a
 * three-hit move lost its opening number while its third was still arriving —
 * which is exactly what "the numbers disappear too fast" describes.
 */
const FLOAT_MS = 1180;

/**
 * When the last number currently scheduled will have finished rising.
 *
 * `playLogFx` returns how long its sequence takes, which is enough for callers
 * that scheduled it. This is for the one that did not: the app shell has to
 * hold the board while the killing blow plays, and the screen that scheduled
 * that blow is a different module which the shell is in the middle of
 * replacing. A timestamp is the smallest thing they can agree on.
 */
let fxEndsAt = 0;

/** Milliseconds until the last scheduled floater is done. Zero if none are. */
export function fxRemainingMs(): number {
  return Math.max(0, fxEndsAt - performance.now());
}

export function floatText(request: FloatRequest): void {
  if (prefersReducedMotion()) return;

  const node = document.createElement('span');
  node.className = `fx-float fx-float--${request.kind}`;
  node.textContent = request.text;
  node.style.left = `${request.x}px`;
  node.style.top = `${request.y}px`;
  fxLayer().append(node);

  fxEndsAt = Math.max(fxEndsAt, performance.now() + request.delay + FLOAT_MS);

  const animation = node.animate(
    [
      { opacity: 0, transform: 'translate(-50%, 0) scale(0.8)' },
      { opacity: 1, transform: 'translate(-50%, -16px) scale(1)', offset: 0.22 },
      { opacity: 1, transform: 'translate(-50%, -34px) scale(1)', offset: 0.68 },
      { opacity: 0, transform: 'translate(-50%, -52px) scale(0.95)' },
    ],
    { duration: FLOAT_MS, delay: request.delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
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
  // Nothing is in the air any more, so nothing should be waiting on it.
  fxEndsAt = 0;
}

/* ---------- bars that drain ----------
 *
 * A re-render builds a brand new bar element, so a CSS transition has nothing
 * to transition FROM. Remembering the last width per bar and starting there
 * gives the drain back without keeping the DOM alive across renders.
 *
 * The bar does not travel on its own, though. It used to: the render set the
 * final width and the transition ran from that instant, so a 400ms drain was
 * finished at 400ms while the first damage number only appeared at 200ms and
 * the third at 780ms. The bar was always ahead of the fight — and a three-hit
 * card produced one long slide rather than three drops, which reads as one big
 * hit no matter what the numbers say.
 *
 * So a render only STAGES the bar: it holds at the old width and records where
 * it is going. `drainBar` then walks it down in steps timed to the same beats
 * the floaters use, and `settleBars` sends anything nobody claimed straight to
 * its destination — a heal, a Block change, a fight that started.
 */

const lastWidth = new Map<string, number>();

interface StagedBar {
  readonly fill: HTMLElement;
  readonly from: number;
  readonly to: number;
}

const staged = new Map<string, StagedBar>();

export function setBarFill(fill: HTMLElement, key: string, pct: number, animate: boolean): void {
  const clamped = Math.max(0, Math.min(100, pct));
  const previous = lastWidth.get(key);
  lastWidth.set(key, clamped);
  staged.delete(key);

  if (!animate || previous === undefined || previous === clamped || prefersReducedMotion()) {
    fill.style.width = `${clamped}%`;
    return;
  }

  // Hold. Whatever runs after this render decides how it travels.
  fill.style.width = `${previous}%`;
  staged.set(key, { fill, from: previous, to: clamped });
}

/**
 * Walk a staged bar down in steps, one per blow.
 *
 * `shares` are the portions of the drop each blow is responsible for, paired
 * with the beat its number lands on — so the bar drops exactly when the figure
 * appears, and a card that hits three times drops three times.
 *
 * Returns false when there was nothing staged for this key, so the caller knows
 * the bar is somebody else's problem.
 */
export function drainBar(
  key: string,
  steps: readonly { delay: number; share: number }[],
  /**
   * The thing that owns the bar, if it should not look dead until the bar is.
   *
   * The render marks a killed enemy `is-dead` from state, which is correct and
   * arrives a beat and a half before the bar it is describing has finished
   * emptying — so the enemy greyed out over a half-full health bar. The class
   * comes off here and goes back on with the last step, which is the same
   * moment the bar reaches zero and the last number lands on it.
   */
  corpse: Element | null = null,
): boolean {
  const bar = staged.get(key);
  if (bar === undefined || steps.length === 0) return false;
  staged.delete(key);

  const dying = corpse !== null && corpse.classList.contains('is-dead');
  if (dying && corpse !== null) corpse.classList.remove('is-dead');

  const total = steps.reduce((sum, step) => sum + step.share, 0);
  if (total <= 0) {
    bar.fill.style.width = `${bar.to}%`;
    return true;
  }

  const distance = bar.from - bar.to;
  let travelled = 0;

  steps.forEach((step, index) => {
    travelled += step.share;
    const last = index === steps.length - 1;
    // The last step lands exactly on the destination rather than on the sum of
    // the shares, so rounding can never leave a sliver of bar behind.
    const width = last ? bar.to : bar.from - distance * (travelled / total);
    window.setTimeout(() => {
      bar.fill.style.width = `${width}%`;
      if (last && dying && corpse !== null) corpse.classList.add('is-dead');
    }, step.delay);
  });

  return true;
}

/** Send every bar nobody staged a drain for straight to where it was going. */
export function settleBars(): void {
  for (const [key, bar] of staged) {
    staged.delete(key);
    requestAnimationFrame(() => {
      bar.fill.style.width = `${bar.to}%`;
    });
  }
}

export function forgetBars(): void {
  lastWidth.clear();
  staged.clear();
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

/** Which pile a card is flying to. Where it went, not why. */
export type CardPile = 'discard' | 'exhaust';

/**
 * Why it left, which is a separate fact from where it landed.
 *
 * Second Wind is played *and* exhausts. Folding the two into one enum meant it
 * flew to the exhaust pile without the beat that says you chose it — so the
 * card you spent a turn on looked exactly like one swept up at the end of it.
 */
export interface CardExit {
  readonly pile: CardPile;
  /** The player chose this one. It holds and brightens before it goes. */
  readonly played: boolean;
}

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
  exit: CardExit,
  delay: number,
): void {
  if (prefersReducedMotion()) return;
  if (from.width === 0 || to.width === 0) return;

  node.classList.add(CARD_FX_CLASS, `${CARD_FX_CLASS}--${exit.pile}`);
  if (exit.played) node.classList.add(`${CARD_FX_CLASS}--play`);
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
  const held = exit.played;
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
    /* `backwards`, never `both`.
     *
     * `both` holds the LAST keyframe on the element after the animation ends —
     * and the last keyframe here is `opacity: 1`, which then beats
     * `.card.is-unplayable { opacity: 0.45 }` until the next render replaces
     * the node. A card drawn at 0 Energy looked playable for the better part of
     * a second, which is worse than no animation: it is the card lying about
     * whether you can play it.
     *
     * `backwards` still holds the FIRST keyframe through the delay, so a
     * staggered deal does not flash at full opacity before its turn — and hands
     * the element back to CSS the moment it is done. */
    { duration: CARD_DEAL_MS, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
  );
}

/** Spacing for a batch — a whole hand discarded should read as several cards. */
export function cardStagger(index: number): number {
  return index * CARD_STAGGER_MS;
}

/**
 * How long a card drawn BY a card waits before it deals in.
 *
 * Without this the deal starts on the same frame as the played card's flight,
 * runs for 280ms, and is finished long before the 470ms play is — so the card
 * never appears to move. It is not that it pops; it is that your eye is on the
 * card leaving and the new one has already arrived and settled by the time you
 * look back.
 *
 * Waiting until the played card is most of the way to the pile also puts the
 * two events in the order they actually happened: the card that drew it goes
 * first, and then the card it drew turns up. Causality, made visible.
 */
export function cardDealAfterPlay(): number {
  return CARD_PLAY_HOLD_MS + Math.round(CARD_FLY_MS * 0.55);
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
const FIRST_BEAT = 200;
/**
 * Spacing between consecutive hits, so a multi-hit reads as several blows.
 *
 * This is the number that actually buys reading order, so it was tightened
 * rather than cut when the enemy-turn pacing was halved at M7 — a four-hit
 * card still has to arrive as four blows.
 *
 * Widened again afterwards. The M7 cut was measured against a fight you already
 * understand; the first time you meet a three-enemy pack you are reading four
 * numbers you have never seen, and at 230 they overlapped into one event.
 */
const BEAT_STEP = 290;

interface Hit {
  readonly target: string;
  readonly text: string;
  readonly kind: FloatKind;
  /** How much hull this instance actually cost. Zero for a full absorb. */
  readonly toHull: number;
  /**
   * Which swing of its card this blow belongs to, from the engine.
   *
   * Everything on one swing shares a beat. One card that hits every enemy once
   * is ONE event and its numbers should appear together; a card that hits the
   * same enemy three times is three events and they should not.
   */
  readonly swing: number;
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

    const swing = typeof detail['swing'] === 'number' ? detail['swing'] : 0;
    const out: Hit[] = [];
    if (blocked > 0) out.push({ target, text: `-${blocked}`, kind: 'shield', toHull: 0, swing });
    if (amount > 0) out.push({ target, text: `-${amount}`, kind: 'damage', toHull: amount, swing });
    return out;
  }

  if (entry.kind === 'block') {
    const amount = typeof detail['amount'] === 'number' ? detail['amount'] : 0;
    if (amount <= 0) return [];
    return [{ target, text: `+${amount}`, kind: 'block', toHull: 0, swing: 0 }];
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

/**
 * The sound of a batch of log entries.
 *
 * Driven off the log rather than off the call sites, for the same reason the
 * animations are: the log is the one place that already knows everything that
 * happened, in order, with the numbers attached. Sprinkling `playX()` through
 * the UI would mean every new effect needs remembering twice.
 *
 * Outside `prefersReducedMotion`, deliberately. Reduced motion is a statement
 * about things moving on screen; it is not a request for silence, and treating
 * it as one would take the audio away from exactly the players most likely to
 * be relying on it.
 */
function playLogSound(fresh: readonly LogEntry[]): void {
  for (const entry of fresh) {
    const detail = entry.detail;
    if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) continue;

    if (entry.kind === 'heat') {
      const gained = detail['gained'];
      const vented = detail['vented'];
      if (typeof gained === 'number') playHeatGain(gained);
      else if (typeof vented === 'number') playVent(vented);
      continue;
    }

    if (entry.kind !== 'card') continue;

    /* A play carries the card AND its cost; a draw carries a count. Two shapes,
       no ambiguity, and neither is the reshuffle line — that one has no detail
       at all and is correctly silent. */
    const card = detail['card'];
    if (typeof card === 'string' && detail['cost'] !== undefined) {
      playCardSound(card);
      continue;
    }
    const count = detail['count'];
    if (typeof count === 'number') playDraw(count);
  }
}

export function playLogFx(
  fresh: readonly LogEntry[],
  locate: (target: string) => Element | null,
  options: LogFxOptions,
): number {
  playLogSound(fresh);

  if (prefersReducedMotion() || fresh.length === 0) {
    settleBars();
    return 0;
  }

  /* Which blows land on whom, and when. The bar has to drop on the same beat
     as the number, and a card that hits three times has to drop three times —
     one long slide reads as one big hit however many figures float off it. */
  const drains = new Map<string, { delay: number; share: number }[]>();

  /* A beat is one swing, not one blow.
  
     Everything the engine tags with the same card and the same swing index
     happens at once — so a card that hits all three enemies produces three
     numbers on one beat, and a card that hits one enemy three times produces
     three beats. Both arrive as a run of damage entries and only the swing
     index tells them apart. */
  let slot = -1;
  let beat: string | null = null;

  for (const entry of fresh) {
    for (const hit of hitsFromEntry(entry)) {
      const anchor = locate(hit.target);
      if (anchor === null) continue;

      const box = anchor.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;

      const here = `${entry.source}#${hit.swing}#${hit.kind === 'shield' ? 's' : 'h'}`;
      if (here !== beat) {
        beat = here;
        slot += 1;
      }
      const delay = FIRST_BEAT + slot * BEAT_STEP;

      // The thing struck reacts on the same beat as its number, so the two
      // read as one event rather than as a number and then a wobble.
      if (hit.kind === 'damage' || hit.kind === 'shield') {
        impactFx(anchor, hit.kind === 'shield' ? 'shield' : 'hull', delay);
      }

      if (hit.target === 'player' && hit.toHull > 0 && options.stage !== null) {
        shakeScreen(options.stage, hit.toHull / Math.max(1, options.playerMaxHealth), delay);
      }

      /* Only hull damage moves the bar. A blow the shield ate is a real event
         with a real number, and the health bar is exactly the thing that did
         not change. */
      if (hit.toHull > 0) {
        const key = hit.target === 'player' ? 'player' : `enemy:${hit.target}`;
        const steps = drains.get(key) ?? [];
        steps.push({ delay, share: hit.toHull });
        drains.set(key, steps);
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
    }
  }

  for (const [key, steps] of drains) {
    drainBar(key, steps, key === 'player' ? null : locate(key.slice('enemy:'.length)));
  }
  /* Everything the blows did not claim goes straight where it was headed — a
     heal, a fight that has just started, an enemy whose whole hit was absorbed.
     Without this a staged bar would sit at its old width forever. */
  settleBars();

  // How long the whole sequence takes, so the caller can wait for it. The enemy
  // turn should not start while the player's last three numbers are still in
  // the air — that is exactly the "everything at once" the pacing is fixing.
  return slot < 0 ? 0 : FIRST_BEAT + slot * BEAT_STEP;
}
