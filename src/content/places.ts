/* Names for the places on the chart.
 *
 * Every node gets one, generated with the map so it is part of the seed. The
 * point is navigational, not flavour: "go to Kessel Deep" is a route you can
 * hold in your head and talk about, and "go to the third dot from the left" is
 * not. So the names are SHORT — one or two words, no punctuation, nothing that
 * needs a second line under a star.
 *
 * A stem plus a designation gives a few hundred combinations from two small
 * lists, which is enough that a single act never repeats itself.
 */

export const PLACE_STEMS: readonly string[] = [
  'Kessel',
  'Torr',
  'Vareth',
  'Sable',
  'Ashfall',
  'Corvid',
  'Meridian',
  'Halcyon',
  'Ninefold',
  'Kiln',
  'Orrery',
  'Pallas',
  'Rictus',
  'Sorrow',
  'Tessel',
  'Umber',
  'Vantage',
  'Wake',
  'Xanthe',
  'Yarrow',
  'Zenith',
  'Bellhouse',
  'Cinder',
  'Dolmen',
  'Ember',
  'Faultline',
  'Gallows',
  'Hollow',
  'Iron',
  'Jackdaw',
  'Lantern',
  'Marrow',
  'Nadir',
  'Oxbow',
  'Petrel',
  'Quill',
  'Ravel',
  'Stray',
  'Thrum',
  'Verge',
];

export const PLACE_DESIGNATIONS: readonly string[] = [
  'Reach',
  'Deep',
  'Halo',
  'Drift',
  'Shoal',
  'Gate',
  'Wells',
  'Verge',
  'Span',
  'Fold',
];

/** The origin of every act. You arrive where you arrive. */
export const ARRIVAL_NAME = 'Arrival';

/** What sits at the end of each act. Fixed, because the boss is a landmark. */
export const ACT_FINALES: { readonly [act in 1 | 2 | 3]: string } = {
  1: 'The Kiln',
  2: 'The Front',
  3: 'Event Horizon',
};
