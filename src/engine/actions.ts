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
