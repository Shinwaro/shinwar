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

**M2 complete — a playable Act 1.** A branching star map with environment badges shown before you
commit to a route, node types, rewards with a real Skip, the Safe Planet menu, Alloy, the Station,
the pause screen, replay-from-log, and the `beforeunload` guard. Mapgen's guarantees are asserted
across 1000 seeds.

Before it: **M1** put a fight underneath — stance and heat, the damage pipeline with previews that
cannot disagree with the result, telegraphed intents, and three Act 1 enemies. **M0** laid the
ground — seeded RNG with named streams, the hook bus, the pure reducer, and the content registry.

**M3 built the ship — and playtest pass 9 cut it.** Space nodes, the module grid, the packing
puzzle, the crash, the loadout screen and grid-versus-grid ship combat all existed and all came out:
it was a second ruleset you met four times in an hour-long run, and three reworks each made it a
better version of a thing that should not have been separate. What survives from M3 is the animation
pass. There is one combat system now, and it is the deck.

**M4 gave the run a memory.** Ten Anomalies, each three real options plus a "leave" that is
validated to be worthless; six Threads that come due four or five nodes later and can hand you an
ally, a bill, or a Vareth reprisal that takes the node it lands on; a Manifest that is always on
screen; and a Station that finally sells cards, a Stance Mastery and a card removal out of the same
Alloy pool. Events are data — a new one is one file edit, and its rules text is generated from its effects.

**M5 is the whole run.** Three acts with their own rosters and three bosses; all eight environments,
shown on the node before you commit to the route and changing the rules of that fight for both
sides; Act 3 enemies that counter *your build* rather than out-stat you; Stance Masteries that
permanently rewrite a stance and make the deck you already have read differently; and the Wavefront
from Act 2, which prices every detour to the shop at a row of your lead.

**Next**, in order:

1. **Finish M6.** The simulator is built and already has a verdict: **attrition is about three
   times sustainable** — 15 health a fight against a 70-health pilot, so 86% of runs end in Act 1
   and nothing has ever won. That is the first thing to tune, and until a run is winnable the
   pick-rate-against-win-rate table can only show half of itself. Content is also short of target:
   41 cards against ~85, 20 enemies against ~28, 10 Anomalies against ~35.
2. **M7** — feel: animation timings, hit feedback, screen shake, the epilogue generator, the
   combat-stage background. Not the Depth ladder — it stops at 5 deliberately.
