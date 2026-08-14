/* Stance — the multiplying axis.
 *
 * Always exactly one. Cards read differently depending on which, so changing
 * stance is not a buff, it is a re-reading of the hand. Keep transitions cheap
 * but not free: the interesting decision is "is it worth spending a card slot
 * on the transition."
 *
 * What each stance *does* is a table in `content/balance.ts`. What is here is
 * only the transition.
 */

import type { GameState, StanceId } from '../types.ts';
import { appendLog, requireCombat, withCombat } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { ACTIVE_STANCES, STANCES } from '../../content/balance.ts';

export function currentStance(state: GameState): StanceId {
  return requireCombat(state).stance;
}

/**
 * The next stance in rotation. Walks `ACTIVE_STANCES`, so a dormant stance is
 * never cycled into. With two active it is a toggle and direction is moot,
 * which is fine — the cards that name a direction still read correctly when a
 * third stance comes back.
 */
export function nextStance(from: StanceId, direction: 1 | -1): StanceId {
  const order = ACTIVE_STANCES;
  const length = order.length;
  if (length === 0) return from;

  const index = order.indexOf(from);
  // Currently in a stance that has been retired: step back into rotation.
  if (index === -1) return order[0] ?? from;

  const moved = (((index + direction) % length) + length) % length;
  return order[moved] ?? from;
}

/** Set the stance. A no-op when already there — it must not cost a hook firing. */
export function setStance(state: GameState, to: StanceId, source: string): GameState {
  const combat = requireCombat(state);
  const from = combat.stance;
  if (from === to) return state;

  const changed = withCombat(state, (current) => ({ ...current, stance: to }));
  const logged = appendLog(changed, {
    source,
    kind: 'stance',
    text: `${STANCES[from].name} to ${STANCES[to].name}. ${STANCES[to].text}`,
    detail: { from, to },
  });

  return fireHook(logged, 'onStanceChange', { from, to });
}

export function cycleStance(state: GameState, direction: 1 | -1, source: string): GameState {
  return setStance(state, nextStance(requireCombat(state).stance, direction), source);
}
