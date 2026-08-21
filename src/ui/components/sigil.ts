/* The ronin's mark — the only thing on screen that is *you*.
 *
 * Not a portrait and not a sprite. The game's whole visual language is
 * typographic and instrument-panel: tokens, hand-plotted SVG, no assets
 * anywhere. A drawn figure would be the one illustrated element on a screen
 * that is otherwise deliberately unillustrated, and the moment there is one,
 * everything is judged as illustration. A mark stays inside the language the
 * wordmark already speaks.
 *
 * **The same three parts in both stances, arranged differently.** That is what
 * a stance *is* — one body, differently held — so drawing IAI and GUARD as two
 * unrelated icons would be describing them wrongly. The parts:
 *
 *   the ring    the ronin
 *   the stroke  the blade
 *   the base    the footing
 *
 * IAI leans: the base is narrow and forward, and the blade leaves the ring
 * entirely — the cut is already on its way out. GUARD squares up: the base is
 * wide, and the blade is held across the ring rather than through it.
 *
 * Plotted on a 100-unit box like the wordmark, and stroked in `currentColor`
 * so the stance accent it inherits is the only colour decision. It does not
 * animate: everything around it already moves, and a mark that holds still is
 * the point of having one.
 */

import type { StanceId } from '../../engine/types.ts';
import { STANCES } from '../../content/balance.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Plot {
  /** The blade. Two points, in the 100-unit box. */
  readonly blade: readonly [number, number, number, number];
  /** The footing, as a polyline. */
  readonly base: string;
  /** Where the ring sits, and how open it is. */
  readonly ring: { readonly cx: number; readonly cy: number; readonly r: number; readonly gap: number };
}

/* Hand-plotted. The numbers matter to each other, not to anything else — if
   these need to be bigger, scale the SVG rather than re-plotting them. */
const PLOTS: { readonly [id in StanceId]: Plot } = {
  /* Coiled. The blade crosses the ring low and carries on past the box edge,
     and the feet are close together with the weight over the front one. */
  iai: {
    blade: [16, 74, 92, 30],
    base: 'M40 88 L52 96 L64 88',
    ring: { cx: 44, cy: 40, r: 20, gap: 0.32 },
  },
  /* Braced. The blade is held level across the front of the ring, and the feet
     are planted wide. */
  guard: {
    blade: [22, 52, 78, 52],
    base: 'M28 90 L50 80 L72 90',
    ring: { cx: 50, cy: 36, r: 20, gap: 0 },
  },
  /* Benched, but plotted so the mark never has a hole in it if FLOW ever comes
     back into rotation. Loose: the blade trails, the footing is a single point. */
  flow: {
    blade: [24, 40, 84, 66],
    base: 'M44 88 L52 94 L60 88',
    ring: { cx: 46, cy: 44, r: 18, gap: 0.55 },
  },
};

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const made = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) made.setAttribute(key, value);
  return made;
}

/**
 * The ring, as an arc with a gap in it.
 *
 * A `<circle>` with a dash pattern would be shorter and would rotate its gap to
 * a different place at every size, because the dash is measured along the
 * circumference. Drawn as an arc, the opening is where it was plotted.
 */
function ringPath(cx: number, cy: number, r: number, gap: number): string {
  if (gap <= 0) {
    return `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy}`;
  }
  // The gap opens on the leading side, which is where the blade goes out.
  const half = Math.PI * gap;
  const from = -Math.PI / 4 + half;
  const to = -Math.PI / 4 - half + Math.PI * 2;
  const x1 = cx + r * Math.cos(from);
  const y1 = cy + r * Math.sin(from);
  const x2 = cx + r * Math.cos(to);
  const y2 = cy + r * Math.sin(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function renderSigil(stance: StanceId): SVGSVGElement {
  const plot = PLOTS[stance];
  const svg = node('svg', {
    class: 'sigil',
    viewBox: '0 0 100 100',
    'data-stance': stance,
    role: 'img',
    'aria-label': `${STANCES[stance].name} stance`,
  });

  const group = node('g', {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  group.append(
    node('path', { class: 'sigil-ring', d: ringPath(plot.ring.cx, plot.ring.cy, plot.ring.r, plot.ring.gap) }),
    node('path', { class: 'sigil-base', d: plot.base }),
    node('line', {
      class: 'sigil-blade',
      x1: String(plot.blade[0]),
      y1: String(plot.blade[1]),
      x2: String(plot.blade[2]),
      y2: String(plot.blade[3]),
    }),
  );

  svg.append(group);
  return svg;
}
