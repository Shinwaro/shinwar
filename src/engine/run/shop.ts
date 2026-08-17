/* The Station.
 *
 * One Alloy pool feeds everything, so the shop is where scarcity actually
 * generates decisions: the card you want, the Mastery you want and the removal
 * you should probably buy all cost the same money.
 *
 * Stock is rolled once on arrival and kept in state. A shop that re-rolls
 * between two renders is a shop the player cannot plan against, and planning
 * against it is the entire activity.
 *
 * Every Station stocks a card removal — build prompt §5, and the anti-bloat
 * valve has to be reliable or deck size stops being a real cost.
 */

import type { GameState, Rarity, ShopState } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { weightedPick } from '../rng.ts';
import { fireHook } from '../hooks.ts';
import { mintCard } from '../combat/instances.ts';
import { removalCost, spendAlloy } from './economy.ts';
import { offerableCards, rollMastery } from './rewards.ts';
import { MASTERY, RARITY_WEIGHTS, SHOP } from '../../content/balance.ts';
import { cards as cardTable, masteries as masteryTable } from '../../content/registry.ts';

export function cardPrice(rarity: Rarity): number {
  return rarity === 'basic' ? SHOP.cardPrice.common : SHOP.cardPrice[rarity];
}

/* ---------- stocking ---------- */

/**
 * Fill the shelves. Rolls on the `shop` stream, which is what that stream is
 * for — a shop restock must never move the map or the reward pools for a seed.
 */
export function stockShop(state: GameState, nodeId: string): GameState {
  const run = requireRun(state);
  // Already standing in this one. Do not re-roll under the player's cursor.
  if (run.shop !== null && run.shop.nodeId === nodeId) return state;

  const rarityWeights = RARITY_WEIGHTS[run.act];
  let rng = run.rng;

  const cardPool = offerableCards();
  const cards: { cardId: string; price: number; sold: boolean }[] = [];
  for (let slot = 0; slot < SHOP.cardSlots; slot++) {
    const candidates = cardPool.filter((def) => !cards.some((entry) => entry.cardId === def.id));
    if (candidates.length === 0) break;
    const rolled = weightedPick(
      rng,
      'shop',
      candidates.map((def) => ({ value: def.id, weight: rarityWeights[def.rarity as Exclude<Rarity, 'basic'>] })),
    );
    rng = rolled.rng;
    cards.push({ cardId: rolled.value, price: cardPrice(cardTable.get(rolled.value).rarity), sold: false });
  }

  // A Mastery, sometimes. Rolled here so the shelf is fixed on arrival like
  // everything else on it.
  const mastery = rollMastery(rng, run, 'shop');
  rng = mastery.rng;

  const shop: ShopState = {
    nodeId,
    cards,
    removalPrice: removalCost(run.removalsPurchased),
    removalUsed: false,
    masteryId: mastery.masteryId,
    masteryPrice: MASTERY.price,
    masterySold: false,
  };

  const next = withRun(state, (current) => ({ ...current, rng, shop }));
  return fireHook(next, 'onShopStocked', { nodeId });
}

/* ---------- buying ----------
   Each of these refuses by returning the SAME state object, not a fresh copy of
   identical data: the store skips notifying on reference equality, and a
   "nothing happened" that still re-renders is how a rejected purchase ends up
   flashing the whole screen. */

export function buyShopCard(state: GameState, cardId: string): GameState {
  const run = requireRun(state);
  const shop = run.shop;
  if (shop === null) return state;

  const stock = shop.cards.find((entry) => entry.cardId === cardId && !entry.sold);
  if (stock === undefined || run.alloy < stock.price) return state;

  const def = cardTable.get(cardId);
  const minted = mintCard(run.uidCounter, cardId, false);
  const paid = spendAlloy(state, stock.price, 'station');

  const next = withRun(paid, (current) => ({
    ...current,
    uidCounter: minted.uidCounter,
    pilot: { ...current.pilot, deck: [...current.pilot.deck, minted.value] },
    shop:
      current.shop === null
        ? null
        : {
            ...current.shop,
            cards: current.shop.cards.map((entry) =>
              entry.cardId === cardId ? { ...entry, sold: true } : entry,
            ),
          },
  }));

  return appendLog(next, {
    source: 'station',
    kind: 'run',
    text: `Bought ${def.name} for ${stock.price} Alloy.`,
    detail: { card: cardId, cost: stock.price },
  });
}

/** The one removal. Priced from `removalsPurchased`, so it rises across the run. */
export function buyRemoval(state: GameState, cardUid: string): GameState {
  const run = requireRun(state);
  const shop = run.shop;
  if (shop === null || shop.removalUsed) return state;
  if (run.alloy < shop.removalPrice || run.pilot.deck.length <= 1) return state;

  const card = run.pilot.deck.find((entry) => entry.uid === cardUid);
  if (card === undefined) return state;

  const name = cardTable.find(card.defId)?.name ?? card.defId;
  const paid = spendAlloy(state, shop.removalPrice, 'station');

  const next = withRun(paid, (current) => ({
    ...current,
    removalsPurchased: current.removalsPurchased + 1,
    pilot: { ...current.pilot, deck: current.pilot.deck.filter((entry) => entry.uid !== cardUid) },
    shop: current.shop === null ? null : { ...current.shop, removalUsed: true },
  }));

  return appendLog(next, {
    source: 'station',
    kind: 'run',
    text: `Stripped ${name} for ${shop.removalPrice} Alloy.`,
    detail: { card: card.defId, cost: shop.removalPrice },
  });
}

/**
 * Buy the Mastery on the shelf.
 *
 * It rewrites a stance for the rest of the run, so it is the most expensive
 * thing a Station sells and it competes directly with the card, the module and
 * the removal — which is the point of it being a purchase rather than a drop.
 */
export function buyMastery(state: GameState, masteryId: string): GameState {
  const run = requireRun(state);
  const shop = run.shop;
  if (shop === null || shop.masterySold || shop.masteryId !== masteryId) return state;
  if (run.alloy < shop.masteryPrice) return state;
  if (run.pilot.masteries.includes(masteryId)) return state;

  const def = masteryTable.find(masteryId);
  if (def === undefined) return state;

  const paid = spendAlloy(state, shop.masteryPrice, 'station');
  const next = withRun(paid, (current) => ({
    ...current,
    pilot: { ...current.pilot, masteries: [...current.pilot.masteries, masteryId] },
    shop: current.shop === null ? null : { ...current.shop, masterySold: true },
  }));

  return appendLog(next, {
    source: 'station',
    kind: 'run',
    text: `${def.name} for ${shop.masteryPrice} Alloy. ${def.text}`,
    detail: { mastery: masteryId, cost: shop.masteryPrice },
  });
}
