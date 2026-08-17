/* The card pool.
 *
 * Adding a card is one file edit: append a `CardDef` to the archetype file it
 * belongs to and add that file's export to the list below. Rules text is
 * GENERATED from the effect ops by `describeCard()` — never hand-written, or
 * it drifts from behaviour the moment a number is tuned, and drifted text is
 * the most common cause of a game feeling unfair. Flavor text is separate and
 * hand-written.
 *
 * 41 cards: 4 basic, 33 offerable across the four archetypes and the rarity
 * ladder, and 4 that only an Anomaly or a Thread can hand you. The pool scales
 * to ~85 at M6.
 */

import type { CardDef } from '../../engine/types.ts';
import { BASIC_CARDS } from './basic.ts';
import { EVENT_CARDS } from './events.ts';
import { FOCUS_CARDS } from './focus.ts';
import { GUARD_CARDS } from './guard.ts';
import { IAI_CARDS } from './iai.ts';
import { NEUTRAL_CARDS } from './neutral.ts';
import { OVERHEAT_CARDS } from './overheat.ts';
import { TEMPO_CARDS } from './tempo.ts';

export const CARDS: readonly CardDef[] = [
  ...BASIC_CARDS,
  ...IAI_CARDS,
  ...GUARD_CARDS,
  ...OVERHEAT_CARDS,
  ...NEUTRAL_CARDS,
  ...FOCUS_CARDS,
  ...TEMPO_CARDS,
  ...EVENT_CARDS,
];

export { STARTING_DECK } from './basic.ts';
