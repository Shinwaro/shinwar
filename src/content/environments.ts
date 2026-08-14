/* Environments — the second layer of the map decision.
 *
 * Every combat node shows its environment badge before the player commits to
 * the route, so two players looking at the same fork should genuinely disagree
 * about which way to go. Each one is a definition plus a set of hook handlers;
 * nothing about an environment is special-cased in the engine.
 *
 * All 8 arrive at M5. Clear Space is here now because Act 1 node 1 is always a
 * normal combat in Clear Space, and mapgen asserts that.
 */

import type { EnvironmentDef } from '../engine/types.ts';

export const CLEAR_SPACE_ID = 'clear_space';

export const ENVIRONMENTS: readonly EnvironmentDef[] = [
  {
    id: CLEAR_SPACE_ID,
    name: 'Clear Space',
    text: 'No modifier.',
  },
];
