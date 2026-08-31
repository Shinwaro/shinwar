/* What a card looks like at a glance, from what it does.
 *
 * The same classification the sound uses, wearing a different coat. `cardVoice`
 * already reads the effect ops and decides what SHAPE a card is — one target or
 * the room, once or repeatedly, a hit that leaves something behind, Block,
 * Focus, a Power — and that decision was audible and invisible. This makes it
 * visible.
 *
 * Reading the ops rather than keeping a table of ids is the whole point, for
 * the reason `card-voice.ts` gives: a hundred cards with a hand-assigned mark
 * each is a list that is wrong the day somebody adds the hundred-and-first.
 *
 * **The mark never moves.** `cardVoice` takes the live stance rider, because an
 * IAI card played in IAI genuinely sounds different; the mark passes `null`
 * instead. A glyph that changed while the player was looking at it would be the
 * opposite of a thing you can read at a glance, and the rider already has its
 * own line on the face.
 *
 * The glyphs are a family each, so the shape is legible before the detail is:
 * stars strike, triangles put something on somebody, squares hold, and the
 * round ones hand you a resource.
 */

import type { CardDef } from '../engine/types.ts';
import { cardVoice } from './card-voice.ts';

export interface CardMark {
  /** The glyph. Decorative — the label is what assistive tech reads. */
  readonly glyph: string;
  /** Said in full on hover and to a screen reader. */
  readonly label: string;
  /** Family, for colour. Kept coarse: five colours is a legend, twelve is not. */
  readonly family: 'attack' | 'debuff' | 'block' | 'power' | 'resource' | 'skill';
}

const MARKS: Record<string, CardMark> = {
  atkMini: { glyph: '✦', label: 'Attack', family: 'attack' },
  atkSmall: { glyph: '✦', label: 'Attack', family: 'attack' },
  atkBig: { glyph: '✦', label: 'Heavy attack', family: 'attack' },
  atkMultihit: { glyph: '✧', label: 'Multi-hit attack', family: 'attack' },
  atkAoeSmall: { glyph: '✸', label: 'Hits every enemy', family: 'attack' },
  atkAoeBig: { glyph: '✸', label: 'Hits every enemy', family: 'attack' },
  atkAoeMultihit: { glyph: '✹', label: 'Hits every enemy, repeatedly', family: 'attack' },
  cardAttackIai: { glyph: '✦', label: 'Attack', family: 'attack' },

  atkDebuff: { glyph: '▼', label: 'Leaves something on the target', family: 'debuff' },
  atkDebuffAoe: { glyph: '▽', label: 'Leaves something on every enemy', family: 'debuff' },

  /* Hexagons for Block: plating, and an outline that fills in when the card
     does more than plate. Squares read as buttons at this size. */
  block: { glyph: '⬡', label: 'Block', family: 'block' },
  blockSpecial: { glyph: '⬢', label: 'Block, and more than Block', family: 'block' },

  strength: { glyph: '▲', label: 'Strengthens you', family: 'power' },
  overclocked: { glyph: '◉', label: 'Power — changes the rest of the fight', family: 'power' },

  focus: { glyph: '◈', label: 'Banks Focus', family: 'resource' },
  energy: { glyph: '◇', label: 'Gives Energy', family: 'resource' },
};

/* The floor: a card that moves cards or statuses around and is none of the
   above. It was a full stop, which at this size was indistinguishable from
   dirt on the screen — a mark has to look chosen. */
const FALLBACK: CardMark = { glyph: '≡', label: 'Skill', family: 'skill' };

export function cardMark(def: CardDef): CardMark {
  /* `null` for the rider on purpose — see the note at the top. */
  return MARKS[cardVoice(def, null)] ?? FALLBACK;
}
