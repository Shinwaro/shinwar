/* Naming a thing the player has never seen, and letting them look at it.
 *
 * An Anomaly that offers "Gain Dead Reckoning" or "Thread: Marked" is naming
 * something and then not showing it — and it is asking for a decision about
 * that thing in the same breath. The name has to stay inside the sentence,
 * because a list of definitions beside the option breaks the reading, so the
 * name itself becomes the handle.
 *
 * **Hover is never the only route.** It is a real `<button>`, so it opens on
 * focus and on click as well, and the panel is `aria-describedby` rather than a
 * `title` — a native tooltip cannot be reached by keyboard, cannot be styled to
 * hold a card face, and on a phone does not exist at all. Same rule the combat
 * screen already follows for enemy previews.
 *
 * The panel renders the real thing rather than a description of it: the card
 * face is `renderCardFace`, the same component the hand uses, so a card you
 * peek at in an Anomaly looks exactly like the card you will be holding. A
 * Thread shows what it IS and not what it pays — the omen is the game's
 * promise that something is coming, and spoiling the payoff would turn a
 * decision under uncertainty into arithmetic.
 */

import type { GameState, OutcomeLine, RunSegment } from '../../engine/types.ts';
import { cards as cardTable, threads as threadTable } from '../../content/registry.ts';
import { el } from '../dom.ts';
import { renderCardFace } from './card.ts';

let seq = 0;

/** A name you can look at, with its panel attached. */
function peek(label: string, panel: HTMLElement, kind: 'card' | 'thread'): HTMLElement {
  seq += 1;
  const id = `peek-${seq}`;
  panel.id = id;

  const host = el('span', { class: `peek peek--${kind}` }, [
    el(
      'button',
      { type: 'button', class: 'peek-name', 'aria-describedby': id, 'aria-expanded': 'false' },
      [label],
    ),
    panel,
  ]);

  /* Click toggles a class rather than relying on `:hover` alone, so the panel
     is reachable on a touch screen and by anyone driving with the keyboard.
     CSS opens it on hover and focus-within as well. */
  const button = host.querySelector('.peek-name');
  button?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = host.classList.toggle('is-open');
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  return host;
}

function cardPeek(cardId: string, label: string, state: GameState | null): HTMLElement {
  const def = cardTable.find(cardId);
  if (def === undefined) return el('span', {}, [label]);

  return peek(
    label,
    el('span', { class: 'peek-panel', role: 'tooltip' }, [
      renderCardFace(def, { state, badge: null, changedVs: null, extraClass: null }),
    ]),
    'card',
  );
}

function threadPeek(threadId: string, label: string): HTMLElement {
  const def = threadTable.find(threadId);
  if (def === undefined) return el('span', {}, [label]);

  return peek(
    label,
    el('span', { class: 'peek-panel peek-panel--thread', role: 'tooltip' }, [
      el('span', { class: 'peek-title' }, [def.name]),
      el('span', { class: 'peek-desc' }, [def.description]),
      /* The omen, not the payoff. A Thread is a promise that something is
         coming; printing what it pays would turn the decision into arithmetic
         and take the whole mechanic with it. */
      el('span', { class: 'peek-omen' }, [def.omen]),
    ]),
    'thread',
  );
}

/**
 * One line of an Anomaly's outcome, with whatever it named made inspectable.
 *
 * The reference travels on the line rather than being parsed back out of the
 * text: the sentence is prose written for a person, and matching a card name
 * against it would be a parser that breaks the first time a card is called
 * something that appears in another word.
 */
export function renderOutcomeLine(line: OutcomeLine, state: GameState | null): readonly Node[] {
  if (line.cardId !== undefined) {
    const def = cardTable.find(line.cardId);
    if (def !== undefined) return splitAround(line.text, def.name, cardPeek(line.cardId, def.name, state));
  }
  if (line.threadId !== undefined) {
    const def = threadTable.find(line.threadId);
    if (def !== undefined) return splitAround(line.text, def.name, threadPeek(line.threadId, def.name));
  }
  return [document.createTextNode(line.text)];
}

/**
 * Put the handle where the name already is, and leave the rest as prose.
 *
 * The line was written as a sentence — "Sever leaves the deck" — so the name
 * has a place in it already and moving it would read worse. Falls back to the
 * plain sentence if the name is not in it, which keeps a rewording of a line
 * from silently producing a duplicate name.
 */
function splitAround(text: string, name: string, handle: HTMLElement): readonly Node[] {
  const at = text.indexOf(name);
  if (at === -1) return [document.createTextNode(text)];
  return [
    document.createTextNode(text.slice(0, at)),
    handle,
    document.createTextNode(text.slice(at + name.length)),
  ];
}

/** Render a generated run-effect line with its named things made inspectable. */
export function renderRunSegments(
  segments: readonly RunSegment[],
  state: GameState | null,
): readonly Node[] {
  return segments.map((segment) => {
    if (segment.kind === 'card') return cardPeek(segment.cardId, segment.text, state);
    if (segment.kind === 'thread') return threadPeek(segment.threadId, segment.text);
    return document.createTextNode(segment.text);
  });
}
