/* A mark for every enemy.
 *
 * Content, not code — this file is a table of coordinates and nothing here
 * decides anything. It sits beside the enemy definitions for the same reason
 * their names and flavour do: what a thing is called and what it looks like are
 * the same kind of fact.
 *
 * **Why they exist.** Two enemies used to be two identical text boxes with
 * different words in them, and target priority is real content now — Splint
 * Chorus has to be the thing you kill first, and "kill the small one" only
 * works if the small one looks like something. A silhouette does that in the
 * time it takes to glance.
 *
 * **Family first, individual second.** Everything in the Kiln line carries the
 * same flame; everything mechanical is built from square brackets; the ronin
 * marks echo the player's own. Things that behave alike look alike, so the
 * roster teaches itself — you learn one Kiln enemy and the next one is already
 * half familiar.
 *
 * Plotted on a 100-unit box like the wordmark and the stance mark, stroked in
 * `currentColor`. `solid` paths are filled and drawn first, so a stroke that
 * crosses a filled shape reads as crossing it. If one needs to be bigger,
 * scale the SVG rather than re-plotting the numbers.
 */

export interface Glyph {
  /** Filled shapes. Drawn under the strokes. */
  readonly solid?: readonly string[];
  /** Stroked paths. */
  readonly form: readonly string[];
}

/* The flame every Kiln enemy is built on: a spike, wider at the base. */
const FLAME = 'M50 14 L66 52 L50 74 L34 52 Z';
/* The bracket every machine is built on: square, open at the top. */
const FRAME = 'M24 30 L24 76 L76 76 L76 30';
/* The shallow arc the choirs and processions share. */
const RANK = 'M18 66 C34 46 66 46 82 66';
/* The shell every Vareth is built on. The only domed body on the roster —
   everything else here is a flame, a bracket or an arc, so a carapace reads as
   "not from around here" before you have identified which one it is. */
const CARAPACE = 'M26 44 C26 26 74 26 74 44 L74 62 C74 76 26 76 26 62 Z';

export const GLYPHS: { readonly [enemyId: string]: Glyph } = {
  /* ---------- the Kiln line: fire, Heat, Strength ----------
     One flame, and what each of them does with it. */

  // The smallest thing in the game. One flame, nothing holding it.
  cinder_wisp: { solid: [FLAME], form: [] },

  // It stokes: the flame, and two rising strokes feeding it.
  kiln_adept: { solid: [FLAME], form: ['M26 82 L26 62', 'M74 82 L74 62'] },

  // The elite. Horns over the flame.
  kiln_alpha: { solid: [FLAME], form: ['M20 34 L30 18 L40 30', 'M60 30 L70 18 L80 34'] },

  // The boss. A crown, and the flame banked inside it.
  kiln_sovereign: {
    solid: [FLAME],
    form: ['M18 30 L18 12 L34 24 L50 8 L66 24 L82 12 L82 30', 'M22 86 L78 86'],
  },

  // Fire behind a slab: it plates, and vents Scald from behind the plate.
  slag_warden: { solid: [FLAME], form: ['M14 64 L86 64 L86 86 L14 86 Z'] },

  // A funnel drinking the flame.
  heat_siphon: { solid: [FLAME], form: ['M20 76 L50 92 L80 76', 'M20 76 L20 62', 'M80 76 L80 62'] },

  // The elite that sings: the flame, and the sound going out from it.
  cantor_of_ash: {
    solid: [FLAME],
    form: ['M14 40 L4 30', 'M14 60 L4 70', 'M86 40 L96 30', 'M86 60 L96 70'],
  },

  /* ---------- machines: brackets, plate, precision ---------- */

  // The smallest machine: the bracket and a spindle.
  lathe_drone: { form: [FRAME, 'M50 30 L50 58'] },

  // The elite lathe. The bracket, and the arc it cuts.
  mag_lathe: { form: [FRAME, 'M30 44 C44 26 56 26 70 44', 'M50 30 L50 58'] },

  // Welds: the bracket and the arc jumping across it.
  arc_welder: { form: [FRAME, 'M30 40 L46 52 L36 58 L54 70'] },

  // Draws off and banks: the bracket with a funnel in it.
  siphon_engine: { form: [FRAME, 'M32 36 L50 60 L68 36', 'M50 60 L50 74'] },

  // A prism. One beam in, two out.
  null_prism: {
    solid: ['M50 22 L78 70 L22 70 Z'],
    form: ['M6 46 L22 46', 'M78 58 L94 50', 'M78 62 L94 74'],
  },

  // Tiles. Three of them, sharing their plating.
  tessellate_shard: {
    form: ['M50 16 L70 40 L50 64 L30 40 Z', 'M30 56 L44 74', 'M70 56 L56 74'],
  },

  /* ---------- beasts: rounded bodies, legs, jaws ---------- */

  // Low and quick, all jaw.
  scrap_hound: {
    solid: ['M20 44 C34 30 66 30 82 46 L82 62 L20 62 Z'],
    form: ['M28 62 L24 82', 'M48 62 L48 82', 'M72 62 L78 82', 'M82 46 L94 40 L88 56'],
  },

  /* ---------- the Vareth: chitin, and a heading they will not drop ----------
     One carapace, and what each of them has grown to do with it. Legs count up
     with the act; mandibles mean it closes with you. Only ever met through a
     reprisal, so the family is deliberately unlike anything on a chart. */

  // The drone. The shell and two legs, and nothing decided about it.
  vareth_drone: { solid: [CARAPACE], form: ['M32 74 L26 88', 'M68 74 L74 88'] },

  // The scout. Mandibles forward: it is the one that closes.
  vareth_huntress: {
    solid: [CARAPACE],
    form: ['M30 44 L14 32 L22 48', 'M70 44 L86 32 L78 48', 'M34 74 L28 90', 'M66 74 L72 90'],
  },

  // The outrider. Legs swept back — it is always already ahead of you.
  vareth_outrider: {
    solid: [CARAPACE],
    form: ['M30 72 L12 84', 'M50 76 L50 92', 'M70 72 L88 84'],
  },

  /* The clutchward, carrying the thing it was told to bring back. The egg is
     the second filled shape, held under the shell. */
  vareth_clutchward: {
    solid: [CARAPACE, 'M44 74 C44 66 56 66 56 74 C56 82 44 82 44 74 Z'],
    form: ['M28 46 L12 38', 'M72 46 L88 38', 'M32 84 C40 92 60 92 68 84'],
  },

  // The chitinguard. One heavy bar across the body: it interposes.
  vareth_chitinguard: {
    solid: [CARAPACE],
    form: ['M12 58 L88 58', 'M34 76 L30 90', 'M66 76 L70 90'],
  },

  /* The matriarch. Mandibles raised into something like the Sovereign's crown,
     because she is the other thing in this game that an act is named after. */
  vareth_matriarch: {
    solid: [CARAPACE],
    form: [
      'M22 40 L10 22 L26 30',
      'M78 40 L90 22 L74 30',
      'M50 26 L50 8',
      'M30 74 L22 92',
      'M50 76 L50 94',
      'M70 74 L78 92',
    ],
  },

  // A round body on many legs, and the lance it burrows with.
  rust_tick: {
    solid: ['M32 34 C60 34 68 50 68 54 C68 66 56 74 46 74 C34 74 28 62 28 54 Z'],
    form: ['M28 44 L12 36', 'M28 56 L10 56', 'M30 66 L14 76', 'M66 44 L92 26'],
  },

  // The snout is the whole animal.
  bloom_weevil: {
    solid: ['M30 44 C52 38 72 46 76 58 C78 70 62 78 48 76 C34 74 26 62 30 44 Z'],
    form: ['M30 48 L8 30', 'M40 78 L36 92', 'M64 78 L70 92'],
  },

  /* ---------- ronin: the player's own language, turned around ----------
     These use the stance mark's shapes deliberately. A thing that fights the
     way you do should look like it. */

  // One blade, drifting.
  sable_drifter: { solid: ['M30 22 L86 84 L20 34 Z'], form: ['M24 28 L12 16'] },

  // A blade and a guard: it holds forms, like you do.
  void_ronin: {
    solid: ['M30 22 L86 84 L20 34 Z'],
    form: ['M36 16 L16 36', 'M24 24 L12 12'],
  },

  // Two blades, mirrored. It is you, from the other side.
  mirror_ronin: {
    solid: ['M34 24 L84 78 L24 34 Z', 'M66 24 L16 78 L76 34 Z'],
    form: [],
  },

  /* ---------- choirs and ranks: repetition ---------- */

  // Three voices.
  ash_choir: { form: [RANK, 'M32 66 L32 86', 'M50 62 L50 86', 'M68 66 L68 86'] },

  // Three, bound together — which is the whole problem with it.
  splint_chorus: { form: [RANK, 'M32 66 L32 86', 'M50 62 L50 86', 'M68 66 L68 86', 'M26 78 L74 78'] },

  // Five, and the middle one already gone.
  collapse_choir: {
    form: [RANK, 'M24 68 L24 88', 'M37 64 L37 88', 'M63 64 L63 88', 'M76 68 L76 88', 'M44 82 L56 70'],
  },

  // Ranks, advancing. It does not hurry.
  iron_procession: {
    solid: ['M16 46 L34 46 L34 84 L16 84 Z', 'M41 40 L59 40 L59 84 L41 84 Z', 'M66 46 L84 46 L84 84 L66 84 Z'],
    form: ['M16 30 L50 14 L84 30'],
  },

  /* ---------- act 3: geometry that has gone wrong ---------- */

  // Handedness. The same hook, both ways, and they do not agree.
  chirality_warden: {
    form: ['M42 22 C18 30 18 62 42 70', 'M58 30 C82 38 82 70 58 78', 'M50 12 L50 88'],
  },

  // It unwrites. A mark, struck through.
  nullwright: {
    form: ['M28 28 L72 28 L72 72 L28 72 Z', 'M18 82 L82 18'],
  },

  // Frost, gathering.
  rimewake: {
    form: [
      'M50 12 L50 88', 'M17 31 L83 69', 'M83 31 L17 69',
      'M50 28 L42 20', 'M50 28 L58 20', 'M50 72 L42 80', 'M50 72 L58 80',
    ],
  },

  /* ---------- one of a kind ---------- */

  // A ledger, and a line through what you owe.
  tally_keeper: {
    form: ['M24 16 L76 16 L76 84 L24 84 Z', 'M34 34 L66 34', 'M34 50 L66 50', 'M30 62 L70 66'],
  },

  // The front itself, arriving.
  wavefront_herald: {
    form: ['M10 78 C28 40 72 40 90 78', 'M22 84 C36 56 64 56 78 84', 'M50 12 L50 44'],
    solid: ['M43 44 L57 44 L50 60 Z'],
  },

  // Everything that has fallen in, and the edge of it.
  event_horizon: {
    solid: ['M50 30 C61 30 70 39 70 50 C70 61 61 70 50 70 C39 70 30 61 30 50 C30 39 39 30 50 30 Z'],
    form: ['M50 12 C71 12 88 29 88 50 C88 71 71 88 50 88 C29 88 12 71 12 50 C12 29 29 12 50 12 Z'],
  },

  /* The introduction's target. Deliberately the dullest mark in the file — a
     hull nobody is flying, with the bow stoved in. It should look like
     furniture, because that is what it is.

     Its id is `training_hulk` even though it is called the Derelict Hauler,
     which is exactly the sort of thing that produces a mark keyed to a name
     nobody uses. There is a test for it. */
  training_hulk: { form: ['M12 38 L88 38 L88 74 L12 74 Z', 'M12 46 L26 56 L12 66'] },
};
