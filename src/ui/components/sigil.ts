/* The ronin's mark — the only thing on screen that is *you*.
 *
 * Not a portrait and not a sprite. The game's whole visual language is
 * typographic and instrument-panel: tokens, hand-plotted SVG, no assets
 * anywhere. A drawn figure would be the one illustrated element on a screen
 * that is otherwise deliberately unillustrated, and the moment there is one,
 * everything is judged as illustration. A mark stays inside the language the
 * wordmark already speaks.
 *
 * **It draws what the stance DOES, not how the ronin stands.** The first
 * version drew posture — a ring, a blade, a footing, rearranged — which was a
 * nice idea and said nothing a player could use. A stance here is a rule about
 * where your Focus goes and which way your Heat moves, so that is what the
 * mark shows:
 *
 *   the form        what one Focus becomes — a point that leaves, or a wall
 *                   that stays
 *   the heat arrow  which way the gauge goes at the end of your turn
 *
 * The two forms are deliberately opposite in every way that survives being
 * 38 pixels wide: angular against round, open against closed, leaving against
 * holding. The heat arrow is the same shape in both, pointed the other way.
 *
 * Plotted on a 100-unit box like the wordmark, stroked in `currentColor` so
 * the stance accent it inherits is the only colour decision. It does not
 * animate: everything around it already moves, and a mark that holds still is
 * most of the point of having one.
 */

import type { StanceId } from '../../engine/types.ts';
import { STANCES } from '../../content/balance.ts';
import { svgEl } from '../dom.ts';

interface Plot {
  /** What one Focus becomes. The mark's whole argument. Stroked. */
  readonly form: readonly string[];
  /**
   * Filled shapes, drawn under the strokes.
   *
   * A blade that tapers has to be a shape rather than a line — a line with a
   * crossbar on it is a hammer, which is what the first attempt looked like.
   * Filled rather than outlined because at 38 pixels an outlined triangle with
   * a stroked arrow crossing it is four edges where the eye wants one form.
   */
  readonly solid?: readonly string[];
  /** Which way the gauge moves at the end of the turn. `null` for neither. */
  readonly heat: 'up' | 'down' | null;
}

/* Hand-plotted. The numbers matter to each other, not to anything else — if
   these need to be bigger, scale the SVG rather than re-plotting them. */
const PLOTS: { readonly [id in StanceId]: Plot } = {
  /* A strike leaving the box, crossed by the sword that makes it.
  
     The arrow and the blade meet at dead centre (50,50) — the arrow runs
     lower-left to upper-right and the sword upper-left to lower-right, so the
     X is square rather than lopsided. The crossguard is what stops the second
     stroke reading as a second arrow.
     
     No heat arrow on this one. The X is already two strokes and a guard, and a
     third symbol at 38 pixels turns a mark into a scribble — the cost is that
     IAI no longer shows its Heat rise, which the stance text beside it still
     states in words. */
  iai: {
    /* The blade is an isosceles triangle about the diagonal: the two base
       corners sit the same distance either side of the axis and the point is
       on it, so it is symmetrical by construction rather than by eye. Base
       corners are 26,26 offset by ±8 along the perpendicular; the point runs
       to 90,90. */
    solid: ['M31.7 20.3 L90 90 L20.3 31.7 Z'],
    form: [
      // The arrow, lower-left to upper-right, running past the corner.
      'M14 86 L82 18',
      // Its head, opened back from the point.
      'M58 18 L84 16 L82 42',
      // The guard, square across the blade and wider than its base.
      'M36 16 L16 36',
      // The grip, running back from the guard to the pommel.
      'M24 24 L13 13',
    ],
    heat: null,
  },
  /* A wall that stays. Closed, symmetrical, and the only curves in the set —
     nothing here is going anywhere. */
  guard: {
    form: [
      'M50 14 L82 26 L82 52 C82 74 50 88 50 88 C50 88 18 74 18 52 L18 26 Z',
    ],
    heat: 'down',
  },
  /* Benched, but plotted so the mark never has a hole in it if FLOW comes back
     into rotation. Neither spends nor holds: it slips past, and the gauge does
     not move. */
  flow: {
    form: ['M16 62 C36 30 64 82 86 44'],
    heat: null,
  },
};

/**
 * The heat arrow, drawn once and flipped.
 *
 * The same three strokes in both stances so the eye reads it as one symbol
 * pointing two ways, rather than as two symbols it has to learn separately.
 */
function heatArrow(direction: 'up' | 'down'): readonly string[] {
  /* Placement is the fiddly part. IAI's blade runs corner to corner, so the
     arrow goes in the upper-left quadrant the blade has already left — at
     x=25 the blade sits at y≈75, well below it. GUARD's arrow goes inside the
     shield rather than beside it: there is no "beside" on a closed form, and
     against the right-hand edge it landed on the outline. */
  return direction === 'up'
    ? ['M25 56 L25 30', 'M17 38 L25 28 L33 38']
    : ['M50 36 L50 64', 'M42 56 L50 66 L58 56'];
}

export function renderSigil(stance: StanceId): SVGSVGElement {
  const plot = PLOTS[stance];
  const svg = svgEl('svg', {
    class: 'sigil',
    viewBox: '0 0 100 100',
    'data-stance': stance,
    role: 'img',
    'aria-label': `${STANCES[stance].name} stance`,
  });

  const group = svgEl('g', {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '7',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  /* Fills first, so a stroked line crossing a filled shape reads as crossing
     it rather than being buried under it. */
  for (const d of plot.solid ?? []) {
    group.append(svgEl('path', { class: 'sigil-solid', d, fill: 'currentColor', stroke: 'none' }));
  }
  for (const d of plot.form) {
    group.append(svgEl('path', { class: 'sigil-form', d }));
  }
  if (plot.heat !== null) {
    for (const d of heatArrow(plot.heat)) {
      group.append(svgEl('path', { class: 'sigil-heat', d }));
    }
  }

  svg.append(group);
  return svg;
}
