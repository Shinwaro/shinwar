/* The Station.
 *
 * One Alloy pool, four things to spend it on: cards for the pilot, modules for
 * the ship, a removal, and repairs to either body or hull. That shared scarcity
 * is what makes the dual progression generate decisions instead of just
 * doubling the reward stream — the card you want and the module you want cost
 * the same money.
 *
 * The stock is rolled once on arrival and lives in state. Nothing here decides
 * what is on the shelves or what it costs; the screen reads and dispatches.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { describeCard, describeCost } from '../../engine/combat/describe.ts';
import { ECONOMY, RARITY_LABEL, SHIP } from '../../content/balance.ts';
import {
  cards as cardTable,
  masteries as masteryTable,
  modules as moduleTable,
} from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderCardFace } from '../components/card.ts';
import { renderManifest } from '../components/manifest.ts';
import { moduleLines } from '../components/moduletip.ts';
import { canGrowGrid } from '../../engine/run/shop.ts';

interface Local {
  /** The removal picker is open. UI state — it changes nothing about the world. */
  stripping: boolean;
  chosen: string | null;
}

export function renderStation(store: Store): HTMLElement {
  const local: Local = { stripping: false, chosen: null };
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

  if (local.stripping && shop !== null) return buildStripper(store, state, local, redraw);

  const bodyMissing = run.pilot.maxHealth - run.pilot.health;
  const bodyAffordable = Math.min(bodyMissing, Math.floor(run.alloy / ECONOMY.hullRepairPerPoint));
  const hullMissing = run.ship.maxHull - run.ship.hull;
  const hullAffordable = Math.min(hullMissing, Math.floor(run.alloy / ECONOMY.shipRepairPerPoint));

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

    shop === null || shop.modules.length === 0
      ? null
      : el('section', { class: 'shop-section' }, [
          el('h2', { class: 'shop-heading' }, ['Modules']),
          el(
            'div',
            { class: 'shop-shelf shop-shelf--modules' },
            shop.modules.map((stock) => {
              const def = moduleTable.find(stock.moduleId);
              if (def === undefined) return null;
              const broke = run.alloy < stock.price;

              return el('div', { class: `shop-lot${stock.sold ? ' is-sold' : ''}` }, [
                el('div', { class: `shop-module shop-module--${def.kind}` }, [
                  el('div', { class: 'card-head' }, [
                    el('span', { class: 'card-cost' }, [`${def.footprint.w}x${def.footprint.h}`]),
                    el('span', { class: 'card-name' }, [def.name]),
                    el('span', { class: `card-badge card-badge--${def.rarity}` }, [
                      RARITY_LABEL[def.rarity],
                    ]),
                  ]),
                  ...moduleLines(stock.moduleId, run.ship).map((line) =>
                    el('p', { class: 'card-text' }, [line]),
                  ),
                  def.flavor === undefined ? null : el('p', { class: 'card-flavor' }, [def.flavor]),
                ]),
                stock.sold
                  ? el('span', { class: 'shop-sold' }, ['Bought'])
                  : button(
                      `${stock.price} Alloy`,
                      { class: `btn btn-buy${broke ? ' is-disabled' : ''}`, disabled: broke },
                      () => store.dispatch({ kind: 'buyShopModule', moduleId: stock.moduleId }),
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
        shop === null || !canGrowGrid(state)
          ? null
          : serviceOption(
              shop.gridSold ? 'Bay extended' : 'Extend the bay',
              `${shop.gridPrice} Alloy for another ${run.ship.gridW < SHIP.targetEndGrid.w ? 'column' : 'row'}.`,
              shop.gridSold
                ? 'This yard has done its one.'
                : run.alloy < shop.gridPrice
                  ? 'Not enough Alloy.'
                  : `The grid is ${run.ship.gridW}x${run.ship.gridH}. Bigger shapes need bigger bays.`,
              shop.gridSold || run.alloy < shop.gridPrice,
              () => store.dispatch({ kind: 'buyGrid' }),
            ),
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
                local.stripping = true;
                local.chosen = null;
                redraw();
              },
            ),
        serviceOption(
          'Patch up',
          bodyAffordable === 0
            ? bodyMissing === 0
              ? 'Nothing to repair.'
              : 'Not enough Alloy.'
            : `Recover ${bodyAffordable} health for ${bodyAffordable * ECONOMY.hullRepairPerPoint} Alloy.`,
          `You are down ${bodyMissing}.`,
          bodyAffordable === 0,
          () => store.dispatch({ kind: 'stationRepair', amount: bodyAffordable }),
        ),
        serviceOption(
          'Weld the cutter',
          hullAffordable === 0
            ? hullMissing === 0
              ? 'The hull is sound.'
              : 'Not enough Alloy.'
            : `Repair ${hullAffordable} hull for ${hullAffordable * ECONOMY.shipRepairPerPoint} Alloy.`,
          `The cutter is down ${hullMissing}.`,
          hullAffordable === 0,
          () => store.dispatch({ kind: 'repairShip', amount: hullAffordable }),
        ),
        run.crash === null
          ? null
          : serviceOption(
              'Repair the drive',
              `${run.crash.repairCost} Alloy to fly again.`,
              run.alloy < run.crash.repairCost ? 'Not enough Alloy yet.' : 'Space nodes reopen.',
              run.alloy < run.crash.repairCost,
              () => store.dispatch({ kind: 'repairDrive' }),
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

function buildStripper(store: Store, state: GameState, local: Local, redraw: () => void): HTMLElement {
  const run = requireRun(state);
  const price = run.shop?.removalPrice ?? 0;
  const chosen = run.pilot.deck.find((card) => card.uid === local.chosen) ?? null;

  return el('div', { class: 'station-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Strip a card']),
    el('p', { class: 'safe-note' }, [
      `${price} Alloy. The price rises every time you do this, so the deck cannot be filed down to four cards.`,
    ]),
    el('div', { class: 'picker-actions' }, [
      button('Back', { class: 'btn' }, () => {
        local.stripping = false;
        local.chosen = null;
        redraw();
      }),
      chosen === null
        ? null
        : button(`Strip ${definitionOf(chosen).name}`, { class: 'btn btn-primary' }, () => {
            const uid = chosen.uid;
            local.stripping = false;
            local.chosen = null;
            store.dispatch({ kind: 'buyRemoval', cardUid: uid });
          }),
    ]),
    el(
      'div',
      { class: 'deck-list' },
      run.pilot.deck.map((card) => {
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
