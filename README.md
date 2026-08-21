# SHINWAR

A space-themed roguelike deckbuilder at [shinwar.se](https://shinwar.se).

You are a ronin of a dead orbital sect, flying a salvaged cutter through a collapsing star
frontier. Card combat with a stance layer, a branching star map, and a deck you build as you go.

**Nothing is saved.** No accounts, no scores, no local storage. A run is about an hour and it is
meant to be a single sitting. The seed is visible and copyable everywhere, which is the only thing
that survives the tab closing — and it is how bugs get reported.

## Run it

```bash
npm install
npm run dev
```

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck, then bundle to `dist/` |
| `npm run preview` | serve `dist/` locally |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sim` | headless balance runner — `-- --runs 400 --cards` |

## Where things are

```
src/engine/     pure: no DOM, no clock, no Math.random. Enforced by a test.
src/content/    pure data plus hook handlers. One file edit per card.
src/ui/         DOM only. Computes nothing about the game.
src/styles/     tokens, shell, game
sim/            headless bot and balance runner
tests/          guard tests and correctness tests
```

`CLAUDE.md` holds the binding conventions, `DESIGN.md` the design rationale, and `PROMPT.md` the
technical contract and milestone order. `NOTES.md` records decisions taken along the way, and
`CONTENT.md` is the step-by-step for adding a card, an enemy, an Anomaly or a Thread.

## Where to pick up

Read `NOTES.md` first — every decision that is not obvious from the code is in there, newest
milestone last, including the design rulings from playtesting and the balance problems parked for
M6. The ship-combat subsystem was cut in playtest pass 9; `SHIP.md` and the code are in git history
if it ever comes back.

## Status

**M8 — ship it.** The game is complete: three acts, a run of about an hour, and an ending that
says something true about the run you actually had.

What is in it: **91 cards**, **30 enemies** each with its own hand-plotted mark, **29 Anomalies**,
**27 relics**, **11 implants**, **8 environments**, **41 encounters**, **10 Threads**, **4 Stance
Masteries**. One legendary card per run, at the exact middle of Act 2, from an event about the
ronin's past. An introduction that teaches the fight inside a real fight rather than beside one.

The bundle is **269 kB / 78 kB gzipped** of JavaScript and **46 kB / 10 kB gzipped** of CSS, with
**zero runtime dependencies**, no web fonts, no CDN and no network call of any kind — the last is
asserted against the *built bundle*, not just the source.

### How it got here

**M0** laid the ground: seeded RNG with named streams, the hook bus, the pure reducer, the content
registry. **M1** put a fight underneath — stance and heat, a damage pipeline whose previews cannot
disagree with the result, telegraphed intents. **M2** made it a run: a branching star map with
environment badges shown before you commit to a route, rewards with a real Skip, Alloy, the
Station, replay-from-log.

**M3 built the ship — and playtest pass 9 cut it.** Space nodes, the module grid, the packing
puzzle and grid-versus-grid ship combat all existed and all came out: it was a second ruleset you
met four times in an hour, and three reworks each made a better version of a thing that should not
have been separate. There is one combat system now, and it is the deck.

**M4 gave the run a memory** — Anomalies with three real options plus a "leave" that is validated
to be worthless, Threads that come due four or five nodes later, a Manifest always on screen.
**M5 is the whole run** — three acts, three bosses, all eight environments changing the rules for
both sides, Act 3 enemies that counter *your build* rather than out-stat you, and the Wavefront,
which prices every detour to the shop at a row of your lead.

**M6 was content and the simulator**, which arrived with a verdict — attrition was about three
times sustainable, and 86% of runs died in Act 1. That drove the tuning that followed; how far it
moved the win rate has not been re-measured. **M7 was feel**: hit feedback,
screen shake that respects `prefers-reduced-motion`, card motion, the generated epilogue, the
combat-stage background, the introduction, and the marks.

### Known gaps

- **`BALANCE.md` does not exist**, though `CLAUDE.md` points at it as the record of every tuning
  number. The numbers live in `src/content/balance.ts` with comments; the document that explains
  *why* each one is what it is has not been written.
- **The pick-rate pass is not done.** `npm run sim` reports pick rate against win rate and the
  8–60% band, and nobody has yet acted on the table it prints.
- **Depth stops at 5**, deliberately. The ladder is specced to 20.
- **Enemy scaling within an act** is deferred, not cancelled.
