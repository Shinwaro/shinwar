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

import type { CardInstance, GameState } from '../../engine/types.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { describeCard, describeCost, describeRider, riderIsLive } from '../../engine/combat/describe.ts';
import { STANCES } from '../../content/balance.ts';
import { el } from '../dom.ts';

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
