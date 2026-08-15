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

**M2 complete — a playable Act 1.** A branching star map with environment badges shown before you
commit to a route, node types, rewards with a real Skip, the Safe Planet menu, Alloy, the Station,
the pause screen, replay-from-log, and the `beforeunload` guard. Mapgen's guarantees are asserted
across 1000 seeds.

Before it: **M1** put a fight underneath — stance and heat, the damage pipeline with previews that
cannot disagree with the result, telegraphed intents, and three Act 1 enemies. **M0** laid the
ground — seeded RNG with named streams, the hook bus, the pure reducer, and the content registry.

Ship combat is a separate system and is not built. See [SHIP.md](SHIP.md).

Next is a small animation pass, then M3.
