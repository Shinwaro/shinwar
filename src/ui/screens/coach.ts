/* The coach — the introduction's voice.
 *
 * It lives in the app shell's overlay rather than inside the combat screen,
 * and that is not a detail: the combat screen replaces its entire subtree on
 * every render, so anything mounted inside it would be destroyed the first
 * time the player did anything. From the overlay it survives, and re-measures
 * its targets whenever state changes — which is exactly when the screen it is
 * pointing at was rebuilt.
 *
 * **It never blocks the game.** Rings and a card, never a modal: every step
 * leaves the fight fully playable underneath. A tutorial that disables the
 * thing it is describing teaches the shape of the tutorial instead of the
 * shape of the game.
 *
 * **Steps that ask for something ring the card AND the target.** "Play the
 * Block card" with only the card lit leaves a first-time player holding a
 * selected card with no idea what to click next, which is exactly the moment a
 * tutorial loses somebody. The fight is dealt unshuffled — see
 * `content/tutorial.ts` — so the card being pointed at is always in hand.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import {
  TUTORIAL_BLOCK_CARD,
  TUTORIAL_FOCUS_CARD,
  TUTORIAL_HEAT_CARD,
} from '../../content/tutorial.ts';
import { button, el } from '../dom.ts';

interface Step {
  readonly title: string;
  readonly body: string;
  /** Everything to ring. Empty centres the card and points at nothing. */
  readonly targets: readonly string[];
  /**
   * When the step is finished. `null` means "when they press the button" —
   * anything else is the game itself saying so, which is always better.
   */
  readonly done: ((state: GameState) => boolean) | null;
  readonly next?: string;
}

/**
 * Where an element *sits*, ignoring anything currently moving it.
 *
 * `getBoundingClientRect` includes transforms, so a card still dealing in
 * measures as its animation: scaled to 0.18 and sitting on the deck pile. The
 * step that says "play Measured Draw" was therefore ringing a 36x40 box in the
 * corner, which reads as the game pointing at the deck.
 *
 * Waiting for the animation to finish was the obvious fix and the wrong one —
 * the document timeline freezes while a tab is hidden, so `finished` may not
 * resolve for minutes and the ring would simply never appear. Layout offsets
 * are unaffected by transforms and are correct immediately, whatever is moving.
 *
 * Falls back to the visual rect for positioned elements with no offset parent
 * (the fixed corner rail), where the two agree anyway because nothing animates
 * them.
 */
function layoutRect(node: Element): DOMRect {
  const visual = node.getBoundingClientRect();
  if (!(node instanceof HTMLElement)) return visual;

  const parent = node.offsetParent;
  if (!(parent instanceof HTMLElement)) return visual;

  const base = parent.getBoundingClientRect();
  const style = getComputedStyle(parent);
  // `offsetLeft` is measured from the parent's PADDING box; the rect is its
  // border box. Without the border widths the ring drifts by the frame.
  const left = base.left + parseFloat(style.borderLeftWidth || '0') + node.offsetLeft;
  const top = base.top + parseFloat(style.borderTopWidth || '0') + node.offsetTop;
  return new DOMRect(left, top, node.offsetWidth, node.offsetHeight);
}

/** Has this card left the hand for good this fight? */
function played(state: GameState, cardId: string): boolean {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return false;
  return [...combat.discard, ...combat.exhaust].some((card) => card.defId === cardId);
}

/** The card in hand, and the hauler. What a "play this" step lights up. */
function aim(cardId: string): readonly string[] {
  return [`.hand .card[data-card="${cardId}"]`, '.enemy'];
}

/* The phone breakpoint, in pixels, matching the `56rem` block in `game.css`.
   The two have to agree: the stylesheet makes the card full-width at this size
   and this decides where to put it. */
const NARROW = 56 * 16;

/* A gap narrower than this is not a place to put words at all — one line of a
   title and nothing else. Below it the step is centred instead, because at that
   point there is genuinely nowhere clear and a legible box over the board beats
   an illegible one wedged into a crack. */
const MIN_COACH_GAP = 88;

const STEPS: readonly Step[] = [
  {
    title: 'One fight',
    body: 'You are a ronin of a dead orbital sect, flying a salvaged cutter, scouring space in search of answers about your past.',
    targets: [],
    done: null,
    next: 'Show me',
  },
  {
    title: 'Health and Block',
    body: 'Health is your most important resource. When it reaches 0, the run is over. Block absorbs damage before it reaches health, and it is gone at the start of your next turn.',
    targets: ['.stat--hull'],
    done: null,
  },
  {
    title: 'Take some cover',
    body: 'Play Solar Shield — click the card, then click the hauler. Watch the shield number beside your health.',
    targets: [...aim(TUTORIAL_BLOCK_CARD), '.stat--hull'],
    done: (state) => played(state, TUTORIAL_BLOCK_CARD),
  },
  {
    /* The payoff for the step above, given its own beat.
       Playing the card and reading what it did are two different moments, and
       folding them into one meant the number appeared while the player was
       still looking at their hand. */
    title: 'There it is',
    body: 'Six Block, sitting above your health. The hauler swings for six at the end of this turn — that is the whole of it absorbed, and nothing reaches you.',
    targets: ['.shield'],
    done: null,
  },
  {
    title: 'Energy',
    body: 'You get 3 Energy a turn, and it does not carry over to the next turn. Every card costs some.',
    targets: ['.resources'],
    done: null,
  },
  {
    title: 'Now something that costs',
    body: 'Play Thermal Lance. Two Energy, twelve damage — and it puts two Heat on the reactor and leaves it there.',
    targets: aim(TUTORIAL_HEAT_CARD),
    done: (state) => played(state, TUTORIAL_HEAT_CARD),
  },
  {
    title: 'Heat',
    body: 'Strong cards build Heat. End a turn at 8 or more and you overheat: you take damage, you get 0 Energy next turn, and a card burns. Reach 10 and the turn ends immediately.',
    targets: ['.heat'],
    done: null,
  },
  {
    title: 'Stance',
    body: 'You are always in one of two stances, and it changes what your cards do. GUARD vents 1 Heat and retains 3 Block at the end of your turn. IAI turns Focus into damage; GUARD turns Focus into Block.',
    targets: ['.stance-strip'],
    done: null,
  },
  {
    title: 'End the turn',
    body: 'When you have no more moves worth making, end the turn. The hauler takes its move, and you draw a fresh hand.',
    targets: ['.tray-actions'],
    done: (state) => (state.run?.combat?.turn ?? 0) > 1,
  },
  {
    title: 'Focus',
    body: 'Play Measured Draw. It gains you a Focus — and the stance decides what that Focus becomes: damage in IAI, Block in GUARD.',
    targets: aim(TUTORIAL_FOCUS_CARD),
    done: (state) => played(state, TUTORIAL_FOCUS_CARD),
  },
  {
    title: 'The rest is for you to explore.',
    body: 'Show log opens a record of every number and where it came from, newest first. Info explains anything you are confused about. Now finish the hauler.',
    targets: ['.combat-corner'],
    done: null,
    next: 'I understand',
  },
];

export function renderCoach(store: Store, onDone: () => void): HTMLElement {
  const host = el('div', { class: 'coach', 'aria-live': 'polite' });
  let index = 0;

  const finish = (): void => {
    host.replaceChildren();
    onDone();
  };

  const advance = (): void => {
    index += 1;
    if (index >= STEPS.length) {
      finish();
      return;
    }
    draw();
  };

  function draw(): void {
    const step = STEPS[index];
    if (step === undefined) {
      finish();
      return;
    }

    /* Rings are drawn from each target's LAYOUT box, read fresh every time.
       The screen underneath is rebuilt between renders, so a remembered rect
       belongs to a node that no longer exists. */
    const boxes = step.targets
      .map((selector) => document.querySelector(selector))
      .map((node) => (node === null ? null : layoutRect(node)))
      .filter((box): box is DOMRect => box !== null && box.width > 0);

    /* One dimming layer with a hole cut for every target, rather than a ring
       per target carrying its own enormous spread shadow.

       The spread-shadow version worked perfectly for one target and was wrong
       the moment there were two: each ring's shadow darkens everything outside
       ITSELF, so ring A dimmed the inside of ring B and vice versa. Every step
       that pointed at a card and its target — which is every step that asks the
       player to do something — had both of the things it was pointing at greyed
       out.

       `path(evenodd, …)` is one subpath around the viewport followed by one per
       hole; the even-odd rule turns the inner ones into holes. */
    const pad = 6;
    const holes = boxes
      .map((box) => {
        const x = Math.round(box.left - pad);
        const y = Math.round(box.top - pad);
        const right = Math.round(box.right + pad);
        const bottom = Math.round(box.bottom + pad);
        return `M${x} ${y} H${right} V${bottom} H${x} Z`;
      })
      .join(' ');

    const dim =
      boxes.length === 0
        ? el('div', { class: 'coach-dim' })
        : el('div', {
            class: 'coach-dim',
            style: `clip-path: path(evenodd, "M0 0 H${Math.round(window.innerWidth)} V${Math.round(window.innerHeight)} H0 Z ${holes}")`,
          });

    const rings = boxes.map((box) =>
      el('div', {
        class: 'coach-ring',
        style: `left:${box.left - pad}px;top:${box.top - pad}px;width:${box.width + pad * 2}px;height:${box.height + pad * 2}px`,
      }),
    );

    /* The card is placed clear of everything it is pointing at, measured
       against the whole set rather than the first one — a "play this card" step
       rings the hand and the hauler, which sit at opposite ends of the screen,
       and following only the first would put the words on top of the other. */
    const top = boxes.length === 0 ? null : Math.min(...boxes.map((box) => box.top));
    const bottom = boxes.length === 0 ? null : Math.max(...boxes.map((box) => box.bottom));
    const roomAbove = top ?? 0;
    const roomBelow = window.innerHeight - (bottom ?? window.innerHeight);

    const wide =
      boxes.length === 0
        ? null
        : roomBelow >= roomAbove
          ? `top:${Math.min(window.innerHeight - 190, (bottom ?? 0) + 16)}px`
          : `bottom:${Math.min(window.innerHeight - 40, window.innerHeight - (top ?? 0) + 16)}px`;

    const placement = window.innerWidth <= NARROW ? narrowPlacement(boxes) : wide;

    const card = el(
      'div',
      {
        class: `coach-card${placement === null ? ' coach-card--centre' : ''}`,
        style: placement,
        role: 'dialog',
        'aria-label': step.title,
      },
      [
        el('p', { class: 'coach-step' }, [`${index + 1} of ${STEPS.length}`]),
        el('h2', { class: 'coach-title' }, [step.title]),
        el('p', { class: 'coach-body' }, [step.body]),
        el('div', { class: 'coach-actions' }, [
          step.done === null
            ? button(step.next ?? 'Next', { class: 'btn btn-primary btn-coach' }, advance)
            : el('span', { class: 'coach-wait' }, ['Your move.']),
          button('Skip the introduction', { class: 'btn btn-quiet btn-coach' }, finish),
        ]),
      ],
    );

    host.replaceChildren(dim, ...rings, card);
  }

  /* Re-measure and re-check on every state change: that is precisely when the
     screen underneath was rebuilt and when a "play this card" step might have
     been satisfied. */
  const unsubscribe = store.subscribe((state) => {
    const step = STEPS[index];
    if (step?.done?.(state) === true) {
      advance();
      return;
    }
    draw();
  });

  /* Rings are `position: fixed` and drawn from viewport coordinates, so they
     are correct exactly until the page moves under them. On a desktop the board
     fits and nothing ever moves; on a phone it scrolls, and every ring stayed
     where the screen used to be — pointing at whatever had scrolled into that
     spot. The card placement reads the same rectangles, so it drifted onto the
     hand at the same time.
   *
   * Passive listeners, and a redraw rather than a transform: the step underneath
   * may have been satisfied while the finger was moving, and `draw` is the one
   * path that re-measures everything from the live DOM. Orientation change comes
   * through `resize`, which is the other way this used to end up stale. */
  const remeasure = (): void => draw();
  window.addEventListener('scroll', remeasure, { passive: true, capture: true });
  window.addEventListener('resize', remeasure, { passive: true });

  host.addEventListener('shinwar:unmount', () => {
    unsubscribe();
    window.removeEventListener('scroll', remeasure, { capture: true } as EventListenerOptions);
    window.removeEventListener('resize', remeasure);
  });

  /* First paint is deferred, and ONLY deferred.
     The coach is built before it is appended, so a synchronous draw here would
     measure rectangles of zeros. */
  requestAnimationFrame(draw);

  return host;
}

/**
 * Where the words go on a phone.
 *
 * "Above or below whatever it is pointing at" is the right rule on a wide
 * screen and cannot work on a narrow one. A step that asks you to play a card
 * rings the top bar, an enemy AND the hand, and on a 375x812 screen those three
 * span the whole viewport — there is no above and no below left. The desktop
 * rule then clamped to `innerHeight - 190`, a guess at the card's own height
 * that is 20-40px short once the body text wraps at phone width, and landed the
 * instructions on top of the hand they were telling you to tap with the buttons
 * off the bottom edge.
 *
 * So on a phone it looks for the largest GAP between the things it is ringing
 * and sits in that, capped to the gap's own height so it can never grow back
 * over them. On the "play a card" step the gap between the enemy and the hand
 * is about 265px, which is where a person would have put it.
 *
 * Returns the inline style, or null to fall back to the centred placement.
 */
function narrowPlacement(boxes: readonly DOMRect[]): string | null {
  if (boxes.length === 0) return null;

  const pad = 12;
  const height = window.innerHeight;

  /* Merge the ringed bands, then read the gaps between them. Merging matters:
     two rings that touch are one obstacle, and treating them as two invents a
     gap of zero between them that the search would happily "win". */
  const bands = boxes
    .map((box) => ({ top: box.top - pad, bottom: box.bottom + pad }))
    .sort((a, b) => a.top - b.top)
    .reduce<{ top: number; bottom: number }[]>((merged, band) => {
      const last = merged[merged.length - 1];
      if (last !== undefined && band.top <= last.bottom) {
        last.bottom = Math.max(last.bottom, band.bottom);
        return merged;
      }
      return [...merged, { ...band }];
    }, []);

  const gaps: { top: number; size: number }[] = [];
  let cursor = 0;
  for (const band of bands) {
    if (band.top - cursor > 0) gaps.push({ top: cursor, size: band.top - cursor });
    cursor = Math.max(cursor, band.bottom);
  }
  if (height - cursor > 0) gaps.push({ top: cursor, size: height - cursor });

  const best = gaps.reduce<{ top: number; size: number } | null>(
    (winner, gap) => (winner === null || gap.size > winner.size ? gap : winner),
    null,
  );
  /* The BIGGEST gap, whatever its size, rather than only a gap that fits
     comfortably. The first version demanded 150px and centred when it could not
     find one — which on the "play a card" step means centring on top of the
     hand, swallowing every tap meant for a card. A cramped box that scrolls is
     a worse read and a working game; a roomy box over the hand is neither. */
  if (best === null || best.size < MIN_COACH_GAP) return null;

  /* `max-height` is what keeps the promise. Without it a long step in a short
     gap simply grows back over the ring, and the gap search would have bought
     nothing on exactly the steps that need it most. */
  return `top:${Math.round(best.top + 4)}px;max-height:${Math.round(best.size - 8)}px;overflow-y:auto`;
}
