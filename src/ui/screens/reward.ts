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
import {
  cards as cardTable,
  relics as relicTable,
} from '../../content/registry.ts';
import { RARITY_LABEL } from '../../content/balance.ts';
import { button, el, fill, withChildren } from '../dom.ts';
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

    // Every card stays clickable: picking a different one swaps the choice,
    // and clicking the chosen one again puts it back.
    const node = button(
      '',
      {
        class: `card-pick${taken ? ' is-selected' : ''}${alreadyTook && !taken ? ' is-passed' : ''}`,
        'data-rarity': def.rarity,
        'aria-pressed': taken ? 'true' : 'false',
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

  // Alloy is already in the pocket by the time this screen opens.
  const alloyRow = el('p', { class: 'reward-claimed' }, [`+${offer.alloy} Alloy salvaged.`]);

  return el('div', { class: 'reward-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Salvage']),
    el('p', { class: 'reward-note' }, [
      offer.cardIds.length === 0
        ? 'Nothing worth taking here — the card pool fills out at M6.'
        : 'Take one card, or take none. A card you did not want dilutes every draw after it.',
    ]),
    alloyRow,
    // Three relics at an act finale, and you take one. A boss should hand you
    // a decision about what the rest of the run is, not a thing that happened
    // to you — which is what a granted Stance Mastery was.
    offer.relicIds.length === 0
      ? null
      : el('div', { class: 'reward-relics' }, [
          el('h2', { class: 'pause-heading' }, ['Take one relic']),
          el(
            'div',
            { class: 'relic-row' },
            offer.relicIds.map((relicId) => {
              const def = relicTable.find(relicId);
              if (def === undefined) return null;
              const taken = offer.takenRelic === relicId;
              const node = button(
                '',
                {
                  class: `relic-card${taken ? ' is-selected' : ''}`,
                  'data-rarity': def.rarity,
                  'aria-pressed': taken ? 'true' : 'false',
                },
                () => store.dispatch({ kind: 'takeRewardRelic', relicId }),
              );
              return withChildren(node, [
                el('div', { class: 'card-head' }, [
                  el('span', { class: 'card-name' }, [def.name]),
                  el('span', { class: `card-badge card-badge--${def.rarity}` }, [
                    RARITY_LABEL[def.rarity],
                  ]),
                ]),
                el('p', { class: 'card-text' }, [def.text]),
                def.flavor === undefined ? null : el('p', { class: 'card-flavor' }, [def.flavor]),
              ]);
            }),
          ),
        ]),
    offer.relicIds.length === 0
      ? null
      : el('div', { class: 'reward-relics' }, [
          el('h2', { class: 'pause-heading' }, ['Take one relic']),
          el(
            'div',
            { class: 'relic-row' },
            offer.relicIds.map((relicId) => {
              const def = relicTable.find(relicId);
              if (def === undefined) return null;
              const taken = offer.takenRelic === relicId;
              const node = button(
                '',
                {
                  class: `relic-card${taken ? ' is-selected' : ''}`,
                  'data-rarity': def.rarity,
                  'aria-pressed': taken ? 'true' : 'false',
                },
                () => store.dispatch({ kind: 'takeRewardRelic', relicId }),
              );
              return withChildren(node, [
                el('div', { class: 'card-head' }, [
                  el('span', { class: 'card-name' }, [def.name]),
                  el('span', { class: `card-badge card-badge--${def.rarity}` }, [
                    RARITY_LABEL[def.rarity],
                  ]),
                ]),
                el('p', { class: 'card-text' }, [def.text]),
                def.flavor === undefined ? null : el('p', { class: 'card-flavor' }, [def.flavor]),
              ]);
            }),
          ),
        ]),
    el('div', { class: 'reward-cards' }, cards),
    el('div', { class: 'reward-actions' }, [
      button(alreadyTook ? 'Continue' : 'Take nothing', { class: 'btn btn-primary' }, () => {
        store.dispatch({ kind: 'leaveReward' });
      }),
    ]),
  ]);
}
