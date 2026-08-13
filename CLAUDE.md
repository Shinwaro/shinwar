# shinwar.se — conventions

A personal experiment lab. The homepage is an index of small, self-contained interactive things.
The site's growth *is* the site.

**No build step. No framework. No dependencies. No toolchain.** Plain HTML, CSS, and JS.
There is no Node installed on this machine and none is wanted.

---

## Adding an experiment — the whole checklist

This is the core workflow. It should take one prompt and touch exactly two places.

1. **Create `x/<slug>/index.html`** — one self-contained page. Copy the skeleton below.
2. **Add one entry to `experiments.js`** — put it at the **top** of the array.

That's it. The index picks it up automatically. Nothing else to register, import, or rebuild.

### The entry

```js
{
  slug: "reaction-time",           // MUST equal the folder name under x/
  title: "Reaction Time",
  blurb: "Tap the circle the instant it changes color.",
  category: "arcade",              // arcade | quiz | trainer | toy
  added: "2026-08-14",             // YYYY-MM-DD — sorts the index, newest first
},
```

Categories are a **fixed set of four**. Don't invent a fifth without also updating `CATEGORIES` in
`assets/index.js` and adding a `--cat-*` colour plus a `.tag-*` rule in `assets/shell.css`.

| id | label | what it means |
|---|---|---|
| `arcade` | Arcade | quick reflex or score games, fun in under 60 seconds |
| `quiz` | Quizzes | pick-a-topic question sets |
| `trainer` | Trainers | drill-style practice (typing, shortcuts, alphabets, memorisation) |
| `toy` | Toys | utilities, generators, visualisations, gadgets, silly one-offs |

Blurb: one line, under ~70 characters, plain and honest. Dumb experiments get dumb blurbs — that's
correct. A half-finished idea should never feel out of place here.

### The skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Reaction Time — shinwar</title>
<meta name="description" content="Tap the circle the instant it changes color.">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="../../assets/shell.css">
<style>
  /* experiment-local CSS goes HERE, never in shell.css */
</style>
</head>
<body>

<header class="xbar">
  <a class="xbar-back" href="../../index.html">←&nbsp;<span>shinwar</span></a>
  <h1 class="xbar-title">Reaction Time</h1>
  <span class="tag tag-arcade">Arcade</span>
</header>

<main class="stage no-select">
  <!-- the experiment. be as loud as you like in here. -->
</main>

<script>
(function () {
  "use strict";
  // …
})();
</script>
</body>
</html>
```

The tag class and label must match the category (`tag-arcade`/Arcade, `tag-quiz`/Quizzes,
`tag-trainer`/Trainers, `tag-toy`/Toys).

---

## Gotchas — read these, they bite every time

**Paths are relative, deliberately.** `../../assets/shell.css`, not `/assets/shell.css`. This is what
lets `index.html` work by double-clicking it, with no local server. Absolute paths break local
preview. The single exception is `404.html`, which uses absolute paths because the server can serve
it from any depth — so 404.html alone does not preview correctly from `file://`.

**The manifest is `.js`, not `.json`, on purpose.** `fetch()` is blocked on `file://`; a `<script>`
tag isn't. Don't "improve" this into a JSON file — it breaks local preview entirely.

**Never persist anything.** No `localStorage`, no `sessionStorage`, no cookies, no analytics, no
high scores, no server calls. Refresh and it's gone. This is a deliberate product decision, not an
oversight — do not add persistence to be helpful. Robin will ask if he ever wants it.
(URL hash for filter state is fine — that's a URL, not storage.)

**Phone and desktop are equally first-class.** Every experiment must be genuinely playable with
touch *and* keyboard/mouse. Design for the phone at the same time as the desktop, not after. If an
idea doesn't survive the translation to touch, say so before building it.

`shell.css` already handles the usual mobile disasters globally — `touch-action: manipulation`
(no tap delay / double-tap zoom), `overscroll-behavior: none` (no pull-to-refresh mid-game), safe
area insets. You still need to:

- put `no-select` on anything tapped repeatedly, so long-press doesn't select text
- keep touch targets ≥ 44px
- use `.stage` for the play area — it fills the viewport below the bar using `dvh`, which survives
  mobile browser chrome sliding in and out
- call `e.preventDefault()` on `touchstart` handlers if you also bind `click`, or it fires twice

**Accessibility: enough, not a research project.** Real `<button>`s and `<a>`s, keyboard reachable,
visible focus, readable contrast, `aria-live` on things that change. `shell.css` handles focus rings
and `prefers-reduced-motion`. Don't over-engineer it, just don't do obviously bad things.

**English only.** No Swedish, no language toggle.

**Keep it fast.** No web fonts, no CDN, no libraries. If an experiment genuinely needs a dependency,
vendor the file into its own folder and justify it.

---

## Files

```
index.html         the index — masthead, filter chips, card grid
experiments.js     THE MANIFEST — the only file the index reads
404.html           not-found page (absolute paths; server-only)
assets/
  shell.css        tokens (light+dark), card grid, chips, .xbar, .stage, .btn, .tag
  index.js         chip building, card rendering, hash filter state, empty states
x/<slug>/
  index.html       one experiment, fully self-contained
```

### Index behaviour worth knowing

- Sorted by `added`, newest first; ties break alphabetically.
- Filter state lives in the URL hash (`shinwar.se/#arcade`), so a filtered view is linkable.
- **Chips only render once at least two categories are populated.** With one experiment there is
  nothing to filter, so the chip row is hidden on purpose. Not a bug.
- Two empty states: nothing at all ("Nothing here yet…", written to read as a promise), and a
  filter with no matches ("No trainers yet.").
- Cards link to `x/<slug>/index.html` — the explicit filename makes it work both from `file://` and
  live. The prettier `shinwar.se/x/<slug>/` also works on the live site, so share that with friends.

---

## Running it

Double-click `index.html`. That's the whole thing — no server, no install, no command.

## Deploying

`git push`. Cloudflare Pages rebuilds and it's live in about 20 seconds.
There is no build command and no output directory to configure — the repo root *is* the site.

```bash
git add -A && git commit -m "add reaction-time experiment" && git push
```
