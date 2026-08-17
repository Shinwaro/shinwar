/* The Station.
 *
 * One Alloy pool feeds both progression paths, so the shop is where the dual
 * structure actually generates decisions instead of just doubling the reward
 * stream: the card you want and the module you want cost the same money, and
 * the removal you should probably buy costs it too.
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
import { offerableCards } from './rewards.ts';
import { ECONOMY, RARITY_WEIGHTS, SHOP } from '../../content/balance.ts';
import { cards as cardTable, modules as moduleTable } from '../../content/registry.ts';

export function cardPrice(rarity: Rarity): number {
  return rarity === 'basic' ? SHOP.cardPrice.common : SHOP.cardPrice[rarity];
}

export function modulePrice(rarity: Rarity): number {
  return rarity === 'basic' ? SHOP.modulePrice.common : SHOP.modulePrice[rarity];
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

  const owned = new Set([...run.ship.stored, ...run.ship.placed.map((entry) => entry.moduleId)]);
  const modulePool = moduleTable.all().filter((def) => def.rarity !== 'basic' && !owned.has(def.id));
  const modules: { moduleId: string; price: number; sold: boolean }[] = [];
  for (let slot = 0; slot < SHOP.moduleSlots; slot++) {
    const candidates = modulePool.filter((def) => !modules.some((entry) => entry.moduleId === def.id));
    if (candidates.length === 0) break;
    const rolled = weightedPick(
      rng,
      'shop',
      candidates.map((def) => ({ value: def.id, weight: rarityWeights[def.rarity as Exclude<Rarity, 'basic'>] })),
    );
    rng = rolled.rng;
    modules.push({
      moduleId: rolled.value,
      price: modulePrice(moduleTable.get(rolled.value).rarity),
      sold: false,
    });
  }

  const shop: ShopState = {
    nodeId,
    cards,
    modules,
    removalPrice: removalCost(run.removalsPurchased),
    removalUsed: false,
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

export function buyShopModule(state: GameState, moduleId: string): GameState {
  const run = requireRun(state);
  const shop = run.shop;
  if (shop === null) return state;

  const stock = shop.modules.find((entry) => entry.moduleId === moduleId && !entry.sold);
  if (stock === undefined || run.alloy < stock.price) return state;

  const def = moduleTable.get(moduleId);
  const paid = spendAlloy(state, stock.price, 'station');

  const next = withRun(paid, (current) => ({
    ...current,
    // Into storage, never straight onto the grid. Where it goes is a decision
    // in its own right, and it is made on the loadout screen.
    ship: { ...current.ship, stored: [...current.ship.stored, moduleId] },
    shop:
      current.shop === null
        ? null
        : {
            ...current.shop,
            modules: current.shop.modules.map((entry) =>
              entry.moduleId === moduleId ? { ...entry, sold: true } : entry,
            ),
          },
  }));

  return appendLog(next, {
    source: 'station',
    kind: 'run',
    text: `Bought ${def.name} for ${stock.price} Alloy.`,
    detail: { module: moduleId, cost: stock.price },
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

/** Patch the cutter. The ronin is repaired separately — two attrition tracks. */
export function repairShip(state: GameState, amount: number): GameState {
  const run = requireRun(state);
  const wanted = Math.max(0, Math.min(amount, run.ship.maxHull - run.ship.hull));
  const cost = wanted * ECONOMY.shipRepairPerPoint;
  if (wanted === 0 || run.alloy < cost) return state;

  const paid = spendAlloy(state, cost, 'station');
  const next = withRun(paid, (current) => ({
    ...current,
    ship: { ...current.ship, hull: current.ship.hull + wanted },
  }));

  return appendLog(next, {
    source: 'station',
    kind: 'run',
    text: `Welded ${wanted} onto the cutter for ${cost} Alloy.`,
    detail: { repaired: wanted, cost },
  });
}
