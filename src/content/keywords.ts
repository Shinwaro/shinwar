/* What the words on a card mean.
 *
 * A card's rules text is generated from its ops, which keeps it honest — but
 * honest is not the same as *understandable*. "Burn." is exact and tells a
 * first-time player nothing, and there was nowhere in the game that explained
 * it. Every term that needs explaining now carries its explanation onto the
 * card, in fine print under the rules line.
 *
 * Statuses are NOT duplicated here. They already carry their own `text` in
 * `statuses.ts` and `glossaryFor()` reads it from there, because two copies of
 * "Vulnerable takes 50% more damage" is exactly how one of them ends up wrong.
 * What lives here is only the vocabulary that has no status row: the card
 * mechanics and the three resources.
 */

export interface KeywordDef {
  readonly id: string;
  /** Matched against the generated rules text, case-sensitively. */
  readonly name: string;
  readonly text: string;
}

export const KEYWORDS: readonly KeywordDef[] = [
  {
    /* "Burn", not "Exhaust".
     *
     * The pile is called Burned, overheating "burns a card", and the ship is a
     * reactor — so the deck term may as well be the word the rest of the game
     * already uses. `exhaust` stays the name of the FIELD and of the pile in
     * state: renaming shipped data for a word churns every card that sets it
     * and every replay that carries it, for nothing the player can see. */
    id: 'exhaust',
    name: 'Burn',
    text: 'Gone for the rest of the fight once played. Back in your deck next fight.',
  },
  {
    id: 'innate',
    name: 'Innate',
    text: 'Starts in your hand every fight.',
  },
  /* `keeps-focus` was here.
   *
     "Does not consume Focus" already says the whole rule in the four words it
     takes to print it, so the glossary line under it restated the sentence
     directly above with no new information — and every line of fine print on a
     card is a line the player has to decide to skip. The keyword budget is
     tight on purpose (see CLAUDE.md); a term that explains itself does not need
     a seat in it. The card text is unchanged. */
  {
    id: 'energy',
    name: 'Energy',
    text: 'Refills at the start of every turn.',
  },
];
