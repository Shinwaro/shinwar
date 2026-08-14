/* The SHIN/WAR wordmark.
 *
 * Hand-plotted letterforms on a 100-unit cap height with an 18-unit stem.
 * WAR is painted first, in #8c1b1b, so the N reads over the W where they
 * cross.
 *
 * DO NOT convert this to a font. DO NOT "clean up" the path coordinates. DO
 * NOT re-plot it. The N/W overlap only lands correctly because the numbers are
 * exact, and a real typeface would render that join differently on every
 * device — which is the whole reason it was plotted by hand in the first
 * place. If it needs to be bigger, scale the SVG.
 */

const MARKUP = `
<svg viewBox="-12 -12 483 192" fill-rule="evenodd" aria-hidden="true" focusable="false">
  <!-- WAR paints first so the N reads over the W where they cross -->
  <g transform="translate(177,68)" fill="#8c1b1b">
    <path d="M0 0 L18 0 L50 100 L32 100 Z"/>
    <path d="M32 100 L50 100 L82 0 L64 0 Z"/>
    <path d="M64 0 L82 0 L114 100 L96 100 Z"/>
    <path d="M96 100 L114 100 L146 0 L128 0 Z"/>
    <path transform="translate(150,0)"
          d="M24 0 L40 0 L64 100 L46 100 L42 80 L22 80 L18 100 L0 100 Z
             M27 62 L37 62 L32 30 Z"/>
    <path transform="translate(224,0)"
          d="M0 0 L40 0 L54 12 L54 42 L44 54 L58 100 L38 100 L28 58 L18 58 L18 100 L0 100 Z
             M18 16 L18 40 L36 40 L36 16 Z"/>
  </g>
  <g class="wordmark-shin">
    <path d="M0 0 L52 0 L52 18 L18 18 L18 41 L52 41 L52 100 L0 100 L0 82 L34 82 L34 59 L0 59 Z"/>
    <path transform="translate(62,0)"
          d="M0 0 L18 0 L18 41 L36 41 L36 0 L54 0 L54 100 L36 100 L36 59 L18 59 L18 100 L0 100 Z"/>
    <path transform="translate(126,0)" d="M0 0 L18 0 L18 100 L0 100 Z"/>
    <path transform="translate(154,0)"
          d="M0 0 L18 0 L64 66 L64 0 L82 0 L82 100 L64 100 L18 34 L18 100 L0 100 Z"/>
  </g>
</svg>`;

/**
 * The wordmark as an element. `aria-hidden` is already on the SVG, so whatever
 * wraps this must carry the accessible name — the title screen puts it in a
 * visually-hidden span inside the `<h1>`.
 */
export function createWordmark(): SVGSVGElement {
  const holder = document.createElement('div');
  holder.innerHTML = MARKUP.trim();
  const svg = holder.querySelector('svg');
  if (svg === null) throw new Error('wordmark: markup did not parse');
  return svg as SVGSVGElement;
}
