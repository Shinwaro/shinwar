/* A card in hand.
 *
 * The stance rider is the single most important readability requirement in the
 * game: a player who cannot see at a glance which half of a card is live
 * cannot plan. So the rider is always rendered, always labelled with its
 * stance, and carries `is-live` or `is-dormant` — never hidden, never merged
 * into the base text.
 *
 * Rules text comes from `describeCard()`. Nothing here writes game text.
 */

import type { CardDef, CardInstance, GameState } from '../../engine/types.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { cardMark } from '../card-mark.ts';
import {
  describeCard,
  describeCardSegments,
  describeCost,
  describeRider,
  glossaryFor,
  riderIsLive,
} from '../../engine/combat/describe.ts';
import { STANCES } from '../../content/balance.ts';
import type { Child } from '../dom.ts';
import { el, onHoverOrFocus } from '../dom.ts';

/* ---------- the static face ----------
   Used wherever a card is shown but not played: reward screens, the Forge
   preview, the deck list. One implementation so a card cannot look like two
   different cards depending on which screen you meet it on. */

export interface CardFaceOptions {
  /** Passed through to `describeCard` so scaling reads against live state. */
  readonly state: GameState | null;
  /** A short label in the corner — the rarity, or `AFTER` on an upgrade preview. */
  readonly badge: string | null;
  /**
   * Another version of this card to diff against. Anything that reads
   * differently is marked, which is the whole point of an upgrade preview:
   * you should be able to see *what changed*, not re-read both cards.
   */
  readonly changedVs: CardDef | null;
  readonly extraClass: string | null;
}

export function renderCardFace(def: CardDef, options: CardFaceOptions): HTMLElement {
  const text = describeCard(def, options.state);
  const rider = describeRider(def, options.state);
  const live = riderIsLive(def, options.state);

  const other = options.changedVs;
  const textChanged = other !== null && describeCard(other, options.state) !== text;
  const riderChanged = other !== null && describeRider(other, options.state) !== rider;
  const costChanged = other !== null && other.cost !== def.cost;

  const classes = ['card', 'card--face', `card--${def.type}`];
  if (options.extraClass !== null) classes.push(options.extraClass);

  /* No kind-mark on a FACE, only in hand.
   *
   * It went on both, and on the face it broke the head: a face is 13.5rem and
   * its head already carries a cost, a name and a rarity badge, so a fourth
   * item left the name sixty pixels to say "Meet the Charge" in and it wrapped
   * to three lines — which made one card in a shelf of three seventy pixels
   * taller than the others. The hand has no badge and the room to spare, and
   * the reward screen already names the tier in words. */
  return el('div', { class: classes.join(' '), 'data-rarity': def.rarity }, [
    el('div', { class: 'card-head' }, [
      el('span', { class: `card-cost${costChanged ? ' is-changed' : ''}` }, [describeCost(def)]),
      el('span', { class: 'card-name' }, [def.name]),
      options.badge === null
        ? null
        : el('span', { class: `card-badge card-badge--${def.rarity}` }, [options.badge]),
    ]),
    el('p', { class: `card-text${textChanged ? ' is-changed' : ''}` }, [text]),
    rider === null || def.stanceRider === undefined
      ? null
      : el(
          'p',
          {
            class: `card-rider ${live ? 'is-live' : 'is-dormant'}${riderChanged ? ' is-changed' : ''}`,
            'data-stance': def.stanceRider.stance,
          },
          [
            el('span', { class: 'card-rider-label' }, [`${STANCES[def.stanceRider.stance].name}:`]),
            ' ',
            rider,
          ],
        ),
    /* The fine print: what the words on this card mean.
       Driven off the generated text, so it explains what is printed above it
       rather than reciting the rulebook. Below the flavour because it is
       reference, not voice -- you read it once and then stop seeing it. */
    (() => {
      const glossary = glossaryFor(def, options.state ?? undefined);
      if (glossary.length === 0) return null;
      return el(
        'dl',
        { class: 'card-glossary' },
        glossary.flatMap((entry) => [
          el('dt', { class: 'card-glossary-term' }, [entry.name]),
          el('dd', { class: 'card-glossary-text' }, [entry.text]),
        ]),
      );
    })(),
    def.flavor === undefined ? null : el('p', { class: 'card-flavor' }, [def.flavor]),
  ]);
}

export interface CardViewOptions {
  readonly index: number;
  readonly selected: boolean;
  readonly playable: boolean;
  readonly reason: string | null;
  readonly onSelect: () => void;
  readonly onHover: (hovering: boolean) => void;
}


/**
 * The card's text, with the two figures that move rendered as their own spans.
 *
 * The engine decides the numbers — `describeCardSegments` reads the same
 * `liveStance` the damage pipeline does — and this only decides what they look
 * like. A card that worked its own bonuses out would be a preview that can
 * disagree with the result, which is the one thing the damage pipeline exists
 * to make impossible.
 */
function cardTextNodes(def: CardDef, state: GameState | null): readonly Child[] {
  return describeCardSegments(def, state).flatMap((segment): Child[] => {
    if (segment.kind === 'text') return [segment.text];

    const { shown, hot, focus } = segment.figures;
    const nodes: Child[] = [
      el('span', { class: `card-dmg${hot > 0 ? ' is-hot' : ''}` }, [String(shown)]),
    ];
    if (focus > 0) nodes.push(el('span', { class: 'card-dmg-focus' }, [`+${focus}`]));
    return nodes;
  });
}

export function renderCard(
  state: GameState,
  card: CardInstance,
  options: CardViewOptions,
): HTMLElement {
  const def = definitionOf(card);
  const rider = describeRider(def, state);
  const live = riderIsLive(def, state);

  const classes = ['card', `card--${def.type}`];
  if (options.selected) classes.push('is-selected');
  if (!options.playable) classes.push('is-unplayable');

  /* What kind of card this is, as one glyph. Ten cards in a hand are ten
     paragraphs to read; the mark is there so the shape of the hand — three
     attacks, a Block, a Power — is legible before any of them are. */
  const mark = cardMark(def);

  const body: HTMLElement[] = [
    el('div', { class: 'card-head' }, [
      el('span', { class: 'card-cost', 'aria-label': `${describeCost(def)} Energy` }, [describeCost(def)]),
      el('span', { class: 'card-name' }, [def.name]),
      el(
        'span',
        { class: `card-mark card-mark--${mark.family}`, title: mark.label, 'aria-hidden': 'true' },
        [mark.glyph],
      ),
      el('span', { class: 'visually-hidden' }, [mark.label]),
    ]),
    el('p', { class: 'card-text' }, cardTextNodes(def, state)),
  ];

  if (rider !== null && def.stanceRider !== undefined) {
    const stance = STANCES[def.stanceRider.stance];
    body.push(
      el('p', { class: `card-rider ${live ? 'is-live' : 'is-dormant'}`, 'data-stance': def.stanceRider.stance }, [
        el('span', { class: 'card-rider-label' }, [`${stance.name}:`]),
        ' ',
        rider,
        live ? null : el('span', { class: 'visually-hidden' }, [' (not active in your current stance)']),
      ]),
    );
  }

  /* The fine print, in hand as well as on the reward screens. Mid-fight is
     exactly when "what does Burn mean" gets asked, and a glossary you have to
     leave the fight to read is not answering it. */
  const glossary = glossaryFor(def, state);
  if (glossary.length > 0) {
    body.push(
      el(
        'dl',
        { class: 'card-glossary' },
        glossary.flatMap((entry) => [
          el('dt', { class: 'card-glossary-term' }, [entry.name]),
          el('dd', { class: 'card-glossary-text' }, [entry.text]),
        ]),
      ),
    );
  }

  /* No flavour on a card in hand.
   *
   * It is the game's voice and it stays on every screen where you are READING
   * cards — the reward shelf, the Station, the deck list, the peek. In hand it
   * is two lines of prose under the one paragraph that decides your turn, on
   * the screen where you have the least room and the least patience, and the
   * eye has to skip it every single time. Kept where there is time for it. */

  const node = el(
    'button',
    {
      type: 'button',
      class: classes.join(' '),
      'data-uid': card.uid,
      // Which card this is, as opposed to which copy. The introduction points
      // at "the Block card" and needs something to aim at.
      'data-card': def.id,
      // The tier, on the same ladder as the inventory and the reward screens.
      // A card in hand is the same object as a card on a shelf and should say
      // its tier in the same way.
      'data-rarity': def.rarity,
      'aria-pressed': options.selected ? 'true' : 'false',
      'aria-keyshortcuts': options.index < 9 ? String(options.index + 1) : null,
      title: options.playable ? null : (options.reason ?? null),
    },
    body,
  );

  node.addEventListener('click', options.onSelect);
  /*
   * Hovering re-renders the hand, which destroys this very element — and the
   * removal fires `pointerleave` on the way out. Unguarded, that leave clears
   * the hover, which re-renders again, which puts a fresh card under the
   * cursor, which fires `pointerenter`, and around it goes: the highlight
   * strobes and clicks land on nothing because the node is replaced between
   * mousedown and mouseup.
   *
   * A leave that arrives because the node was removed is not the pointer
   * leaving. `isConnected` is the difference, and it is the whole fix.
   */
  /* Mouse only, and this is the bug that made the game unplayable on a phone:
     a touch pointer raises `pointerenter` on finger-DOWN, the hover preview
     re-renders the hand, this node is destroyed, and the finger lifts on
     nothing — so no `click` is ever dispatched and every tap on a card did
     nothing at all. It also reset the row's scroll on every touch, which is
     why swiping the hand "worked half the time". See `onHoverOrFocus`. */
  onHoverOrFocus(node, options.onHover);

  return node;
}
