/* The card pool.
 *
 * Adding a card is one file edit: append a `CardDef` to the archetype file it
 * belongs to and add that file's export to the list below. Rules text is
 * GENERATED from the effect ops by `describeCard()` — never hand-written, or
 * it drifts from behaviour the moment a number is tuned, and drifted text is
 * the most common cause of a game feeling unfair. Flavor text is separate and
 * hand-written.
 *
 * Four cards at M1. The pool scales to ~85 at M6.
 */

import type { CardDef } from '../../engine/types.ts';
import { BASIC_CARDS } from './basic.ts';

export const CARDS: readonly CardDef[] = [...BASIC_CARDS];

export { STARTING_DECK } from './basic.ts';
