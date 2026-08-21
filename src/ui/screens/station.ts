/* The Station.
 *
 * One Alloy pool, three things to spend it on: cards, a Mastery, a removal,
 * and patching the ronin up. That shared scarcity
 * is what makes the dual progression generate decisions instead of just
 * doubling the reward stream — the card you want and the module you want cost
 * the same money.
 *
 * The stock is rolled once on arrival and lives in state. Nothing here decides
 * what is on the shelves or what it costs; the screen reads and dispatches.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { RARITY_LABEL } from '../../content/balance.ts';
import { requireRun } from '../../engine/state.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { describeCard, describeCost } from '../../engine/combat/describe.ts';
import {
  cards as cardTable,
  implants as implantTable,
  masteries as masteryTable,
} from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { repairOffer } from '../../engine/run/run.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderCardFace } from '../components/card.ts';
import { renderManifest } from '../components/manifest.ts';
import { describeImplant, implantStackLabel } from '../../engine/run/describe.ts';

interface Local {
  /**
   * Which card picker is open, if any. UI state — it changes nothing about the
   * world, so it never goes near the reducer.
   */
  picking: 'strip' | 'forge' | null;
  chosen: string | null;
}

export function renderStation(store: Store): HTMLElement {
  const local: Local = { picking: null, chosen: null };
  let host: HTMLElement | null = null;

  const redraw = (): void => {
    const rebuilt = build(store, store.getState(), local, redraw);
    if (rebuilt !== null) host?.replaceChildren(rebuilt);
  };

  host = liveScreen(store, 'station screen', (state) => {
    if (state.run === null || state.run.screen !== 'station') return null;
    return build(store, state, local, redraw);
  });
  return host;
}

function build(store: Store, state: GameState, local: Local, redraw: () => void): HTMLElement | null {
  if (state.run === null || state.run.screen !== 'station') return null;
  const run = requireRun(state);
  const shop = run.shop;

  if (local.picking !== null && shop !== null) return buildPicker(store, state, local, redraw);

  const bodyMissing = run.pilot.maxHealth - run.pilot.health;
  // Computed by the engine, never here — the button and the result read the
  // same function or they can disagree, which is the fastest way to feel cheated.
  const repair = repairOffer(run);

  return el('div', { class: 'station-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Station']),
    el('p', { class: 'safe-note' }, [
      'One pool of Alloy, both paths. Whatever you leave here, you leave here.',
    ]),
    renderManifest(state),

    shop === null || shop.cards.length === 0
      ? null
      : el('section', { class: 'shop-section' }, [
          el('h2', { class: 'shop-heading' }, ['Cards']),
          el(
            'div',
            { class: 'shop-shelf' },
            shop.cards.map((stock) => {
              const def = cardTable.find(stock.cardId);
              if (def === undefined) return null;
              const broke = run.alloy < stock.price;

              return el('div', { class: `shop-lot${stock.sold ? ' is-sold' : ''}` }, [
                renderCardFace(def, {
                  state,
                  badge: RARITY_LABEL[def.rarity],
                  changedVs: null,
                  extraClass: null,
                }),
                stock.sold
                  ? el('span', { class: 'shop-sold' }, ['Bought'])
                  : button(
                      `${stock.price} Alloy`,
                      { class: `btn btn-buy${broke ? ' is-disabled' : ''}`, disabled: broke },
                      () => store.dispatch({ kind: 'buyShopCard', cardId: stock.cardId }),
                    ),
              ]);
            }),
          ),
        ]),

    /* The implant shelf. Deliberately above the cards: this is what Alloy is
       for now, and a player scanning the shop should meet the thing that
       changes every turn before the thing that changes one turn in five. */
    shop === null || shop.implants.length === 0
      ? null
      : el('section', { class: 'shop-section' }, [
          el('h2', { class: 'shop-heading' }, ['Implants']),
          el(
            'div',
            { class: 'shop-shelf' },
            shop.implants.map((stock) => {
              const def = implantTable.find(stock.implantId);
              if (def === undefined) return null;
              const broke = run.alloy < stock.price;
              const held = implantStackLabel(def, run.pilot.implants);

              return el('div', { class: `shop-lot${stock.sold ? ' is-sold' : ''}` }, [
                el('div', { class: 'implant-card' }, [
                  el('div', { class: 'card-head' }, [
                    el('span', { class: 'card-name' }, [def.name]),
                    el('span', { class: `card-badge card-badge--${def.rarity}` }, [
                      RARITY_LABEL[def.rarity],
                    ]),
                  ]),
                  // Generated, never hand-written: this is a permanent purchase
                  // being compared against two others, so the line has to be
                  // exactly what it will do.
                  el('p', { class: 'card-text' }, [describeImplant(def)]),
                  held === '' ? null : el('p', { class: 'implant-held' }, [held]),
                  def.flavor === undefined ? null : el('p', { class: 'card-flavor' }, [def.flavor]),
                ]),
                stock.sold
                  ? el('span', { class: 'shop-sold' }, ['Fitted'])
                  : button(
                      `${stock.price} Alloy`,
                      { class: `btn btn-buy${broke ? ' is-disabled' : ''}`, disabled: broke },
                      () => store.dispatch({ kind: 'buyImplant', implantId: stock.implantId }),
                    ),
              ]);
            }),
          ),
        ]),

    shop === null || shop.masteryId === null
      ? null
      : (() => {
          const def = masteryTable.find(shop.masteryId);
          if (def === undefined) return null;
          const broke = run.alloy < shop.masteryPrice;
          return el('section', { class: 'shop-section' }, [
            el('h2', { class: 'shop-heading' }, ['Stance Mastery']),
            el('div', { class: `shop-lot shop-lot--wide${shop.masterySold ? ' is-sold' : ''}` }, [
              el('div', { class: `mastery-drop mastery-drop--${def.stance}` }, [
                el('span', { class: 'mastery-kicker' }, ['Rewrites a stance, permanently']),
                el('span', { class: 'mastery-name' }, [def.name]),
                el('span', { class: 'mastery-text' }, [def.text]),
              ]),
              shop.masterySold
                ? el('span', { class: 'shop-sold' }, ['Bought'])
                : button(
                    `${shop.masteryPrice} Alloy`,
                    { class: `btn btn-buy${broke ? ' is-disabled' : ''}`, disabled: broke },
                    () => store.dispatch({ kind: 'buyMastery', masteryId: shop.masteryId ?? '' }),
                  ),
            ]),
          ]);
        })(),

    el('section', { class: 'shop-section' }, [
      el('h2', { class: 'shop-heading' }, ['Services']),
      el('div', { class: 'safe-options' }, [
        shop === null
          ? null
          : serviceOption(
              shop.removalUsed ? 'Removal taken' : 'Strip a card',
              `${shop.removalPrice} Alloy, one per Station.`,
              shop.removalUsed
                ? 'This station has done its one.'
                : run.alloy < shop.removalPrice
                  ? 'Not enough Alloy.'
                  : 'A smaller deck draws what it needs more often.',
              shop.removalUsed || run.alloy < shop.removalPrice || run.pilot.deck.length <= 1,
              () => {
                local.picking = 'strip';
                local.chosen = null;
                redraw();
              },
            ),
        shop === null
          ? null
          : serviceOption(
              shop.forgeUsed ? 'Forge used' : 'Forge a card',
              `${shop.forgePrice} Alloy, one per Station.`,
              shop.forgeUsed
                ? 'This station has done its one.'
                : run.alloy < shop.forgePrice
                  ? 'Not enough Alloy.'
                  : 'A better card beats another card.',
              shop.forgeUsed ||
                run.alloy < shop.forgePrice ||
                run.pilot.deck.every((card) => card.upgraded),
              () => {
                local.picking = 'forge';
                local.chosen = null;
                redraw();
              },
            ),
        shop === null
          ? null
          : serviceOption(
              shop.repairUsed ? 'Patched up' : 'Patch up',
              `${repair.rate} Alloy a point, one per Station.`,
              shop.repairUsed
                ? 'This station has done its one.'
                : bodyMissing === 0
                  ? 'Nothing to repair.'
                  : repair.affordable
                    ? `All ${repair.healed} back, for ${repair.price}.`
                    : `${repair.healed} back would cost ${repair.price}. You have ${run.alloy}.`,
              shop.repairUsed || !repair.affordable,
              () => store.dispatch({ kind: 'stationRepair' }),
            ),
      ]),
    ]),

    button('Leave', { class: 'btn btn-primary' }, () => store.dispatch({ kind: 'leaveNode' })),
  ]);
}

function serviceOption(
  title: string,
  effect: string,
  hint: string,
  disabled: boolean,
  onPick: () => void,
): HTMLElement {
  const node = button('', { class: `safe-option${disabled ? ' is-disabled' : ''}`, disabled }, onPick);
  node.replaceChildren(
    el('span', { class: 'safe-option-title' }, [title]),
    el('span', { class: 'safe-option-effect' }, [effect]),
    el('span', { class: 'safe-option-hint' }, [hint]),
  );
  return node;
}

/* ---------- the removal picker ----------
   Two-step, like the Safe Planet's Forge and Strip: pick, see what you are
   about to do, then commit. Never hover-only — that is no preview at all on a
   phone. */

function buildPicker(store: Store, state: GameState, local: Local, redraw: () => void): HTMLElement {
  const run = requireRun(state);
  const forging = local.picking === 'forge';
  const price = (forging ? run.shop?.forgePrice : run.shop?.removalPrice) ?? 0;
  const chosen = run.pilot.deck.find((card) => card.uid === local.chosen) ?? null;
  // Forging an already-forged card does nothing, so it is not offered.
  const eligible = forging ? run.pilot.deck.filter((card) => !card.upgraded) : run.pilot.deck;

  return el('div', { class: 'station-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, [forging ? 'Forge a card' : 'Strip a card']),
    el('p', { class: 'safe-note' }, [
      forging
        ? `${price} Alloy. One per Station — a deck that gets better beats a deck that gets bigger.`
        : `${price} Alloy. The price rises every time you do this, so the deck cannot be filed down to four cards.`,
    ]),
    el('div', { class: 'picker-actions' }, [
      button('Back', { class: 'btn' }, () => {
        local.picking = null;
        local.chosen = null;
        redraw();
      }),
      chosen === null
        ? null
        : button(
            `${forging ? 'Forge' : 'Strip'} ${definitionOf(chosen).name}`,
            { class: 'btn btn-primary' },
            () => {
              const uid = chosen.uid;
              const mode = local.picking;
              local.picking = null;
              local.chosen = null;
              store.dispatch(
                mode === 'forge'
                  ? { kind: 'buyForge', cardUid: uid }
                  : { kind: 'buyRemoval', cardUid: uid },
              );
            },
          ),
    ]),

    /*
     * What it becomes, next to what it is.
     *
     * Forging was a two-step that never showed the second step: you picked a
     * card, the button said "Forge Sever", and you found out what Sever+ did
     * after paying for it. `renderCardFace` already takes a `changedVs`, which
     * greys the parts that did not move — so the comparison is the card's own
     * generated text rather than a second description that could drift.
     */
    chosen === null || !forging
      ? null
      : el('div', { class: 'forge-preview' }, [
          el('div', { class: 'forge-side' }, [
            el('h2', { class: 'pause-heading' }, ['Now']),
            renderCardFace(definitionOf(chosen), {
              state,
              badge: null,
              changedVs: null,
              extraClass: null,
            }),
          ]),
          el('div', { class: 'forge-arrow', 'aria-hidden': 'true' }, ['→']),
          el('div', { class: 'forge-side' }, [
            el('h2', { class: 'pause-heading' }, ['Forged']),
            renderCardFace(definitionOf({ ...chosen, upgraded: true }), {
              state,
              badge: 'Forged',
              changedVs: definitionOf(chosen),
              extraClass: null,
            }),
          ]),
        ]),

    el(
      'div',
      { class: 'deck-list' },
      eligible.map((card) => {
        const def = definitionOf(card);
        const picked = local.chosen === card.uid;
        const node = button(
          '',
          {
            class: `card card--pick card--${def.type}${picked ? ' is-selected' : ''}`,
            'data-rarity': def.rarity,
            'aria-pressed': picked ? 'true' : 'false',
          },
          () => {
            local.chosen = picked ? null : card.uid;
            redraw();
          },
        );
        node.replaceChildren(
          el('div', { class: 'card-head' }, [
            el('span', { class: 'card-cost' }, [describeCost(def)]),
            el('span', { class: 'card-name' }, [def.name]),
          ]),
          el('p', { class: 'card-text' }, [describeCard(def)]),
        );
        return node;
      }),
    ),
  ]);
}
