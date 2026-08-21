/* The coach — the introduction's voice.
 *
 * It lives in the app shell's overlay rather than inside the combat screen,
 * and that is not a detail: the combat screen replaces its entire subtree on
 * every render, so anything mounted inside it would be destroyed the first
 * time the player did anything. From the overlay it survives, and re-measures
 * its target whenever state changes — which is exactly when the screen it is
 * pointing at was rebuilt.
 *
 * **It never blocks the game.** The highlight is a ring and a hole, not a
 * modal: every step leaves the fight fully playable underneath. A tutorial
 * that disables the thing it is describing teaches the shape of the tutorial
 * instead of the shape of the game.
 *
 * Steps advance either on a click, or on the game itself reaching a state —
 * "play a card" is over when a card has been played, not when the reader says
 * so. That is what keeps it two minutes rather than ten screens of prose.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { HEAT, PLAYER } from '../../content/balance.ts';
import { button, el } from '../dom.ts';

interface Step {
  readonly title: string;
  readonly body: string;
  /** What to ring. `null` centres the card and points at nothing. */
  readonly target: string | null;
  /**
   * When the step is finished. `null` means "when they press Next" — anything
   * else is the game itself saying so, which is always better where it exists.
   */
  readonly done: ((state: GameState) => boolean) | null;
  /** Shown on the button when there is one. */
  readonly next?: string;
}

const STEPS: readonly Step[] = [
  {
    title: 'One fight',
    body: 'You are a ronin of a dead orbital sect, flying a salvaged cutter. This is a derelict hauler with sixty health and nothing to lose. Two minutes, and nothing here can end your run.',
    target: null,
    done: null,
    next: 'Show me',
  },
  {
    title: 'Health and Block',
    body: 'Health is the run — there is no saving, so it is the only thing you really spend. Block absorbs damage before it reaches health, and it is gone at the start of your next turn. Block you did not need was wasted; block you skipped is health.',
    target: '.stat--hull',
    done: null,
  },
  {
    title: 'It tells you what it will do',
    body: 'Every enemy telegraphs its next move, and it never changes its mind after you act. The number shown is the number that will land. Block the big ones; hit back on the quiet ones.',
    target: '.enemy',
    done: null,
  },
  {
    title: 'Energy',
    body: `You get ${PLAYER.energyPerTurn} Energy a turn and it does not carry over. Every card costs some. The whole game is what you spend it on.`,
    target: '.resources',
    done: null,
  },
  {
    title: 'Heat',
    body: `Your best cards build Heat. End a turn at ${HEAT.overheatAt} or more and the reactor bites: damage, and a card burns. Reach ${HEAT.criticalAt} and the turn ends immediately, wherever you are. It is a resource you spend, not a meter you avoid.`,
    target: '.heat',
    done: null,
  },
  {
    title: 'Stance',
    body: 'You are always in one of two stances, and it changes what your cards mean. IAI turns Focus into damage and cooks you. GUARD turns Focus into Block and cools you. Some cards change it.',
    target: '.stance-strip',
    done: null,
  },
  {
    title: 'Play a card',
    body: 'Click a card to pick it up, then click the hauler to play it. Cards that need no target play on the second click. Go on — take a swing.',
    target: '.hand',
    done: (state) => (state.run?.combat?.cardsPlayedThisTurn ?? 0) > 0,
  },
  {
    title: 'Spend the turn',
    body: 'Keep going until the Energy runs out or you want to stop. Then end the turn — the hauler takes its move, and you draw a fresh hand.',
    target: '.tray-actions',
    done: (state) => (state.run?.combat?.turn ?? 0) > 1,
  },
  {
    title: 'The rest is yours',
    body: 'That is the whole loop. The log in the corner records every number and where it came from, and Info explains anything you have forgotten. Now put it down.',
    target: '.combat-corner',
    done: (state) => state.run?.combat === null || state.phase === 'over',
    next: 'Finish it',
  },
];

export function renderCoach(store: Store, onDone: () => void): HTMLElement {
  const host = el('div', { class: 'coach', 'aria-live': 'polite' });
  let index = 0;

  const finish = (): void => {
    host.remove();
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

    /* The ring is drawn from the target's own rectangle, read fresh every
       time. The screen underneath was rebuilt between renders, so a remembered
       rect belongs to a node that no longer exists. */
    const target = step.target === null ? null : document.querySelector(step.target);
    const box = target?.getBoundingClientRect() ?? null;
    const ring =
      box === null || box.width === 0
        ? null
        : el('div', {
            class: 'coach-ring',
            style: `left:${box.left - 6}px;top:${box.top - 6}px;width:${box.width + 12}px;height:${box.height + 12}px`,
          });

    /* The card is placed away from whatever it is pointing at, so it never
       covers the thing the words are about. Below the target unless the target
       is in the bottom half, in which case above it. */
    const below = box !== null && box.bottom < window.innerHeight * 0.5;
    const placement =
      box === null
        ? 'style=centre'
        : below
          ? `top:${Math.min(window.innerHeight - 200, box.bottom + 18)}px`
          : `bottom:${Math.min(window.innerHeight - 40, window.innerHeight - box.top + 18)}px`;

    const card = el(
      'div',
      {
        class: `coach-card${box === null ? ' coach-card--centre' : ''}`,
        style: box === null ? null : placement,
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

    host.replaceChildren(...(ring === null ? [card] : [ring, card]));
  }

  /* Re-measure and re-check on every state change: that is precisely when the
     screen underneath was rebuilt and when a "play a card" step might have
     been satisfied. */
  const unsubscribe = store.subscribe((state) => {
    const step = STEPS[index];
    if (step?.done?.(state) === true) {
      advance();
      return;
    }
    draw();
  });

  host.addEventListener('shinwar:unmount', unsubscribe);

  /* First paint is deferred, and ONLY deferred.
     The coach is built before it is appended, so a synchronous draw here would
     measure a rectangle of zeros. It used to do both — draw now and again next
     frame — which was harmless only by luck, because step one points at
     nothing and "centred" happened to be the right answer for it. Give step
     one a target and it would flash in the wrong place for a frame. */
  requestAnimationFrame(draw);

  return host;
}
