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
import { describeCard, describeCost, describeRider, riderIsLive } from '../../engine/combat/describe.ts';
import { STANCES } from '../../content/balance.ts';
import { el } from '../dom.ts';

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

  const body: HTMLElement[] = [
    el('div', { class: 'card-head' }, [
      el('span', { class: 'card-cost', 'aria-label': `${describeCost(def)} Energy` }, [describeCost(def)]),
      el('span', { class: 'card-name' }, [def.name]),
    ]),
    el('p', { class: 'card-text' }, [describeCard(def, state)]),
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

  if (def.flavor !== undefined) {
    body.push(el('p', { class: 'card-flavor' }, [def.flavor]));
  }

  const node = el(
    'button',
    {
      type: 'button',
      class: classes.join(' '),
      'data-uid': card.uid,
      'aria-pressed': options.selected ? 'true' : 'false',
      'aria-keyshortcuts': options.index < 9 ? String(options.index + 1) : null,
      title: options.playable ? null : (options.reason ?? null),
    },
    body,
  );

  node.addEventListener('click', options.onSelect);
  node.addEventListener('pointerenter', () => options.onHover(true));
  node.addEventListener('pointerleave', () => options.onHover(false));
  node.addEventListener('focus', () => options.onHover(true));
  node.addEventListener('blur', () => options.onHover(false));

  return node;
}
