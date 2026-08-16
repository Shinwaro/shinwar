/* Every way the world can change.
 *
 * An action is plain serializable data. `seed + action log` reproduces any run
 * exactly, which makes this type the bug report format as much as it is an
 * internal detail: paste the seed and the log and the run comes back.
 *
 * Actions the player cannot take do not belong here. Enemy turns, hook
 * cascades and heat resolution are consequences of `endTurn`, not actions of
 * their own — otherwise the log stops being a record of decisions.
 */

export type Action =
  /* -- title -- */
  | { readonly kind: 'setSeed'; readonly seed: string }
  | { readonly kind: 'setDepth'; readonly depth: number }
  | { readonly kind: 'beginRun' }
  /* -- combat --
     Card selection is deliberately absent. Selecting a card is a UI state, not
     a decision — it changes nothing about the world and undoing it costs
     nothing. Logging it would bloat the replay with noise and make the log
     stop being a record of what the player actually chose to do. */
  | { readonly kind: 'playCard'; readonly cardUid: string; readonly targetUid: string | null }
  | { readonly kind: 'endTurn' }
  /** Resolve one enemy. The UI dispatches these on a timer so the enemy turn
      can be watched rather than arriving in a single frame. */
  | { readonly kind: 'advanceEnemies' }
  /* -- ship combat: one lever a turn, then the turn resolves -- */
  | { readonly kind: 'intervene'; readonly verb: import('./types.ts').InterventionId }
  | { readonly kind: 'resolveShipTurn' }
  | { readonly kind: 'moveModule'; readonly moduleId: string; readonly x: number; readonly y: number }
  /* -- the map -- */
  | { readonly kind: 'moveToNode'; readonly nodeId: string }
  /* -- rewards -- */
  | { readonly kind: 'takeRewardCard'; readonly cardId: string }
  | { readonly kind: 'claimRewardAlloy' }
  | { readonly kind: 'leaveReward' }
  /* -- safe planet: a menu, pick one -- */
  | { readonly kind: 'safePlanetHeal' }
  | { readonly kind: 'safePlanetUpgrade'; readonly cardUid: string }
  | { readonly kind: 'safePlanetRemove'; readonly cardUid: string }
  | { readonly kind: 'safePlanetTrade' }
  /* -- station -- */
  | { readonly kind: 'stationRepair'; readonly amount: number }
  | { readonly kind: 'leaveNode' }
  /* -- run -- */
  | { readonly kind: 'abandonRun' }
  | { readonly kind: 'returnToTitle' };

export type ActionKind = Action['kind'];

/** The action log. Replay (M2) folds this over a fresh state from the same seed. */
export interface ActionLog {
  readonly seed: string;
  readonly depth: number;
  readonly actions: readonly Action[];
}
