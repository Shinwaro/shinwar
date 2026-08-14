/* What this card will do, if you play it at that target.
 *
 * The preview is a DRY RUN of the real thing. It calls `playCard` on the
 * current state — which is immutable, so "playing" it costs nothing — and
 * reports the difference. There is no second implementation to drift, no
 * parallel walk of the effect ops, and no way for the number on screen to
 * disagree with the number that lands.
 *
 * That matters more than it looks. A preview computed separately would agree
 * with resolution on the day it was written and stop agreeing the first time
 * someone adds a modifier to one path and not the other. This cannot.
 */

import type { GameState, StanceId } from '../types.ts';
import { canPlay, playCard } from './combat.ts';
import { requireCombat } from '../state.ts';

export interface EnemyPreview {
  readonly uid: string;
  /** Damage that will come off this enemy's HP. Already through the pipeline. */
  readonly hpLoss: number;
  readonly willDie: boolean;
}

export interface CardPreview {
  readonly playable: boolean;
  readonly reason: string | null;
  readonly enemies: readonly EnemyPreview[];
  readonly blockGain: number;
  readonly heatDelta: number;
  readonly focusDelta: number;
  readonly energyCost: number;
  readonly drawCount: number;
  readonly stanceAfter: StanceId | null;
  readonly stanceChanges: boolean;
}

const EMPTY: CardPreview = {
  playable: false,
  reason: null,
  enemies: [],
  blockGain: 0,
  heatDelta: 0,
  focusDelta: 0,
  energyCost: 0,
  drawCount: 0,
  stanceAfter: null,
  stanceChanges: false,
};

export function previewCard(state: GameState, cardUid: string, targetUid: string | null): CardPreview {
  const check = canPlay(state, cardUid);
  if (!check.ok) return { ...EMPTY, reason: check.reason };

  const before = requireCombat(state);
  const after = requireCombat(playCard(state, cardUid, targetUid));

  const enemies = before.enemies.map((enemy) => {
    const later = after.enemies.find((entry) => entry.uid === enemy.uid);
    const hpLoss = enemy.hp - (later?.hp ?? enemy.hp);
    return { uid: enemy.uid, hpLoss, willDie: (later?.hp ?? enemy.hp) <= 0 && enemy.hp > 0 };
  });

  return {
    playable: true,
    reason: null,
    enemies,
    blockGain: after.block - before.block,
    heatDelta: after.heat - before.heat,
    focusDelta: after.focus - before.focus,
    energyCost: before.energy - after.energy,
    drawCount: Math.max(0, after.hand.length - (before.hand.length - 1)),
    stanceAfter: after.stance,
    stanceChanges: after.stance !== before.stance,
  };
}
