/* Enemy marks.
 *
 * The table is content, so the risks are content risks: an enemy added later
 * with no mark, a mark left behind by an enemy that was deleted, and a path
 * plotted outside the box it is drawn in. None of those throw — they just look
 * wrong, which is exactly the kind of thing nobody notices until a playtest.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { reloadContent } from '../src/content/index.ts';
import { enemies as enemyTable } from '../src/content/registry.ts';
import { GLYPHS } from '../src/content/glyphs.ts';

beforeEach(() => {
  reloadContent();
});

/** Every number in a path, so the box can be checked. */
function coordsOf(d: string): readonly number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe('the enemy marks', () => {
  it('gives every shipped enemy one', () => {
    const missing = enemyTable
      .all()
      .filter((def) => GLYPHS[def.id] === undefined)
      .map((def) => def.id);
    expect(missing).toEqual([]);
  });

  it('has none left over from an enemy that no longer exists', () => {
    const known = new Set(enemyTable.all().map((def) => def.id));
    expect(Object.keys(GLYPHS).filter((id) => !known.has(id))).toEqual([]);
  });

  it('draws something in every one', () => {
    for (const [id, glyph] of Object.entries(GLYPHS)) {
      const paths = [...(glyph.solid ?? []), ...glyph.form];
      expect(paths.length, `${id} draws nothing`).toBeGreaterThan(0);
      for (const d of paths) expect(d.trim(), id).not.toBe('');
    }
  });

  it('stays inside the 100-unit box', () => {
    /* Everything is plotted on the same box as the wordmark and the stance
       mark. A stray coordinate does not throw, it just draws half a mark —
       the stroke is 7 wide, so a little overhang is fine and a lot is a typo. */
    for (const [id, glyph] of Object.entries(GLYPHS)) {
      for (const d of [...(glyph.solid ?? []), ...glyph.form]) {
        for (const value of coordsOf(d)) {
          expect(value, `${id}: ${d}`).toBeGreaterThanOrEqual(-8);
          expect(value, `${id}: ${d}`).toBeLessThanOrEqual(108);
        }
      }
    }
  });

  it('keeps every path to complete coordinate pairs', () => {
    // An odd count means a dropped number, which silently bends a shape.
    for (const [id, glyph] of Object.entries(GLYPHS)) {
      for (const d of [...(glyph.solid ?? []), ...glyph.form]) {
        expect(coordsOf(d).length % 2, `${id}: ${d}`).toBe(0);
      }
    }
  });

  it('closes every filled shape', () => {
    /* An unclosed fill is closed implicitly by the renderer, along whatever
       line happens to join the ends — which is rarely the line you drew. */
    for (const [id, glyph] of Object.entries(GLYPHS)) {
      for (const d of glyph.solid ?? []) {
        expect(d.trim().toUpperCase().endsWith('Z'), `${id} fill is not closed: ${d}`).toBe(true);
      }
    }
  });
});
