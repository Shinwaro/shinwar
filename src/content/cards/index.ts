/* The card pool.
 *
 * Adding a card is one file edit: append a `CardDef` to the archetype file it
 * belongs to and add that file's export to the list below. Rules text is
 * GENERATED from the effect ops by `describeCard()` — never hand-written, or
 * it drifts from behaviour the moment a number is tuned, and drifted text is
 * the most common cause of a game feeling unfair. Flavor text is separate and
 * hand-written.
 *
 * The pool, by what it is for: the basic starting deck, the offerable cards
 * across the four archetypes and the rarity ladder, the execution cards that
 * pay for a kill, the handful only an Anomaly or a Thread can give you, and
 * the Voided cards you are stuck with until you pay to be rid of one.
 *
 * `EXECUTION_CARDS` is a file rather than a scattering across the archetypes
 * because the mechanic is the point of them and it wants explaining once.
 * `VOIDED_CARDS` is a file because none of them are cards in any other sense.
 */

import type { CardDef } from '../../engine/types.ts';
import { BASIC_CARDS } from './basic.ts';
import { EVENT_CARDS } from './events.ts';
import { DISCARD_CARDS } from './discard.ts';
import { EXECUTION_CARDS } from './execution.ts';
import { FOCUS_CARDS } from './focus.ts';
import { GUARD_CARDS } from './guard.ts';
import { LEGENDARY_CARDS } from './legendary.ts';
import { IAI_CARDS } from './iai.ts';
import { NEUTRAL_CARDS } from './neutral.ts';
import { OVERHEAT_CARDS } from './overheat.ts';
import { POWER_CARDS } from './powers.ts';
import { TEMPO_CARDS } from './tempo.ts';
import { VOIDED_CARDS } from './voided.ts';

export const CARDS: readonly CardDef[] = [
  ...BASIC_CARDS,
  ...IAI_CARDS,
  ...GUARD_CARDS,
  ...OVERHEAT_CARDS,
  ...NEUTRAL_CARDS,
  ...FOCUS_CARDS,
  ...TEMPO_CARDS,
  ...DISCARD_CARDS,
  ...POWER_CARDS,
  ...EXECUTION_CARDS,
  ...LEGENDARY_CARDS,
  ...EVENT_CARDS,
  ...VOIDED_CARDS,
];

export { STARTING_DECK } from './basic.ts';
