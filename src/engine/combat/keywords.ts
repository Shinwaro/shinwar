/* Status stack arithmetic.
 *
 * What a status *does* lives in `src/content/statuses.ts` and is read by the
 * damage pipeline. What lives here is only the bookkeeping: add, read, decay.
 */

import type { GameState, StatusStack, StatusId } from '../types.ts';
import { statuses as statusTable } from '../../content/registry.ts';
import { applyDirectDamage, type Combatant } from './damage.ts';
import { gainHeat } from './heat.ts';
import { withCombat } from '../state.ts';

export function stacksOf(held: readonly StatusStack[], status: StatusId): number {
  return held.find((entry) => entry.status === status)?.stacks ?? 0;
}

export function hasStatus(held: readonly StatusStack[], status: StatusId): boolean {
  return stacksOf(held, status) > 0;
}

/**
 * Add stacks, or subtract them. A status at zero or below is removed entirely
 * rather than left as an empty row — an empty row would serialize, and two
 * states that differ only by an invisible zero would hash differently.
 */
export function addStacks(
  held: readonly StatusStack[],
  status: StatusId,
  delta: number,
): readonly StatusStack[] {
  if (delta === 0) return held;
  const existing = stacksOf(held, status);
  const next = existing + delta;
  const without = held.filter((entry) => entry.status !== status);
  if (next <= 0) return without;

  // Gaining stacks marks the whole entry fresh, so the coming decay skips it
  // once. Losing them never does — a decay must not refresh its own target.
  const wasFresh = held.find((entry) => entry.status === status)?.fresh ?? false;
  const fresh = delta > 0 ? true : wasFresh;

  // Keep the list sorted so the order never depends on application order.
  return [...without, { status, stacks: next, fresh }].sort((a, b) =>
    a.status < b.status ? -1 : a.status > b.status ? 1 : 0,
  );
}

/**
 * One stack off every `decay: 'turn'` status — except the ones applied since
 * their holder last acted.
 *
 * That exception is the whole reason `fresh` exists. Decay runs at the end of
 * the round, after the enemies have moved, so without it a debuff an enemy just
 * applied to the player is stripped in the same breath: applied, logged, and
 * gone before the player takes a single turn under it. Every enemy debuff in
 * the game was doing nothing at all.
 */
export function decayStatuses(held: readonly StatusStack[]): readonly StatusStack[] {
  let out = held;
  for (const entry of held) {
    if (entry.fresh) continue;
    const def = statusTable.find(entry.status);
    if (def === undefined || def.decay !== 'turn') continue;
    // A `turnEnd` status already shed its stack the moment it bit. Taking one
    // here as well would cost it two a round.
    if (def.tickAt === 'turnEnd') continue;
    out = addStacks(out, entry.status, -1);
  }
  return out;
}

/**
 * The holder is acting, so nothing on them is new any more.
 *
 * Called at the start of the player's turn and when an enemy takes its action —
 * the two moments that mean "you have now had a turn with this".
 */
export function clearFresh(held: readonly StatusStack[]): readonly StatusStack[] {
  if (!held.some((entry) => entry.fresh)) return held;
  return held.map((entry) => (entry.fresh ? { ...entry, fresh: false } : entry));
}

export function describeStatus(status: StatusId, stacks: number): string {
  const def = statusTable.find(status);
  return `${def?.name ?? status} ${stacks}`;
}

/**
 * Extra Energy from statuses, flat while held rather than per stack.
 *
 * See `StatusDef.energyWhileHeld`: for this one the stacks are the duration,
 * so two different statuses granting Energy would add, but two stacks of the
 * same one do not.
 */
export function statusEnergy(held: readonly StatusStack[]): number {
  let total = 0;
  for (const stack of held) {
    if (stack.stacks <= 0) continue;
    total += statusTable.find(stack.status)?.energyWhileHeld ?? 0;
  }
  return total;
}

/**
 * Everything a status does *per turn*, for one holder.
 *
 * One tick, in one place, driven by `damagePerTurn` and `heatPerTurn` on the
 * status row. A rust is therefore a line of data rather than a handler, and
 * the day a second rust-like status arrives it gets the same tick for free
 * instead of a second copy of this that drifts.
 *
 * Unblockable on purpose: Block is the answer to nearly everything else, so the
 * pressure worth adding is the kind that walks past it.
 */
export function tickStatuses(
  state: GameState,
  who: Combatant,
  phase: 'turnStart' | 'turnEnd' = 'turnStart',
): GameState {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return state;

  const held =
    who.kind === 'player'
      ? combat.statuses
      : (combat.enemies.find((enemy) => enemy.uid === who.uid)?.statuses ?? []);

  let next = state;
  for (const stack of held) {
    const def = statusTable.find(stack.status);
    if (def === undefined) continue;
    if ((def.tickAt ?? 'turnStart') !== phase) continue;

    const damage = (def.damagePerTurn ?? 0) * stack.stacks;
    if (damage > 0) {
      next = applyDirectDamage(next, who, damage, stack.status, def.name.toLowerCase());
    }

    // Enemies have no gauge, so a Scald on one is inert rather than a special
    // case — the field simply does nothing off the player.
    const heat = (def.heatPerTurn ?? 0) * stack.stacks;
    if (heat > 0 && who.kind === 'player') {
      next = gainHeat(next, heat, stack.status);
    }

    /* The stack goes with the bite, for anything that bites at the end of a
       turn. Seeing 3 Rust take 6 off you and then drop to 2 in the same beat is
       one readable event; the old order — tick at the start, decay a round
       later somewhere else — meant the number on the board and the number you
       were about to take never matched. */
    if (phase === 'turnEnd' && def.decay === 'turn') {
      next = withCombat(next, (current) =>
        who.kind === 'player'
          ? { ...current, statuses: addStacks(current.statuses, stack.status, -1) }
          : {
              ...current,
              enemies: current.enemies.map((enemy) =>
                enemy.uid === who.uid
                  ? { ...enemy, statuses: addStacks(enemy.statuses, stack.status, -1) }
                  : enemy,
              ),
            },
      );
    }
  }
  return next;
}
