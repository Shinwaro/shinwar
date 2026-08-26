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
import { playAt, resetSoundSchedule } from './sound.ts';
import type { SoundKey } from './sound.ts';
import { cards as cardTable } from '../content/registry.ts';
import { cardVoice } from './card-voice.ts';
import { SECT_RITES } from '../content/threads.ts';

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
/* ---------- the Heat gauge ----------

   Ten discrete ticks rather than a bar, so it animates as a count rather than
   as a slide: three arriving Heat is three ticks lighting left to right, and a
   vent of two is two going out right to left. The direction is the whole point
   — Heat coming in and Heat leaving look nothing alike now — and a vented tick
   goes out through cold blue on the way, so a glance tells you which happened
   even with the number covered.

   The animation owns the number, and the render asks IT what to draw. That is
   the fix for the first version, which held references to the tick elements and
   painted them on a timer: the combat screen replaces its entire subtree on
   every store change, so anything scheduled more than a frame out was painting
   detached nodes nobody could see while the live gauge sat at its final value.
   No visible animation at all, which is exactly what it looked like.

   So `heatDrawn` is what the gauge is showing, `stepHeat` walks it, and every
   paint looks the ticks up fresh. A re-render mid-animation now redraws
   whatever the walk has reached, and the walk carries on. */

let heatDrawn: number | null = null;
/**
 * Where the last SCHEDULED walk ends, which is not where the gauge is.
 *
 * Sever gains 3 Heat and then vents 2, and both walks are set up in the same
 * pass — but `heatDrawn` only advances as the ticks actually paint, so when the
 * vent was scheduled the gauge was still reading 0 and the vent computed its
 * start from that. It walked to minus one. On screen: a gauge that half filled,
 * dropped to 1, sat there, and eventually snapped back.
 *
 * A walk has to chain from where the walk before it LEFT OFF, so this is the
 * cursor the scheduler uses and `heatDrawn` is only ever what is painted.
 */
let heatScheduled: number | null = null;
/** Where a walk in progress will end, or null when nothing is walking. */
let heatWalkingTo: number | null = null;
/** When the walk in flight finishes, on `performance.now()`'s clock. */
let heatEndsAt = 0;

/**
 * How much of a Heat walk is still to come.
 *
 * A turn's end and the turn that follows it are two separate dispatches, so the
 * gauge emptying from GUARD is still walking when the next hand is dealt — and
 * the new batch's timeline starts at zero and knows nothing about it. This is
 * how the deal finds out.
 */
export function heatRemainingMs(): number {
  return Math.max(0, heatEndsAt - performance.now());
}

/** Called by the gauge as it renders. Returns the value it should DRAW at. */
export function stageHeat(heat: number): number {
  if (heatDrawn === null || prefersReducedMotion()) {
    heatDrawn = heat;
    heatScheduled = heat;
  }
  return heatDrawn;
}

/** The gauge is not in this fight any more. */
export function forgetHeat(): void {
  heatDrawn = null;
  heatScheduled = null;
  heatWalkingTo = null;
  heatEndsAt = 0;
}

function paintHeat(value: number): void {
  heatDrawn = value;
  const ticks = document.querySelectorAll<HTMLElement>('.heat-tick');
  ticks.forEach((tick, index) => {
    tick.classList.toggle('is-filled', index < value);
    tick.classList.remove('is-venting');
    tick.classList.remove('is-charging');
  });
}

/** The stance panel takes the colour of what just happened to the gauge. */
function flushStance(rising: boolean, at: number, hold: number): void {
  const on = rising ? 'is-heating' : 'is-cooling';
  window.setTimeout(() => {
    const panel = document.querySelector('.stance-strip');
    if (panel === null) return;
    panel.classList.remove('is-heating', 'is-cooling');
    panel.classList.add(on);
    window.setTimeout(() => panel.classList.remove(on), hold);
  }, at);
}

/**
 * Walk the gauge to `to`, one tick at a time, starting at `delay`.
 *
 * Returns how long the walk occupies, so the caller can put the NEXT beat after
 * it rather than a fixed distance later. Sever's vent used to begin one beat
 * after its gain regardless of how far the gain had to travel, so three Heat
 * arriving and two leaving ran into each other; the gauge has to finish filling
 * before it starts emptying or neither reads as anything.
 */
export function stepHeat(to: number, delay: number, rising: boolean): number {
  if (heatDrawn === null || prefersReducedMotion()) {
    heatDrawn = to;
    heatScheduled = to;
    return 0;
  }
  const from = heatScheduled ?? heatDrawn;
  if (from === to) return 0;

  heatScheduled = to;
  heatWalkingTo = to;
  const count = Math.abs(to - from);
  const step = rising ? HEAT_RISE_MS : HEAT_TICK_MS;

  for (let i = 1; i <= count; i++) {
    const value = rising ? from + i : from - i;
    const last = i === count;
    window.setTimeout(
      () => {
        paintHeat(value);

        /* Every tick that moves is marked for its own beat, in the colour of
           the direction it moved — the moving tick is briefly the brightest
           thing on the row, so the eye follows it along. */
        const index = rising ? value - 1 : value;
        const tick = document.querySelectorAll<HTMLElement>('.heat-tick')[index];
        const mark = rising ? 'is-charging' : 'is-venting';
        tick?.classList.add(mark);
        window.setTimeout(() => tick?.classList.remove(mark), step);

        if (last) heatWalkingTo = null;
      },
      delay + (i - 1) * step,
    );
  }

  const span = count * step;
  heatEndsAt = performance.now() + delay + span;
  // The panel wears the direction for exactly as long as the walk lasts, and
  // starts when the walk does rather than the instant it was scheduled.
  flushStance(rising, delay, span + step);
  fxEndsAt = Math.max(fxEndsAt, performance.now() + delay + span);
  return span;
}

/**
 * Anything the beats did not walk through goes straight where it belongs.
 *
 * Skipped while a walk is in flight: `heatDrawn` is behind the target ON
 * PURPOSE for the length of the animation, and jumping it here would undo
 * exactly the thing that was just scheduled.
 */
export function settleHeat(target: number | null): void {
  if (target === null || heatDrawn === null) return;
  if (heatWalkingTo !== null) return;
  if (heatDrawn === target) return;
  const value = target;
  heatScheduled = target;
  requestAnimationFrame(() => paintHeat(value));
}

/* ---------- Focus and Energy ----------

   Both are rows of small marks that simply had a different number of them lit
   from one render to the next, which is a state change rather than an event.
   Focus in particular is spent silently in the middle of an attack, so the
   thing you were saving vanished with nothing to look at.

   The mark that MOVED is flashed for a beat, in the direction it moved: coming
   in reads as arriving, going out as being spent. Same idea as the Heat gauge's
   per-tick colour, and it pairs with the sounds — the flash is what the noise is
   describing. Not a walk, though: Focus and Energy change in one step and
   animating them tick by tick would be inventing a process that is not there. */

let lastFocus: number | null = null;
let lastEnergy: number | null = null;

/** How long a moved mark stays lit. */
const RESOURCE_FLASH_MS = 420;

function flashRow(marks: readonly HTMLElement[], from: number, to: number): void {
  const rising = to > from;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const mark = rising ? 'is-gaining' : 'is-spending';

  for (let index = lo; index < hi; index++) {
    const node = marks[index];
    if (node === undefined) continue;
    node.classList.add(mark);
    window.setTimeout(() => node.classList.remove(mark), RESOURCE_FLASH_MS);
  }
}

/**
 * Flash whatever moved on the Focus and Energy rows.
 *
 * Called after the render, which has already drawn the new counts — this only
 * marks which of them changed. Nothing to stage, because there is no walk: the
 * marks are already where they belong and the flash says which ones are new.
 */
export function flashResources(host: HTMLElement, focus: number, energy: number): void {
  const focusMarks = [...host.querySelectorAll<HTMLElement>('.focus-tick')];
  const energyMarks = [...host.querySelectorAll<HTMLElement>('.energy-pip')];

  if (!prefersReducedMotion() && lastFocus !== null && lastFocus !== focus) {
    flashRow(focusMarks, lastFocus, focus);
  }
  if (!prefersReducedMotion() && lastEnergy !== null && lastEnergy !== energy) {
    flashRow(energyMarks, lastEnergy, energy);
  }
  lastFocus = focus;
  lastEnergy = energy;
}

/** A new fight starts both from nothing. */
export function forgetResources(): void {
  lastFocus = null;
  lastEnergy = null;
}

/* ---------- statuses falling off ----------

   A debuff that expires used to be there and then not be there, between two
   frames, with nothing in between. Whether the Vulnerable you were counting on
   is still up is a question the player is asking every turn, and the answer
   arrived as a silent absence — you had to notice a thing that was no longer
   drawn.

   So a pip that goes gets one beat of going. The render draws what state holds,
   as it should; this walks the difference afterwards and puts a ghost back
   where the missing one was, to fade on its own and remove itself.

   Keyed by owner AND status, so a stack dropping from 3 to 2 is a pip that
   changed rather than one that left — only the last stack fades. */

interface PipMemory {
  readonly text: string;
  readonly cls: string;
}

const lastPips = new Map<string, Map<string, PipMemory>>();

/** How long a departing pip lingers. Matches the CSS below. */
const PIP_FADE_MS = 480;

export function fadeExpiredPips(host: HTMLElement): void {
  const seen = new Set<string>();

  for (const box of host.querySelectorAll<HTMLElement>('.pips[data-owner]')) {
    const owner = box.dataset['owner'];
    if (owner === undefined) continue;
    seen.add(owner);

    const now = new Map<string, PipMemory>();
    for (const pip of box.querySelectorAll<HTMLElement>('.pip[data-status]')) {
      const id = pip.dataset['status'];
      if (id === undefined) continue;
      now.set(id, { text: pip.textContent ?? '', cls: pip.className });
    }

    const before = lastPips.get(owner);
    lastPips.set(owner, now);
    if (before === undefined || prefersReducedMotion()) continue;

    for (const [id, was] of before) {
      if (now.has(id)) continue;
      const ghost = document.createElement('span');
      ghost.className = `${was.cls} is-expiring`;
      ghost.textContent = was.text;
      ghost.setAttribute('aria-hidden', 'true');
      box.append(ghost);
      window.setTimeout(() => ghost.remove(), PIP_FADE_MS);
    }
  }

  // An enemy that died takes its statuses with it and is not a fade.
  for (const owner of [...lastPips.keys()]) {
    if (!seen.has(owner)) lastPips.delete(owner);
  }
}

/** A new fight knows nothing about the last one's statuses. */
export function forgetPips(): void {
  lastPips.clear();
}

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
/* Nothing. The first beat is the game answering the button you just pressed,
   and it should land on the same frame the press did — a card that hits or
   shields is not a thing to wait for. All of the pacing is in the gaps AFTER
   it, and even there only between the beats that belong to different things.
   See `BEAT_WITHIN` and `BEAT_BETWEEN`. */
const FIRST_BEAT = 0;
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
/* Two gaps, because "slow down" turned out to mean two different things.
 *
 * One number for everything was wrong in both directions at once. At 620 a card
 * you played took most of a second to finish resolving — its own hit, its own
 * Heat — and every one of those beats is a consequence of the SAME press, which
 * a player reads as one action and does not need walking through. At 290 a room
 * of three enemies swinging in sequence collapsed into one event and you could
 * not tell who had hit you.
 *
 * So: the beats inside one thing are tight, and the beats between two different
 * things — this enemy and then that one — get the room. The source of the beat
 * is what tells them apart, which is exactly the distinction the player is
 * already making.
 */
const BEAT_WITHIN = 250;
const BEAT_BETWEEN = 620;

/**
 * How far ahead of its picture a sound starts.
 *
 * Audio does not begin the instant it is asked to: there is decode and buffer
 * latency between `play()` and the first sample, and it is enough that a sound
 * fired on the same millisecond as its animation reads as slightly late. So it
 * is given a head start, and the two land together.
 */
const SOUND_LEAD = 90;

/**
 * How long one Heat tick takes to light or go out.
 *
 * Paced to be SEEN. The first version moved the whole gauge in 240ms however
 * far it had to go, which is below the threshold at which a count reads as
 * counting — it looked like the number simply changing. A tick is its own beat
 * now: three Heat takes about two-thirds of a second to arrive, which is slow
 * enough to watch and slow enough to feel like the reactor filling.
 *
 * It is allowed to outlast its own sound. A gauge that stops when the noise
 * does is a gauge nobody sees move.
 */
const HEAT_TICK_MS = 300;

/**
 * The same, for Heat arriving.
 *
 * Slower than the vent, and that is not symmetry for its own sake. A vent goes
 * out through cold blue, so each tick announces itself and 300ms is plenty to
 * read three of them. Heat arriving only ever went from dim to warm, which at
 * the same pace blurred into the whole gauge lighting at once — so it gets both
 * a longer step and a flash of its own, below.
 */
const HEAT_RISE_MS = 380;

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
  /**
   * Where the Heat gauge should end up, so anything the beats did not walk
   * through can be put right. Null outside a fight.
   */
  readonly heat: number | null;
}

/**
 * The sound of a batch of log entries.
 *
 * Driven off the log rather than off the call sites, for the same reason the
 * animations are: the log is the one place that already knows everything that
 * happened, in order, with the numbers attached. Sprinkling `play()` through
 * the UI would mean every new effect needs remembering twice — and the ORDER
 * would be whatever the call sites happened to run in, where here it is the
 * order the fight actually resolved.
 *
 * Only sounds are chosen here. `sound.ts` owns the queue, and the rule that
 * two of them never overlap.
 *
 * Outside `prefersReducedMotion`, deliberately. Reduced motion is a statement
 * about things moving on screen; it is not a request for silence, and treating
 * it as one would take the audio away from exactly the players most likely to
 * be relying on it.
 */
/**
 * Which sound an entry is, if it is one at all.
 *
 * Only the mapping lives here. WHEN it plays is decided in `playLogFx`, on the
 * same timeline as the picture — see `playAt`.
 */
function soundFor(entry: LogEntry, withRider: ReadonlySet<string>): SoundKey | null {
  const detail = entry.detail;
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return null;

  switch (entry.kind) {
    case 'heat':
      // Overheat first: it also carries a total, and it is the louder fact.
      if (typeof detail['damage'] === 'number') return 'overheat';
      if (typeof detail['gained'] === 'number') return 'heatGain';
      if (typeof detail['vented'] === 'number') return 'vent';
      return null;

    case 'stance':
      // A refused change is the game saying no, not a stance being entered.
      if (detail['refused'] === true) return null;
      if (detail['to'] === 'iai') return 'stanceIai';
      if (detail['to'] === 'guard') return 'stanceGuard';
      return null;

    case 'card': {
      // The rider's own line is silent; it is folded into the card's sound.
      if (typeof detail['rider'] === 'string') return null;

      const card = detail['card'];
      if (typeof card === 'string' && detail['cost'] !== undefined) {
        /* Every card announces itself, in the voice of what it does — see
           `cardVoice`. It used to be attacks only, with everything else left to
           be described by its effects, which meant a shield and a Focus and a
           Power all sounded the same as each other and as nothing. */
        const def = cardTable.find(card);
        return def === undefined ? null : cardVoice(def, withRider.has(card));
      }

      /* Two draw sounds. The turn-start deal comes from `system`; anything else
         is a card that drew mid-turn, which is a different event to a player. */
      if (typeof detail['count'] === 'number') {
        return entry.source === 'system' ? 'drawTurn' : 'draw';
      }
      return null;
    }

    case 'block': {
      // Only the player's own Block. An enemy plating itself is its business.
      if (detail['to'] !== 'player') return null;
      /* And only when it did NOT come from a card. A card that shields already
         said so in its own voice at its own beat; hearing the shield twice for
         one press is worse than hearing it once. Relic and stance Block still
         speak, because nothing else announced those. */
      return cardTable.find(entry.source) === undefined ? 'block' : null;
    }

    case 'damage': {
      if (detail['to'] !== 'player') return null;
      const toHull = detail['toHull'];
      const blocked = detail['blocked'];
      if (typeof toHull === 'number' && toHull > 0) return 'damage';
      if (typeof blocked === 'number' && blocked > 0) return 'blocked';
      return null;
    }

    case 'combat':
      return typeof detail['health'] === 'number' ? 'heal' : null;

    case 'thread':
      return detail['thread'] === SECT_RITES ? 'rites' : null;

    default:
      return null;
  }
}

/** Every card that fired a stance rider in this batch. A two-phase attack. */
function ridersIn(fresh: readonly LogEntry[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const entry of fresh) {
    const detail = entry.detail;
    if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) continue;
    if (typeof detail['rider'] === 'string' && typeof detail['card'] === 'string') {
      out.add(detail['card']);
    }
  }
  return out;
}

export interface LogFxTiming {
  /** How long the whole sequence occupies. */
  readonly ms: number;
  /**
   * When the turn-start deal should begin, or null if this batch has none.
   *
   * The hand used to fly in the instant the render landed, while its sound
   * waited its turn on the beat timeline behind whatever the reactor was doing
   * — so on a turn that opened with Scald you watched the cards arrive and
   * heard them a second later. The deal is an event like any other and belongs
   * on the same clock.
   */
  readonly dealAt: number | null;
}

export function playLogFx(
  fresh: readonly LogEntry[],
  locate: (target: string) => Element | null,
  options: LogFxOptions,
): LogFxTiming {
  if (fresh.length === 0) {
    settleBars();
    settleHeat(options.heat);
    return { ms: 0, dealAt: null };
  }

  /* A new batch is a new sequence, and the minimum gap between sounds is about
     ordering THIS one — not about throttling the player across clicks. */
  resetSoundSchedule();

  const withRider = ridersIn(fresh);

  /* ---- one timeline, for the picture and the sound ----
   *
   * They used to be two passes: the sound fired immediately, in log order, and
   * the animation was scheduled on beats. So every sound arrived before the
   * thing it described, and a run of them took as long as the FILES took to
   * play rather than as long as the fight took to resolve — progressively later
   * and later behind the picture.
   *
   * Now there is one slot counter. Whatever advances the picture advances the
   * sound, and both are handed the same delay. Playing Sever is: the attack, as
   * the damage lands; then the gauge filling three, as the Heat is heard; then
   * two going out right to left, as the vent is heard. Three beats, in that
   * order, because that is the order the engine resolved them in. */
  const reduced = prefersReducedMotion();
  const drains = new Map<string, { delay: number; share: number }[]>();

  /* A cursor in milliseconds, not a slot number.
   *
   * Beats used to be evenly spaced, which works only while every beat is
   * instantaneous. A Heat walk is not: three ticks arriving is over a second of
   * gauge, and the next beat has to wait for it. So each beat is placed at the
   * cursor, and the cursor advances by however long that beat actually occupies
   * plus the gap. */
  let cursor = FIRST_BEAT;
  let beat: string | null = null;
  let beatSource: string | null = null;
  let opened = false;

  /**
   * Take the next beat, unless this is a continuation of the current one.
   *
   * The gap depends on WHOSE beat is next. Everything that follows from one
   * press — a card's hit, then the Heat it cost — is one action to the player
   * and gets the tight gap; a beat belonging to something else, which in
   * practice means the next enemy in the room, gets the room to be read as a
   * separate event.
   */
  const openBeat = (key: string, source: string): number => {
    if (key === beat) return cursor;
    if (opened) cursor += source === beatSource ? BEAT_WITHIN : BEAT_BETWEEN;
    beat = key;
    beatSource = source;
    opened = true;
    return cursor;
  };

  /* A card is announced by what it DOES. `cardSkill` is only for the ones that
     do nothing audible — a status, a Focus, an Energy — because a card being
     played should never be silent, and everything else already has a voice. */
  let pendingSkill: { delay: number } | null = null;
  let cardSpoke = false;
  let dealAt: number | null = null;

  /* Sound leads its picture. `delay` is when the number floats and the bar
     moves; the noise starts `SOUND_LEAD` before that, so the two arrive at the
     ear and the eye together rather than the sound trailing. */
  const speak = (key: SoundKey, delay: number): void => {
    playAt(key, Math.max(0, delay - SOUND_LEAD));
    cardSpoke = true;
  };

  for (const entry of fresh) {
    const detail = entry.detail as Record<string, unknown> | null;
    const isPlay =
      entry.kind === 'card' &&
      detail !== null &&
      typeof detail['card'] === 'string' &&
      detail['cost'] !== undefined;

    /* A new card resets the question. If the one before it never made a noise,
       it gets the skill sound now, on the beat it was played. */
    if (isPlay) {
      if (pendingSkill !== null && !cardSpoke) speak('cardSkill', pendingSkill.delay);
      cardSpoke = false;
      pendingSkill = { delay: Math.max(0, cursor) };
    }

    const sound = soundFor(entry, withRider);

    /* ---- Heat: its own beat, and the gauge walks with it ---- */
    if (entry.kind === 'heat' && detail !== null && typeof detail['total'] === 'number') {
      const rising = typeof detail['gained'] === 'number';
      if (typeof detail['gained'] === 'number' || typeof detail['vented'] === 'number') {
        const delay = openBeat(`heat#${entry.source}#${cursor}`, entry.source);
        if (sound !== null) speak(sound, delay);
        /* The walk's own length is added to the cursor, so whatever comes next
           — a vent after a gain, most often — starts when the gauge has
           finished rather than on top of it. */
        if (!reduced) cursor += stepHeat(detail['total'], delay, rising);
        continue;
      }
    }

    /* ---- blows: grouped by swing, exactly as before ---- */
    let spokeHere = false;
    for (const hit of hitsFromEntry(entry)) {
      const anchor = locate(hit.target);
      if (anchor === null) continue;

      const box = anchor.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;

      const delay = openBeat(
        `${entry.source}#${hit.swing}#${hit.kind === 'shield' ? 's' : 'h'}`,
        entry.source,
      );

      // The blow's own sound rides its beat, once per beat rather than once per
      // target: an arc through three enemies is one sound, not three.
      if (sound !== null && !spokeHere) {
        speak(sound, delay);
        spokeHere = true;
      }

      if (reduced) continue;

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
    if (spokeHere) continue;

    /* ---- everything else: a stance, a draw, a card that only announced
            itself. One beat each, so an action that does two things says them
            in the order it did them. ---- */
    if (sound !== null) {
      /* The turn-start deal waits for the reactor to finish.
       *
       * A turn ending and the turn after it are two dispatches, so a GUARD vent
       * is still walking the gauge down when the next hand is dealt — and this
       * batch's clock starts at zero knowing nothing about it. The result was a
       * hand arriving over a gauge still emptying, with both sounds at once.
       * Only the deal waits: making everything wait would put the pause back on
       * the card you just played. */
      if (sound === 'drawTurn') cursor = Math.max(cursor, heatRemainingMs());

      const delay = openBeat(`${entry.source}#${cursor}#s`, entry.source);
      speak(sound, delay);
      // Handed back, so the cards fly in on the same beat their sound plays
      // rather than the instant the render happened.
      if (sound === 'drawTurn') dealAt = delay;
    }
  }

  // The last card, if it never spoke for itself.
  if (pendingSkill !== null && !cardSpoke) speak('cardSkill', pendingSkill.delay);

  for (const [key, steps] of drains) {
    drainBar(key, steps, key === 'player' ? null : locate(key.slice('enemy:'.length)));
  }
  /* Everything the beats did not claim goes straight where it was headed — a
     heal, a fight that has just started, an enemy whose whole hit was absorbed.
     Without this a staged bar or gauge would sit at its old value forever. */
  settleBars();
  settleHeat(options.heat);

  // How long the whole sequence takes, so the caller can wait for it. The enemy
  // turn should not start while the player's last three numbers are still in
  // the air — that is exactly the "everything at once" the pacing is fixing.
  return { ms: opened ? cursor : 0, dealAt };
}
