# SHINWAR — conventions

A space-themed roguelike deckbuilder. You play a ronin of a dead orbital sect, flying a salvaged
cutter through a collapsing star frontier. Card combat with a stance layer, a branching star map,
and a deck you build as you go.

**The repo is the game.** shinwar.se serves nothing else. `DESIGN.md` holds the design rationale;
read it before changing anything mechanical.

---

## Stack

TypeScript (strict), Vite, Vitest. No UI framework — no React, no Vue, no Svelte. Rendering is
plain DOM plus CSS, with `<canvas>` for the starfield and combat effects only.

**Dependencies stay near zero.** Vite, TypeScript, Vitest. Nothing else without a deliberate
decision recorded in `NOTES.md`. No CSS framework, no animation library, no state library, no CDN,
no web fonts. If something genuinely needs a dependency, vendor it and justify it.

```bash
npm run dev        # vite dev server
npm run build      # -> dist/
npm run preview    # serve dist/ locally
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run sim -- --runs 5000 --depth 0
```

---

## The rules that don't bend

**No persistence. None.** No `localStorage`, no `sessionStorage`, no cookies, no IndexedDB, no
analytics, no network calls, no accounts, no scores. Close the tab and the run is gone. This is a
deliberate product decision — do not add saves to be helpful, and do not add "just a settings
cache." A run is about an hour and it is meant to be a single sitting.

There is a `beforeunload` guard during an active run and a visible, copyable seed. That is the
whole mitigation and it is enough.

**`src/engine/` is pure.** No DOM, no `window`, no `document`, no `Date.now()`, no `Math.random()`
— ever. A grep for `Math.random` under `src/engine/` must return nothing. This is enforced by a
test; if you find yourself wanting to disable that test, the design is wrong, not the test.

**All randomness flows through one seeded PRNG held in game state**, split into named independent
streams — `map`, `combat`, `rewards`, `events`, `shop`. Named streams mean adding a die roll to
combat can never change which maps generate for a given seed. Never call the raw generator directly.

**State transitions are pure and immutable.** `applyAction(state, action) => newState`. `GameState`
must stay JSON-serializable: no classes, no `Map`, no `Set`, no stored functions. Everything
downstream — replay, tests, the simulator — depends on this.

**One damage pipeline.** `previewDamage()` and actual resolution call the identical function.
A preview that can disagree with the result is the fastest way to make the game feel unfair. It
must be structurally impossible, not merely avoided.

**The UI never computes game logic.** It reads state, renders it, dispatches actions. If it needs a
number, it calls an engine query — the same one the resolver uses.

**Content is data, not code.** Adding a card means editing one file under `src/content/` and
nothing else. If adding content requires touching the engine, the effect-op vocabulary is missing
something — extend that instead.

---

## Layout

```
src/
  engine/            PURE. No DOM. No Math.random.
    rng.ts state.ts actions.ts reducer.ts queries.ts hooks.ts types.ts
    combat/    combat stance heat effects damage keywords intents ai
    map/       mapgen environments route
    run/       rewards economy threads difficulty
  content/           PURE DATA + registry validation
    cards/ enemies/ events/
    encounters.ts environments.ts masteries.ts balance.ts
  ui/                DOM only
    store.ts app.ts screens/ components/ input.ts anim.ts a11y.ts
    space.ts         the asteroid scene (title + menu backgrounds)
  styles/
    tokens.css shell.css game.css
sim/                 headless bot + balance runner
tests/
```

`index.html` at the root is the single entry point. The game is a one-page app; there are no other
HTML files.

---

## Adding content

The whole point of the architecture. Each of these is one file edit.

**A card** — add a `CardDef` to the right file under `src/content/cards/`. Rules text is
**generated** from the effect ops by `describeCard()`; do not hand-write it. Hand-written text
drifts from behaviour the moment you tune a number, and drifted text is the most common cause of a
game feeling unfair. Flavor text is separate and hand-written.

**An enemy, an event, an environment** — same pattern, own file, plus a hook handler if it needs
ongoing behaviour.

Everything extensible hangs off the **hook bus** (`src/engine/hooks.ts`). A relic is data plus a
handler. So is a mastery, a status, an environment. Handlers are pure `(state, payload) => state`,
sorted by explicit `priority` then a stable key — **never** by insertion order or object identity,
or determinism breaks in ways that take a day to find.

`CONTENT.md` has the step-by-step. `BALANCE.md` has every tuning number and why it is what it is.

**Ask before** adding an effect op, a keyword, or a fourth combat resource. Those three are where
complexity gets in. Check whether `conditional` + `scaleWith` already expresses it.

---

## Gotchas — these bite every time

**Seeded determinism is a feature, not a nicety.** `seed + action log` reproduces any run exactly.
It's the regression harness, it's how the simulator works, and it's the bug report format — if
something goes wrong, the seed and the log are the whole repro. Anything that breaks reproducibility
is a P1.

**Enemy intents are committed at telegraph time.** They do not re-roll after the player acts. This
is a correctness requirement. A player who plans around a telegraphed `14` and takes `21` will
never trust the game again.

**Keep the keyword count down.** Target ≤14 at 1.0. Depth comes from stance and heat
recontextualising a small vocabulary, not from more nouns.

**Desktop-first, mobile playable.** An hour-long run with no saves is a desktop session. Build the
real UI for the desktop; keep mobile functional but don't let it constrain how much information the
desktop layout shows. Interaction is **tap/click to select a card, tap/click a target to play** on
both — hover on desktop is an extra preview, never the only way to see something. That keeps mobile
nearly free without designing for it twice.

**No `alert()`, `confirm()`, or `prompt()`.** In-page dialogs only.

**Honour `prefers-reduced-motion`.** Skip tweens, keep state changes instant. `space.ts` must also
stop its loop when the tab is hidden or reduced-motion is set — a permanently running canvas is a
battery bug.

**Accessibility: enough, not a research project.** Real `<button>`s and `<a>`s, keyboard reachable,
visible focus, readable contrast, `aria-live` on the combat log and on heat-threshold crossings.

**English only.**

---

## The look

Dark. The game is a lit object in space, not a themed surface — there is no light mode, and
`<meta name="color-scheme" content="dark">` is set deliberately.

**Style against tokens, never hard-coded colours.** `--bg`, `--surface`, `--ink`, `--muted`,
`--line`, `--accent`, plus one accent per stance: IAI hot amber, GUARD cold blue, FLOW pale green.
Add a component and it lands in the scene for free.

**The SHIN/WAR wordmark is inline SVG**, hand-plotted on a 100-unit cap height with an 18-unit
stem. It is not a font and must not become one — the N and W overlap at exact coordinates, and a
real typeface would render that join differently on every device. WAR is painted first, in
`#8c1b1b`, so the N reads over the W where they cross.

**`space.ts` is the asteroid scene** carried over from the old site. It seeds its rock from a fixed
constant so it's the same asteroid every visit, fixes its canvas to the viewport rather than the
document, and stops when the tab is hidden or reduced-motion is set. Honour all three when touching
it. It backs the title and menu screens; the combat stage has its own, quieter background.

---

## Balance

Tune against data, not vibes. `npm run sim` runs the engine headless with a heuristic bot and
reports per-card pick rate against win-rate correlation — the pair is what identifies problems:

- High pick rate **and** high win rate → overpowered.
- Pick rate under ~8% → effectively not in the game.
- Target band is **8–60%** pick rate for every card.

Also watch: win rate by act reached, hull lost per encounter, per-environment win-rate delta,
overheat frequency, and median run length. **Median run target is 45–70 minutes.** With no saves,
a run drifting past 90 minutes is a real problem — cut Act 3's length before cutting anything else.

Target win rate at Depth 0 for a competent player: 40–55%. At Depth 20: 10–20%.

---

## Deploying

```bash
git add -A && git commit -m "..." && git push
```

Cloudflare Pages rebuilds and it's live in about 20 seconds.

> **Changed from the old lab setup.** The repo root is no longer the site. Pages is configured with
> **build command `npm run build`** and **output directory `dist`** — done, August 2026. If the
> deploy ever suddenly serves a stale root, that's still the first thing to check.

If a change doesn't appear, suspect the browser or the Cloudflare edge cache before suspecting the
build. Both have masqueraded as "the deploy failed" here. A cache-busting query string (`?x=1`)
settles it in one request.

---

## Where it is hosted

None of this lives in the repo. It's recorded because it is otherwise invisible from the code, and
rediscovering it costs an afternoon.

| | |
|---|---|
| Host | Cloudflare Pages, project **`shinwar`** |
| Source | GitHub `Shinwaro/shinwar`, branch `main` |
| Build | `npm run build` → `dist` |
| Always-on URL | `shinwar.pages.dev` (independent of the domain; useful when DNS is in doubt) |
| Registrar | Loopia |
| Nameservers | `elmo.ns.cloudflare.com`, `gail.ns.cloudflare.com` |
| DNSSEC | **Off at Loopia, deliberately** |

**The DNS records are managed by Pages, not by hand.** The zone holds exactly two records — the
apex and `www`, both proxied CNAMEs to `shinwar.pages.dev` — and the Pages custom-domain flow wrote
both. Do not add a second record for either name. Cloudflare will occasionally warn that `www` "may
not be proxied" when adding a rule; that warning is wrong, and accepting its offer to create a
proxied record would put a conflicting record alongside the one Pages manages.

**Leave DNSSEC off unless you mean it.** Migrating the nameservers to Cloudflare required removing
the DS record at the `.se` registry *first*. Moving them while it's still published makes every
validating resolver return SERVFAIL, which looks exactly like the domain ceasing to exist. If you
re-enable it, do it at Cloudflare, and only when nothing else is in flight.

**Redirects are dashboard rules, not files.** `_redirects` is inert — Cloudflare Pages matches its
rules on the path only, so a rule whose source starts with `https://` is silently ignored. It never
once fired, and it was deleted at M0; this paragraph is the record of why it existed. Do not
recreate it.

**www → apex is a Cloudflare Redirect Rule** (dash → `shinwar.se` → Rules → Redirect Rules, named
"www to apex"). Wildcard `https://www.*` → `https://${1}`, 301, preserve query string. The `${1}`
capture is the important part: it keeps the path. Verified live — deep paths and query strings both
survive, in one hop, and the apex is untouched.
