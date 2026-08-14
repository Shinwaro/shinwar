/* Load every content pool into the registry.
 *
 * Explicit rather than by import side-effect: an import that quietly registers
 * things is an import you cannot reorder safely, and the tests need to load,
 * clear and reload at will.
 */

import { CARDS } from './cards/index.ts';
import { ENEMIES } from './enemies/index.ts';
import { EVENTS } from './events/index.ts';
import { MODULES } from './modules/index.ts';
import { ENVIRONMENTS } from './environments.ts';
import { MASTERIES } from './masteries.ts';
import { cards, clearAllContent, enemies, environments, events, masteries, modules, threads } from './registry.ts';
import type { ThreadDef } from '../engine/types.ts';

/** Threads arrive at M4 with the events that set them. */
const THREAD_DEFS: readonly ThreadDef[] = [];

let loaded = false;

export function loadContent(): void {
  if (loaded) return;
  cards.register(CARDS);
  enemies.register(ENEMIES);
  modules.register(MODULES);
  events.register(EVENTS);
  environments.register(ENVIRONMENTS);
  masteries.register(MASTERIES);
  threads.register(THREAD_DEFS);
  loaded = true;
}

/** Tests only. */
export function reloadContent(): void {
  clearAllContent();
  loaded = false;
  loadContent();
}
