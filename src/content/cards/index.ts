/* The card pool.
 *
 * Adding a card is one file edit: append a `CardDef` to the archetype file it
 * belongs to and add that file's export to the list below. Rules text is
 * GENERATED from the effect ops by `describeCard()` — never hand-written, or
 * it drifts from behaviour the moment a number is tuned, and drifted text is
 * the most common cause of a game feeling unfair. Flavor text is separate and
 * hand-written.
 *
 * Empty until M1, which brings the 12 starting cards.
 */

import type { CardDef } from '../../engine/types.ts';

export const CARDS: readonly CardDef[] = [];
