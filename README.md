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

## Status

**M1 complete — one playable fight.** Stance and Heat, energy/draw/block, the damage pipeline with
previews, the two-step selection model, telegraphed enemy intents, the 12-card starting deck, three
Act 1 enemies with real AI, the combat log, and win/lose.

M0 before it laid the ground: toolchain, the seeded RNG with named streams, the hook bus, the pure
reducer, the content registry with validation, and the title screen.

Next is M2 — the run loop: Act 1 mapgen, node types, rewards, the Safe Planet menu, Alloy, the
pause screen, replay-from-log, and the `beforeunload` guard.
