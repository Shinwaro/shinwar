/* What the words on a card mean.
 *
 * A card's rules text is generated from its ops, which keeps it honest — but
 * honest is not the same as *understandable*. "Exhaust." is exact and tells a
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
    id: 'exhaust',
    name: 'Exhaust',
    text: 'Gone for the rest of the fight once played.',
  },
  {
    id: 'innate',
    name: 'Innate',
    text: 'Starts in your hand every fight.',
  },
  {
    id: 'focus',
    name: 'Focus',
    text: 'Banked in GUARD, spent in IAI. Every stack adds damage to the attack that finally spends it.',
  },
  {
    id: 'energy',
    name: 'Energy',
    text: 'Refills at the start of every turn.',
  },
];
