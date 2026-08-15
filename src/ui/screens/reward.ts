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
import { describeCard } from '../../engine/combat/describe.ts';
import { cards as cardTable } from '../../content/registry.ts';
import { RARITY_LABEL } from '../../content/balance.ts';
import { button, el, fill } from '../dom.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderCardFace } from '../components/card.ts';

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

    const node = button(
      '',
      {
        class: `card-pick${taken ? ' is-selected' : ''}${alreadyTook && !taken ? ' is-passed' : ''}`,
        'data-rarity': def.rarity,
        disabled: alreadyTook,
        'aria-label': `${RARITY_LABEL[def.rarity]}: ${def.name}, ${describeCard(def)}`,
      },
      () => store.dispatch({ kind: 'takeRewardCard', cardId }),
    );

    fill(node, [
      renderCardFace(def, {
        state,
        badge: RARITY_LABEL[def.rarity],
        changedVs: null,
        extraClass: null,
      }),
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
