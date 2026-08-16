# SHINWAR

A space-themed roguelike deckbuilder at [shinwar.se](https://shinwar.se).

You are a ronin of a dead orbital sect, flying a salvaged cutter through a collapsing star
frontier. Card combat with a stance layer, a branching star map, and two progression paths — the
pilot and the ship.

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
| `npm run sim` | headless balance runner (real from M6) |

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
technical contract and milestone order. `NOTES.md` records decisions taken along the way.

## Where to pick up

Read `NOTES.md` first — every decision that is not obvious from the code is in there, newest
milestone last, including the design rulings from playtesting and the balance problems parked for
M6. `SHIP.md` holds the ship-combat design, which is not built and has three open questions at the
bottom that block starting it.

## Status

**M2 complete — a playable Act 1.** A branching star map with environment badges shown before you
commit to a route, node types, rewards with a real Skip, the Safe Planet menu, Alloy, the Station,
the pause screen, replay-from-log, and the `beforeunload` guard. Mapgen's guarantees are asserted
across 1000 seeds.

Before it: **M1** put a fight underneath — stance and heat, the damage pipeline with previews that
cannot disagree with the result, telegraphed intents, and three Act 1 enemies. **M0** laid the
ground — seeded RNG with named streams, the hook bus, the pure reducer, and the content registry.

**M3 is in too — both kinds of combat now exist.** Space nodes open the ship grid instead of the
deckbuilder: modules are rectangles you pack, adjacency pays a bonus for touching, the turn
autoresolves, and you spend one verb plus one aiming decision. Losing a ship fight crashes you rather
than killing you. Plus the loadout screen, elite module drops, and the animation pass.

**Next**, in order:

1. **M4** — events, Threads, the Manifest panel, and the Station shop (which sells modules and card
   removals — both currently missing).
2. **M5** — environments, Acts 2 and 3, bosses, Stance Masteries, the Wavefront.
3. **M6's simulator** is where the balance problems in `NOTES.md` get settled — Focus is overtuned,
   Heat never threatens anything, and ship fights end in about three turns. Tuning any of those by
   hand before the bot exists is guessing.

Two open design questions sit at the bottom of [SHIP.md](SHIP.md).
