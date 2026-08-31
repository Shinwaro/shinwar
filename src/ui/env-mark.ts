/* A glyph per environment, and the one-time announcement when you arrive in one.
 *
 * The badge said the environment's name and its rule in small type, in the
 * middle of the board, in the same weight as everything else — so the single
 * fact that changes how the whole fight works was the least visible thing on
 * screen. A mark gives it a silhouette you learn once and then recognise from
 * across the board, the way the card marks do.
 *
 * Geometric glyphs on purpose. The obvious picks for these are the weather and
 * astronomy symbols — a sun for the Corona, a radiation trefoil for the Belt —
 * and most of those carry emoji presentation, so they arrive as colour pictures
 * in the middle of a monochrome board. These all render as text.
 */

import { CLEAR_SPACE_ID } from '../content/environments.ts';

const MARKS: Record<string, string> = {
  /* Rounds repeating. */
  chronal_shear: '⟳',
  /* Scattered, and there are several of them. An asterism reads as debris in a
     way a single diamond does not — and the diamond sat in the same family as
     the card marks, which is the one place these two vocabularies must not
     look alike. */
  debris_field: '⁂',
  /* Nothing, said as directly as a glyph can say it. */
  deep_void: '∅',
  /* Everything falling toward one point. */
  gravity_well: '⊙',
  /* Radiating out. */
  radiation_belt: '※',
  /* Banded, and you cannot see through it. */
  sensor_fog: '≋',
  /* A flare. Not a pointed star: the card marks own those, and a corona is a
     bloom rather than a spark. */
  stellar_corona: '❋',
};

export function environmentMark(id: string): string | null {
  return MARKS[id] ?? null;
}

/* ---------- arriving somewhere ----------

   The badge is rebuilt on every combat render — the whole screen is — so a CSS
   entry animation on the element would replay every time anything happened,
   which is the opposite of an announcement. So the last environment ANNOUNCED
   is remembered here, and the class is added only on the render where it
   changed. Same pattern as `lastPips` and the bar staging in `anim.ts`, and for
   the same reason: the render is stateless and the animation is not.

   `forgetEnvironment()` is called when the screen stops being a fight, so every
   fight announces even if two in a row share an environment. */

let announced: string | null = null;

export function environmentIsNew(id: string): boolean {
  if (id === CLEAR_SPACE_ID || id === announced) return false;
  announced = id;
  return true;
}

export function forgetEnvironment(): void {
  announced = null;
}
