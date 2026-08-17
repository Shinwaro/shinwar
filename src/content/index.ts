/* Load every content pool into the registry.
 *
 * Explicit rather than by import side-effect: an import that quietly registers
 * things is an import you cannot reorder safely, and the tests need to load,
 * clear and reload at will.
 */

import { CARDS } from './cards/index.ts';
import { ENEMIES } from './enemies/index.ts';
import { EVENTS } from './events/index.ts';
import { ENVIRONMENTS, RADIATION_BELT_ID, registerEnvironmentHooks } from './environments.ts';
import { registerEnemyHooks } from './enemies/index.ts';
import { isRegistered } from '../engine/hooks.ts';
import { MASTERIES } from './masteries.ts';
import { IMPLANTS } from './implants.ts';
import { RELICS } from './relics.ts';
import { STATUSES } from './statuses.ts';
import { THREAD_DEFS } from './threads.ts';
import {
  cards,
  clearAllContent,
  enemies,
  environments,
  events,
  masteries,
  implants,
  relics,
  statuses,
  threads,
} from './registry.ts';

let loaded = false;

export function loadContent(): void {
  if (loaded) return;
  // Statuses first: card and enemy validation resolves status ids against them.
  statuses.register(STATUSES);
  cards.register(CARDS);
  enemies.register(ENEMIES);
  events.register(EVENTS);
  environments.register(ENVIRONMENTS);
  masteries.register(MASTERIES);
  relics.register(RELICS);
  implants.register(IMPLANTS);
  threads.register(THREAD_DEFS);

  // The hook bus is module-level and survives a content reload, so registering
  // twice throws. Asking the bus itself — rather than keeping a local flag —
  // means a test that calls `resetHooks()` gets the handlers back on the next
  // load instead of silently running without them.
  if (!isRegistered(RADIATION_BELT_ID)) {
    registerEnvironmentHooks();
    registerEnemyHooks();
  }

  loaded = true;
}

/** Tests only. */
export function reloadContent(): void {
  clearAllContent();
  loaded = false;
  loadContent();
}
