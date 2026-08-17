/* Minting card and enemy instances.
 *
 * Every physical copy needs a stable unique id: two IAI Slashes in hand are
 * two different things to click, and two Scrap Hounds are two different things
 * to target. The ids come from a plain counter in `RunState`, not from the
 * RNG — burning a die roll to name something would couple the streams to how
 * many cards happen to exist, and a counter reproduces exactly.
 */

import type { CardId, CardInstance, EnemyDef, EnemyState } from '../types.ts';

export interface Minted<T> {
  readonly value: T;
  readonly uidCounter: number;
}

export function mintCard(uidCounter: number, defId: CardId, upgraded: boolean): Minted<CardInstance> {
  return {
    value: { uid: `c${uidCounter}`, defId, upgraded },
    uidCounter: uidCounter + 1,
  };
}

/**
 * Turn a list of card ids into instances. Used for the starting deck, and for
 * anything later that hands the player a batch of cards at once.
 *
 * Lives here rather than in `combat.ts` so `state.ts` can build a deck without
 * importing the combat loop — that would be a cycle, and cycles in module
 * initialisation are the kind of bug that only shows up in the bundler.
 */
export function buildDeck(
  uidCounter: number,
  cardIds: readonly CardId[],
): { readonly deck: readonly CardInstance[]; readonly uidCounter: number } {
  let counter = uidCounter;
  const deck: CardInstance[] = [];
  for (const id of cardIds) {
    const minted = mintCard(counter, id, false);
    deck.push(minted.value);
    counter = minted.uidCounter;
  }
  return { deck, uidCounter: counter };
}

export function mintEnemy(uidCounter: number, def: EnemyDef): Minted<EnemyState> {
  return {
    value: {
      uid: `e${uidCounter}`,
      defId: def.id,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      statuses: [],
      intentMoveId: null,
      ai: { moveIndex: 0, lastMoveId: null, repeats: 0 },
    },
    uidCounter: uidCounter + 1,
  };
}
