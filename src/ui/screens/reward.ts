/* The reward screen.
 *
 * Three card choices and Skip. Skip is always available and always real — a
 * reward you must take is not a decision, and a card you did not want is a
 * card diluting every draw for the rest of the run.
 *
 * The Alloy is claimed separately so taking the money and skipping the card is
 * a legitimate move rather than something the UI forces together.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { liveScreen } from '../screen.ts';
import { describeCard, describeCost, describeRider } from '../../engine/combat/describe.ts';
import { cards as cardTable } from '../../content/registry.ts';
import { STANCES } from '../../content/balance.ts';
import { button, el, fill } from '../dom.ts';
import { renderRunBar } from '../components/runbar.ts';

export function renderReward(store: Store): HTMLElement {
  return liveScreen(store, 'reward screen', (state) => {
    if (state.run === null || state.run.screen !== 'reward') return null;
    return buildReward(store, state);
  });
}

function buildReward(store: Store, state: GameState): HTMLElement {
  const run = requireRun(state);
  const offer = run.pendingReward;
  if (offer === null) return el('div', { class: 'reward-inner' }, ['Nothing on offer.']);

  const alreadyTook = offer.taken.length > 0;

  const cards = offer.cardIds.map((cardId) => {
    const def = cardTable.find(cardId);
    if (def === undefined) return null;
    const taken = offer.taken.includes(cardId);
    const rider = describeRider(def);

    const node = button(
      '',
      {
        class: `card card--${def.type} card--offer${taken ? ' is-selected' : ''}${alreadyTook && !taken ? ' is-unplayable' : ''}`,
        disabled: alreadyTook,
        'aria-label': `${def.name}, ${describeCard(def)}`,
      },
      () => store.dispatch({ kind: 'takeRewardCard', cardId }),
    );

    fill(node, [
      el('div', { class: 'card-head' }, [
        el('span', { class: 'card-cost' }, [describeCost(def)]),
        el('span', { class: 'card-name' }, [def.name]),
      ]),
      el('span', { class: `pip pip--${def.rarity}` }, [def.rarity]),
      el('p', { class: 'card-text' }, [describeCard(def)]),
      rider === null || def.stanceRider === undefined
        ? null
        : el('p', { class: 'card-rider is-dormant', 'data-stance': def.stanceRider.stance }, [
            el('span', { class: 'card-rider-label' }, [`${STANCES[def.stanceRider.stance].name}:`]),
            ' ',
            rider,
          ]),
      def.flavor === undefined ? null : el('p', { class: 'card-flavor' }, [def.flavor]),
    ]);
    return node;
  });

  const alloyRow = offer.alloyClaimed
    ? el('p', { class: 'reward-claimed' }, [`Alloy taken.`])
    : button(`Take ${offer.alloy} Alloy`, { class: 'btn' }, () => {
        store.dispatch({ kind: 'claimRewardAlloy' });
      });

  return el('div', { class: 'reward-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Salvage']),
    el('p', { class: 'reward-note' }, [
      offer.cardIds.length === 0
        ? 'Nothing worth taking here — the card pool fills out at M6.'
        : 'Take one card, or take none. A card you did not want dilutes every draw after it.',
    ]),
    alloyRow,
    el('div', { class: 'reward-cards' }, cards),
    el('div', { class: 'reward-actions' }, [
      button(alreadyTook ? 'Continue' : 'Skip the card', { class: 'btn btn-primary' }, () => {
        store.dispatch({ kind: 'claimRewardAlloy' });
        store.dispatch({ kind: 'leaveReward' });
      }),
    ]),
  ]);
}
