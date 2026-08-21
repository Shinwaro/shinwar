/* Drawing an enemy's mark. The table it reads is in `content/glyphs.ts`.
 *
 * Same language as the ronin's stance mark: a 100-unit box, stroked in
 * `currentColor`, fills drawn first. Nothing here decides what a glyph looks
 * like — it only turns coordinates into nodes.
 *
 * An enemy with no entry renders nothing rather than a placeholder. A missing
 * mark should look like a mark that has not been drawn yet, not like a bug.
 */

import { GLYPHS } from '../../content/glyphs.ts';
import { svgEl } from '../dom.ts';

export function renderGlyph(enemyId: string, name: string): SVGSVGElement | null {
  const glyph = GLYPHS[enemyId];
  if (glyph === undefined) return null;

  const svg = svgEl('svg', {
    class: 'glyph',
    viewBox: '0 0 100 100',
    // The name is already beside it in text, so the mark is decoration to a
    // screen reader and announcing it twice is noise.
    'aria-hidden': 'true',
    focusable: 'false',
    'data-enemy': enemyId,
  });

  const group = svgEl('g', {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 7,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  for (const d of glyph.solid ?? []) {
    group.append(svgEl('path', { class: 'glyph-solid', d, fill: 'currentColor', stroke: 'none' }));
  }
  for (const d of glyph.form) {
    group.append(svgEl('path', { class: 'glyph-form', d }));
  }

  svg.append(svgEl('title', {}, [name]), group);
  return svg;
}
