/* THE MANIFEST.
   This is the only file the homepage reads. One entry per experiment.
   Newest entries sort to the top of the index automatically (by `added`).

   Fields, all required:
     slug      folder name under x/  — must match exactly
     title     shown on the card and in the experiment's top bar
     blurb     one line, lowercase-ish, no period needed. keep it under ~70 chars
     category  one of: arcade | quiz | trainer | toy
     added     YYYY-MM-DD

   See CLAUDE.md for the full checklist. */

window.EXPERIMENTS = [
  {
    slug: "deep-run",
    title: "Deep Run",
    blurb: "Pick a class, fight three things in the dark, die anyway.",
    category: "arcade",
    added: "2026-08-14",
  },
  {
    slug: "reaction-time",
    title: "Reaction Time",
    blurb: "Tap the circle the instant it turns green.",
    category: "arcade",
    added: "2026-08-13",
  },
];
