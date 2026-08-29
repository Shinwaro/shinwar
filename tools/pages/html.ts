/* The small amount of HTML plumbing the three reference pages share.
 *
 * Deliberately not a template engine. Every page is one hand-written HTML file
 * under `templates/` with `{{SLOT}}` markers in it, and the builders fill the
 * slots with strings. That keeps the design editable as HTML — which is how a
 * page actually gets designed — while the data in it stays generated.
 */

/** Matches Python's `html.escape(s, quote=True)`, which is what built these
 *  pages before the port; the ampersand has to go first or it eats its own
 *  output. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

/** Codepoint order, not locale order. `localeCompare` would sort these
 *  differently on a machine in a different locale, and a reference page that
 *  reorders itself by who built it produces a diff nobody can read. */
export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sort by a list of keys, each either a number or a string, in order. */
export function by<T>(...keys: ((row: T) => number | string)[]): (a: T, b: T) => number {
  return (a, b) => {
    for (const key of keys) {
      const left = key(a);
      const right = key(b);
      const cmp =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : byText(String(left), String(right));
      if (cmp !== 0) return cmp;
    }
    return 0;
  };
}

/** A plain scrollable table. Wide tables scroll in their own box rather than
 *  making the page scroll sideways. */
export function table<T>(
  rows: readonly T[],
  columns: readonly string[],
  cells: readonly ((row: T) => string)[],
): string {
  const head = columns.map((column) => `<th>${column}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${cells.map((cell) => `<td>${cell(row)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Fill `{{SLOT}}` markers. Throws on a slot the template does not have and on
 *  a marker left unfilled — both mean the template and the builder have
 *  drifted apart, which otherwise ships as a page with `{{EVENTS}}` printed in
 *  the middle of it. */
export function fill(template: string, slots: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(slots)) {
    const marker = `{{${key}}}`;
    if (!out.includes(marker)) throw new Error(`template has no ${marker}`);
    out = out.replaceAll(marker, String(value));
  }
  const left = /\{\{[A-Z]+\}\}/.exec(out);
  if (left !== null) throw new Error(`template slot ${left[0]} was never filled`);
  return out;
}

/** The rarity ladder, in ladder order. Anything unknown sorts to the end
 *  rather than throwing, so a new tier shows up in the page as misplaced
 *  instead of taking the build down. */
export const RANK = [
  'basic',
  'common',
  'uncommon',
  'epic',
  'legendary',
  'mythic',
  'artifact',
] as const;

export function rank(rarity: string): number {
  const index = RANK.indexOf(rarity as (typeof RANK)[number]);
  return index === -1 ? 99 : index;
}

export const TIER = { normal: 0, elite: 1, boss: 2 } as const;

export function tierRank(tier: string): number {
  return TIER[tier as keyof typeof TIER] ?? 99;
}

export function chip(rarity: string): string {
  return `<span class="tier" data-rarity="${rarity}">${rarity}</span>`;
}
