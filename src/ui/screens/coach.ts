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
  TUTORIAL_BURN_CARD,
  TUTORIAL_FOCUS_CARD,
  TUTORIAL_NUMBER_CARD,
  TUTORIAL_SPEND_CARD,
  TUTORIAL_HEAT_CARD,
  TUTORIAL_STANCE_CARD,
} from '../../content/tutorial.ts';
import { cards as cardTable } from '../../content/registry.ts';
import { HEAT, PLAYER, STANCES } from '../../content/balance.ts';
import { VULNERABLE, WEAK } from '../../content/statuses.ts';
import { stacksOf } from '../../engine/combat/keywords.ts';
import { button, el } from '../dom.ts';

interface Step {
  readonly title: string;
  /**
   * A thunk, not a string, for the steps that name a card.
   *
   * `STEPS` is a module-level const, so anything it evaluates runs at IMPORT
   * time — before `reloadContent()` has put a single card in the registry. A
   * step that looked its card up eagerly threw "no card with id" during module
   * evaluation and took the whole page down to a blank screen, and nothing in
   * the test suite could see it because no test imports this module. Deferring
   * to draw time is the fix and the reason.
   */
  readonly body: string | (() => string);
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

/** Just the card. For a play that never asks you to pick anything. */
function hold(cardId: string): string {
  return `.hand .card[data-card="${cardId}"]`;
}

/**
 * The card in hand, and the enemy. What an AIMED "play this" step lights up.
 *
 * Only the aimed ones. Vector Step changes your own stance and Settle banks
 * your own Focus — neither ever asks for a target, and `needsTarget` in the
 * engine says so — but both were ringing the enemy anyway, which is the game
 * pointing at something you are not supposed to click. It also cut the top of
 * the screen out of the region the words could sit in, which is how the stance
 * step ended up squeezed into an 88px scrolling box between the strip and the
 * hand.
 */
function aim(cardId: string): readonly string[] {
  return [hold(cardId), '.enemy'];
}

/* There is no phone breakpoint here any more, and that is the point.
   The card used to be placed by one rule above 56rem and a different one below
   it, and the two disagreed about the only thing that matters — where the hand
   is. `placeCard` is one rule at every width: above the cards, clear of the
   rings, as near the middle as those two allow. */

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
    /* Before the Block lesson, not after it.
     *
     * The step that asks you to play Solar Shield leans on the enemy swinging
     * for six — a fact the player had no way to have read yet. The whole game
     * is planning against the telegraph, so the telegraph is taught before the
     * first decision that depends on it. */
    title: 'Intent',
    body: 'That mark under the enemy is its intent: exactly what it will do at the end of this turn. It swings for 6. The numbers update if you change something, so what is shown is always what will land.',
    targets: ['.enemy .intent'],
    done: null,
  },
  {
    title: 'Take some cover',
    body: 'Play Solar Shield — click the card, then click the enemy. Watch the shield number beside your health.',
    targets: [...aim(TUTORIAL_BLOCK_CARD), '.stat--hull'],
    done: (state) => played(state, TUTORIAL_BLOCK_CARD),
  },
  {
    /* The payoff for the step above, given its own beat.
       Playing the card and reading what it did are two different moments, and
       folding them into one meant the number appeared while the player was
       still looking at their hand. */
    title: 'There it is',
    /* Two things happened, and only one of them used to be mentioned.
     *
     * Solar Shield's GUARD rider puts Weak on what it is aimed at, so the card
     * the lesson opens with is also the player's first status — and it went by
     * unnamed while the step talked about Block. A pip appearing on the enemy
     * with no explanation is how a player learns to ignore pips.
     *
     * The intent is ringed with it, because Weak is a change to a number the
     * player has already been shown: the telegraph is lower than it was a
     * moment ago, and that is the whole of what Weak means. */
    body: 'Six Block, sitting above your health. The mark on the enemy is Weak: while it is there, everything it swings for hits softer — its intent has already dropped. Most statuses fall off on their own.',
    targets: ['.shield', '.enemy .pip', '.enemy .intent'],
    done: null,
  },
  {
    title: 'Energy',
    body: `You get ${PLAYER.energyPerTurn} Energy a turn, and it does not carry over to the next turn. You use Energy to play cards.`,
    targets: ['.resources'],
    done: null,
  },
  {
    /* Where the cards come from. Taught before the first turn ends, because the
       end of the turn is when the answer stops being obvious: five cards
       arrive, five cards leave, and nothing on screen says where from or to
       unless somebody says it. */
    title: 'Your deck',
    body: () =>
      `Your whole deck is shuffled at the start of a fight and sits in the draw pile. You take ${PLAYER.drawPerTurn} off the top each turn. When it runs out, the discard pile is shuffled and becomes the new draw pile.`,
    targets: ['.piles'],
    done: null,
  },
  {
    title: 'Now something that costs',
    body: 'Play Thermal Lance. Two Energy, twelve damage — and it puts two Heat on the reactor and leaves it there.',
    targets: aim(TUTORIAL_HEAT_CARD),
    done: (state) => played(state, TUTORIAL_HEAT_CARD),
  },
  {
    /* One step, not two. The line and the ceiling were a step each, and between
       them they spent four sentences on a rule the gauge itself states in the
       readout underneath it. */
    title: 'Heat',
    body: () =>
      `Heat does not fall off on its own — you vent it. End a turn at ${HEAT.overheatAt} or more and you overheat: you lose ${Math.round(HEAT.overheatDamagePctOfMax * 100)}% of your maximum health, you get 0 Energy next turn, and a card burns. Hit ${HEAT.criticalAt} and the turn ends and you overheat immediately.`,
    targets: ['.heat'],
    done: null,
  },
  {
    /* What ending a turn COSTS, said before they end one.
     *
     * "You draw a fresh hand" was true and left out the half that matters: the
     * hand you are holding does not wait for you. A player told they get five
     * new cards and not told they lose the four they kept learns that rule the
     * expensive way — by hoarding a finisher through three turns that quietly
     * threw it away each time. */
    title: 'End the turn',
    body: 'When you have no more moves worth making, end the turn. Everything you played goes to the discard pile — and so does everything still in your hand. You never hold cards over. Then the enemy takes its move, and you draw a fresh hand.',
    targets: ['.tray-actions'],
    done: (state) => (state.run?.combat?.turn ?? 0) > 1,
  },
  {
    /* After the turn, not before it. Stance is the one thing here that changes
       what a card in your hand is worth, so it belongs next to a hand you are
       about to spend rather than one you have already committed. */
    title: 'Stance',
    body: 'You are always in one of two stances, and it changes what your cards do. GUARD vents 1 Heat and retains 3 Block at the end of your turn.',
    targets: ['.stance-strip'],
    done: null,
  },
  {
    /* Told, then done. The stance was described and then never changed, so the
       strip at the top of the board was a label rather than a control — and the
       IAI half of every card in the deck was a paragraph the player had read
       and never seen happen. */
    title: 'Change it',
    body: () =>
      `Play ${cardTable.get(TUTORIAL_STANCE_CARD).name}. Watch the strip: you are in IAI now, and every card with an IAI line on it is worth more than it was a moment ago.`,
    targets: [hold(TUTORIAL_STANCE_CARD), '.stance-strip'],
    done: (state) => played(state, TUTORIAL_STANCE_CARD),
  },
  {
    /* Told once you are standing in it.
     *
     * The stance step before this one says what a stance IS; this one says what
     * THIS stance does, with the strip in front of you already saying it. Split
     * because they are two different questions and the answer to the second is
     * three separate rules — a paragraph nobody reads while they are also being
     * asked to play a card. */
    title: 'IAI',
    body: () =>
      `The hot stance. Once the gauge is at ${STANCES.iai.hotDamageAtHeat} or more every attack deals ${STANCES.iai.hotDamage} more. What it charges: ${STANCES.iai.heatAtTurnEnd} Heat at the end of every turn, and no Block retained.`,
    targets: ['.stance-strip', '.heat'],
    done: null,
  },
  {
    title: 'Focus',
    /* The card is NAMED from the registry rather than written in. The step used
       to say "Play Measured Draw", and when that card was cut from the pool the
       tutorial went on confidently naming a card that no longer existed. */
    body: () =>
      `Play ${cardTable.get(TUTORIAL_FOCUS_CARD).name}. It banks two Focus — and the stance decides what a Focus becomes: damage in IAI, Block in GUARD.`,
    targets: [hold(TUTORIAL_FOCUS_CARD), '.resource--focus'],
    done: (state) => played(state, TUTORIAL_FOCUS_CARD),
  },
  {
    /* Gaining a Focus and spending one are two ideas, and they were taught as
     * one: the step above says what the stack WOULD become and then moved on.
     * The only resource whose whole point is being banked for later was never
     * seen to pay out. */
    title: 'Spend it',
    body: () =>
      `Two Focus, banked. Play ${cardTable.get(TUTORIAL_SPEND_CARD).name} — it takes ONE of them and adds it to its damage. Watch the row: one pip goes, one stays. A card spends a single stack, never the pile, so what you bank keeps working until something uses it.`,
    targets: [...aim(TUTORIAL_SPEND_CARD), '.resource--focus'],
    done: (state) => played(state, TUTORIAL_SPEND_CARD),
  },
  {
    /* Both directions of the same mechanic, on one screen, at the one moment
       both are visible: the Vulnerable the player just applied and the Weak the
       enemy is about to apply back. Taught together because a player who has
       only ever put statuses ON things reads the enemy's pips as decoration.

       KEEP THIS SHORT. It is the worst-placed step in the tutorial: it rings
       the enemy, which sits at the top of the screen, and `placeCard` may not
       cross the hand — so the card's own height is the whole of what decides
       whether it can sit clear of what it is pointing at. Two more lines of
       prose here and it goes back to covering the intent it is telling you to
       read. */
    title: 'It goes both ways',
    body: () =>
      `${cardTable.get(TUTORIAL_SPEND_CARD).name} left Vulnerable on it — while that lasts it takes more damage from everything. Now read its intent: it is about to put Weak on YOU. Statuses go both ways. End the turn and take it.`,
    targets: [
      `.enemy .pip[data-status="${VULNERABLE}"]`,
      '.enemy .intent',
      '.tray-actions',
    ],
    done: (state) => stacksOf(state.run?.combat?.statuses ?? [], WEAK) > 0,
  },
  {
    /* Where the card face stops helping, stated exactly.
     *
     * `damageFigures` folds the stance's hot bonus and one stack of Focus INTO
     * the printed number — that is why an IAI Slash reads 8 at five Heat — and
     * folds in nothing else. Statuses and carried items are applied at the
     * moment of the hit and never appear on the card, and there are no damage
     * predictions on the enemies either (see the comment in `combat.ts`: the
     * sum is the game, not a chore to automate).
     *
     * So the line has to name the split rather than wave at it. An earlier
     * version said the number "does not know about your Weak, your Focus, or
     * your stance", which was wrong on two of the three and would have taught a
     * player to distrust the one part of the face that is already doing the
     * work for them. */
    title: 'And now it is on you',
    body:
      "Weak, on you: everything you swing for hits 25% softer per stack while it is there. A card's number already takes account of your stance and your Focus. It does not take account of status effects or what you are carrying (relics and implants), so your Weak, the target's Vulnerable and every relic bonus are sums you do yourself.",
    targets: [`.pips--player .pip[data-status="${WEAK}"]`, '.hand'],
    done: null,
  },
  {
    /* The one place the game does the arithmetic, pointed at.
     *
     * Every other step here teaches a rule and leaves the player to apply it.
     * This one is the reverse: two rules the player already met — IAI pays +2
     * above 5 Heat, a Focus stack is worth +2 in IAI — are ALREADY folded into
     * the number on the card, and nothing had ever said so. A player who does
     * not know that is a player adding the same two bonuses on top of a total
     * that already contains them.
     *
     * FIRST on turn three, before the Burn lesson, and that ordering is the
     * whole reason this step works. It points at a card sitting in the hand
     * with nothing to do — so it has to run while the hand is still the one the
     * turn dealt. Behind a step that asks for a card to be PLAYED, the player
     * can have spent the IAI Slash already and the lesson rings nothing.
     *
     * Nothing else is arranged for it. By here the Lance and the Cut have put the
     * gauge on 5 — exactly the line — and one Focus survived Meridian Cut two
     * steps ago. The two bonuses print differently on purpose: the stance's is
     * folded INTO the number and turns it amber, and the Focus rides beside it
     * as its own term, because one is already counted and the other is about to
     * be. `damageFigures` is where that split lives. */
    title: 'Read the number',
    body: () =>
      `${cardTable.get(TUTORIAL_NUMBER_CARD).name} says 6 damage on its face. Look at it in your hand: the number is an 8 now, and amber — that is IAI paying +2 on every attack while Heat is 5 or more, and yours is exactly 5. The +2 sitting beside it is the Focus you did not spend, which goes into the next attack you play. The card counts your stance and your Focus for you. Nothing else.`,
    targets: [hold(TUTORIAL_NUMBER_CARD), '.heat', '.resource--focus'],
    done: null,
  },
  {
    /* Burn, on turn three rather than turn two.
     *
     * It sat between the stance lesson and the Focus one until Drawn Breath
     * replaced Settle, and Drawn Breath costs an Energy where Settle cost
     * none. Turn two has exactly three and no slack, so something had to move,
     * and this was the lesson that did not care when it happened — Culling
     * Stroke is an attack, and turn three is the turn the player is finishing
     * the enemy anyway. */
    title: 'Burn',
    body: () =>
      `${cardTable.get(TUTORIAL_BURN_CARD).name} says Burn. Play it and watch where it goes: not to the discard, so no shuffle brings it back this fight.`,
    targets: [...aim(TUTORIAL_BURN_CARD), '.pile[data-pile="exhaust"]'],
    done: (state) => played(state, TUTORIAL_BURN_CARD),
  },
  {
    /* The last word, and it stays the last word.
     *
     * It was moved earlier once because the finisher used to kill the enemy and
     * take the screen with it. The right fix was the other one: the enemy
     * outlasts the lesson now, so the closing step can sit where a closing step
     * belongs and end on something for the player to go and do. */
    title: 'The rest is for you to explore.',
    body: 'Show log opens a record of every number and where it came from, newest first. Info explains anything you are confused about — every keyword, every colour, every star on the chart. Now finish the enemy.',
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
    /* Skip anything already true.
     *
     * The `done` conditions are only re-checked when the store notifies, so a
     * step whose job was finished BEFORE it came up — a card played early, a
     * turn ended while reading — would sit on "Your move." with nothing left to
     * do, until some unrelated action happened to wake it. Checking on the way
     * in costs one call and removes the whole class of it. */
    while (index < STEPS.length && STEPS[index]?.done?.(store.getState()) === true) index += 1;
    if (index >= STEPS.length) {
      finish();
      return;
    }
    draw();
  };

  /**
   * The geometry the last paint was made from.
   *
   * The rings are `position: fixed` boxes drawn from measurements, so they are
   * correct exactly until something under them moves — and plenty does without
   * a state change to announce it: a hand finishing its deal, an enemy row
   * losing a line when a status falls off, a gauge readout re-wrapping. The
   * stance step was the one that showed it, ringing the Heat bar 23px below the
   * strip it was supposed to be pointing at, because the board had settled
   * upwards after the last redraw and nothing asked again.
   *
   * So the geometry is watched rather than assumed. Cheap: a handful of rect
   * reads a frame, and only while the introduction is on screen.
   */
  let painted = '';

  /** What the current step's targets are, right now. Null entries are dropped. */
  function measure(step: Step): readonly DOMRect[] {
    return step.targets
      .map((selector) => document.querySelector(selector))
      .map((node) => (node === null ? null : layoutRect(node)))
      .filter((box): box is DOMRect => box !== null && box.width > 0);
  }

  /** Everything a paint depends on, in one comparable string. */
  function geometry(boxes: readonly DOMRect[]): string {
    const hand = document.querySelector('.hand');
    const handTop = hand === null ? -1 : Math.round(hand.getBoundingClientRect().top);
    const shape = boxes
      .map((box) => `${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.width)},${Math.round(box.height)}`)
      .join(';');
    return `${window.innerWidth}x${window.innerHeight}|${handTop}|${shape}`;
  }

  /* The three pieces of a step, kept so the geometry can be updated without
     rebuilding the words — which would take the focus off the button and reset
     any scroll inside the card, sixty times a second, while a hand deals. */
  let drawn: { rings: readonly HTMLElement[]; dim: HTMLElement; card: HTMLElement } | null = null;

  const PAD = 6;

  function reposition(): void {
    const step = STEPS[index];
    if (step === undefined || drawn === null) return;
    const boxes = measure(step);
    /* A target that has appeared or gone — the Weak pip arriving, a card
       leaving the hand — is a different set of rings, not a move. */
    if (boxes.length !== drawn.rings.length) {
      draw();
      return;
    }

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
    if (boxes.length === 0) {
      drawn.dim.removeAttribute('style');
    } else {
      const holes = boxes
        .map((box) => {
          const x = Math.round(box.left - PAD);
          const y = Math.round(box.top - PAD);
          const right = Math.round(box.right + PAD);
          const bottom = Math.round(box.bottom + PAD);
          return `M${x} ${y} H${right} V${bottom} H${x} Z`;
        })
        .join(' ');
      drawn.dim.setAttribute(
        'style',
        `clip-path: path(evenodd, "M0 0 H${Math.round(window.innerWidth)} V${Math.round(window.innerHeight)} H0 Z ${holes}")`,
      );
    }

    boxes.forEach((box, at) => {
      const ring = drawn?.rings[at];
      if (ring === undefined) return;
      ring.style.left = `${box.left - PAD}px`;
      ring.style.top = `${box.top - PAD}px`;
      ring.style.width = `${box.width + PAD * 2}px`;
      ring.style.height = `${box.height + PAD * 2}px`;
    });

    placeCard(drawn.card, boxes);
    painted = geometry(boxes);
  }

  function draw(): void {
    const step = STEPS[index];
    if (step === undefined) {
      finish();
      return;
    }

    const boxes = measure(step);

    const dim = el('div', { class: 'coach-dim' });
    const rings = boxes.map(() => el('div', { class: 'coach-ring' }));

    const card = el(
      'div',
      {
        class: 'coach-card',
        // Placed after it is in the document, because placing it needs its own
        // height and nothing detached has one. Hidden until then rather than
        // flashing in the wrong place first.
        style: 'visibility:hidden',
        role: 'dialog',
        'aria-label': step.title,
      },
      [
        el('p', { class: 'coach-step' }, [`${index + 1} of ${STEPS.length}`]),
        el('h2', { class: 'coach-title' }, [step.title]),
        el('p', { class: 'coach-body' }, [typeof step.body === 'function' ? step.body() : step.body]),
        /* One control, and only on the steps that have one.
         *
         * A "Skip the introduction" button sat beside it on every step, and it
         * was the wrong offer to keep making: the lesson is one short fight,
         * and the way past it is to play the fight — which is also the thing
         * being taught. An escape hatch on every step reads as an apology for
         * the screen it is on. Pause still abandons the run, which is the
         * honest version of leaving. */
        el('div', { class: 'coach-actions' }, [
          step.done === null
            ? button(step.next ?? 'Next', { class: 'btn btn-primary btn-coach' }, advance)
            : el('span', { class: 'coach-wait' }, ['Your move.']),
        ]),
      ],
    );

    host.replaceChildren(dim, ...rings, card);
    drawn = { dim, rings, card };
    reposition();
  }

  /* A step is finished by the game, not by a repaint. Everything else that
     changes — and on a live board that is most frames — only moves the rings. */
  const unsubscribe = store.subscribe((state) => {
    const step = STEPS[index];
    if (step?.done?.(state) === true) {
      advance();
      return;
    }
    // `drawn` is null only if the first paint has not happened, which on a
    // hidden tab can be a long time. A state change is as good a moment.
    if (drawn === null) draw();
    else reposition();
  });

  /*
   * The watcher.
   *
   * Scroll and resize used to be the whole of this, on the theory that nothing
   * else moves the board. Plenty does: a hand dealing, an enemy row losing a
   * line, a readout re-wrapping — none of which is a state change, a scroll or
   * a resize, and all of which leave a ring pointing at empty space. Comparing
   * the measured geometry each frame catches every one of them and costs a few
   * rect reads while the introduction is on screen and nothing at all after.
   */
  let watching = true;
  const watch = (): void => {
    if (!watching) return;
    const step = STEPS[index];
    if (step !== undefined && drawn !== null && geometry(measure(step)) !== painted) reposition();
    requestAnimationFrame(watch);
  };

  host.addEventListener('shinwar:unmount', () => {
    watching = false;
    unsubscribe();
  });

  /* First paint is deferred, and ONLY deferred.
     The coach is built before it is appended, so a synchronous draw here would
     measure rectangles of zeros. */
  /* Drawn NOW, and positioned on the next frame.
   *
   * It used to be `requestAnimationFrame(draw)` and nothing else, on the
   * grounds that the coach is built detached and a synchronous measure reads
   * rectangles of zeros. The measuring half is true. Making the whole lesson
   * depend on a frame ever being served is not: a tab that opens the
   * introduction and is then hidden gets no frames at all, and the coach never
   * appeared — no words, no rings, nothing to press.
   *
   * So the words are built immediately and `placeCard` keeps the card hidden
   * until it has a height to be placed by, which is the next frame at the
   * latest. Nothing flashes in the wrong place and nothing depends on a frame
   * arriving. */
  draw();
  requestAnimationFrame(() => {
    reposition();
    watch();
  });

  return host;
}

/**
 * Where the words go.
 *
 * Three rules, in priority order:
 *
 *   1. **Never over the hand.** The cards are what every step is asking you to
 *      reach for, and a panel of instructions lying across them is the one
 *      placement that makes the lesson impossible to follow. The hand is a hard
 *      floor: if the words will not fit above it they scroll inside what room
 *      there is, rather than borrowing a pixel of it.
 *   2. **As little over the rings as possible, and never over the first one.**
 *      A preference, not a rule — nine pixels of overlap with a small chip
 *      beats a box with a scrollbar in it, and on a board cut in half by a
 *      full-width strip there is often no clear band tall enough for a
 *      paragraph. When something must be covered, the rings are ranked: a
 *      step's `targets` are written most-important-first, so the first is the
 *      thing the step is ABOUT and the last is usually chrome being pointed at.
 *      Covering the least important is the one choice that never hides the
 *      lesson.
 *   3. **As near the middle as 1 and 2 allow**, pulled toward the rings. The
 *      aim is the midpoint between the centre of the screen and the centre of
 *      what is ringed, so the words sit between the reader's eye and the thing
 *      they are about.
 *
 * A one-pixel scan rather than a search through the clear bands, because the
 * band version could only answer "does it fit" — and when the answer was no it
 * crammed the card into whatever was widest and turned it into a scroller. The
 * scan scores every position it is allowed to take, so a clear one always wins
 * when it exists and the least-bad one wins when it does not.
 *
 * This replaced two rules that disagreed: a desktop one that put the card above
 * or below the ringed band, and a phone one that hunted for the largest gap.
 * The desktop rule guessed the card's height at 190px, was wrong by 20-40px the
 * moment the body text wrapped, and on a board whose hand starts at 439 of 910
 * it put the words squarely across the cards. The card is measured now rather
 * than guessed, and one rule covers both widths.
 */
function placeCard(card: HTMLElement, boxes: readonly DOMRect[]): void {
  const pad = 12;
  const viewH = window.innerHeight;

  /* Cleared before measuring: this runs again on the same element every time
     the board moves, and a max-height left over from a cramped position would
     survive into a roomy one and keep the scrollbar for the rest of the step. */
  card.style.maxHeight = '';
  card.style.overflowY = '';
  const height = card.offsetHeight;
  /* Nothing to place yet — the screen is built detached and appended after, so
     the first call measures zero. Left hidden rather than placed at a guess:
     the next frame calls back with a real height. */
  if (height === 0) return;

  const hand = document.querySelector('.hand');
  const handTop = hand === null ? viewH : hand.getBoundingClientRect().top;

  const top = pad;
  /* The floor. A hand pinned to the top of the screen is not a thing that
     happens, but a floor above the ceiling would place the card off-screen, so
     the guard is here rather than in a comment. */
  const bottom = handTop - pad - top >= 120 ? handTop - pad : viewH - pad;

  const centre = viewH / 2;
  const aim =
    boxes.length === 0
      ? centre
      : (centre + boxes.reduce((sum, box) => sum + box.top + box.height / 2, 0) / boxes.length) / 2;

  /* Merged, because two rings that touch are one obstacle and treating them as
     two invents a clear gap of zero between them. A merged band keeps the
     HIGHEST weight of what went into it: if the thing the step is about is
     touching a piece of chrome, the pair has to be avoided as though it were
     all the important one. */
  const blocked = boxes
    .map((box, at) => ({
      top: box.top - pad,
      bottom: box.bottom + pad,
      /* First target, heaviest. This is what stops the card from covering the
         enemy it is currently telling you to read, on a board where the only
         other obstacle is the tray at the bottom — there is no clear band, so
         something gets covered, and it should be the tray. */
      weight: boxes.length - at,
    }))
    .sort((a, b) => a.top - b.top)
    .reduce<{ top: number; bottom: number; weight: number }[]>((merged, band) => {
      const last = merged[merged.length - 1];
      if (last !== undefined && band.top <= last.bottom) {
        last.bottom = Math.max(last.bottom, band.bottom);
        last.weight = Math.max(last.weight, band.weight);
        return merged;
      }
      return [...merged, { ...band }];
    }, []);

  const highest = Math.max(top, bottom - height);
  let best = top;
  let bestScore = Infinity;
  for (let at = top; at <= highest; at += 1) {
    /* Overlap dominates the score outright — a thousand to one — so distance
       from the aim only ever breaks a tie between equally clear positions. */
    const over = blocked.reduce(
      (sum, band) =>
        sum +
        Math.max(0, Math.min(at + height, band.bottom) - Math.max(at, band.top)) * band.weight,
      0,
    );
    const score = over * 1000 + Math.abs(at + height / 2 - aim);
    if (score < bestScore) {
      bestScore = score;
      best = at;
    }
  }

  card.style.top = `${Math.round(best)}px`;
  // Only when the room itself is shorter than the words.
  if (bottom - top < height) {
    card.style.maxHeight = `${Math.round(bottom - top)}px`;
    card.style.overflowY = 'auto';
  }
  /* The one place the card becomes visible. It is built hidden because placing
     it needs its own height, which nothing detached has — so it is appended,
     measured, placed, and only then shown. */
  card.style.visibility = '';
}
