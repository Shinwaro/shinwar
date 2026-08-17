/* The animation layer.
 *
 * Small on purpose. Three things: numbers that rise off what they hit, bars
 * that drain instead of snapping, and a beat between a card leaving your hand
 * and its effect landing. Screen shake, hit sparks and weapon effects wait for
 * M7 — this pass exists because a state change you cannot see the *order* of
 * is a state change you cannot read.
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

export type FloatKind = 'damage' | 'block' | 'heal' | 'heat';

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

/** Tests and screen teardown. A floater outliving its fight is just litter. */
export function clearFloaters(): void {
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
const FIRST_BEAT = 180;
/** Spacing between consecutive hits, so a multi-hit reads as several blows. */
const BEAT_STEP = 260;

interface Hit {
  readonly target: string;
  readonly text: string;
  readonly kind: FloatKind;
}

function hitFromEntry(entry: LogEntry): Hit | null {
  const detail = entry.detail;
  if (detail === null) return null;

  const target = typeof detail['to'] === 'string' ? detail['to'] : null;
  if (target === null) return null;

  if (entry.kind === 'damage') {
    const amount = typeof detail['toHull'] === 'number' ? detail['toHull'] : 0;
    const blocked = typeof detail['blocked'] === 'number' ? detail['blocked'] : 0;
    // A fully blocked hit still gets a number: "0" over your shield is the
    // clearest possible confirmation that the Block did its job.
    if (amount === 0 && blocked === 0) return null;
    return { target, text: amount === 0 ? 'blocked' : `-${amount}`, kind: 'damage' };
  }

  if (entry.kind === 'block') {
    const amount = typeof detail['amount'] === 'number' ? detail['amount'] : 0;
    if (amount <= 0) return null;
    return { target, text: `+${amount}`, kind: 'block' };
  }

  return null;
}

/**
 * Play the entries added since the last render.
 *
 * `locate` maps a target key — `'player'` or an enemy uid — to the element the
 * number should rise from. Returning `null` drops the floater rather than
 * guessing a position; a number floating over nothing is worse than no number.
 */
export function playLogFx(
  fresh: readonly LogEntry[],
  locate: (target: string) => Element | null,
): number {
  if (prefersReducedMotion() || fresh.length === 0) return 0;

  let slot = 0;
  for (const entry of fresh) {
    const hit = hitFromEntry(entry);
    if (hit === null) continue;

    const anchor = locate(hit.target);
    if (anchor === null) continue;

    const box = anchor.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;

    floatText({
      text: hit.text,
      kind: hit.kind,
      x: box.left + box.width / 2,
      y: box.top + box.height * 0.32,
      delay: FIRST_BEAT + slot * BEAT_STEP,
    });
    slot += 1;
  }

  // How long the whole sequence takes, so the caller can wait for it. The enemy
  // turn should not start while the player's last three numbers are still in
  // the air — that is exactly the "everything at once" the pacing is fixing.
  return slot === 0 ? 0 : FIRST_BEAT + (slot - 1) * BEAT_STEP;
}
