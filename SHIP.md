# Ship combat — the grid

*Status: design captured, not built. Nothing in this document exists in code yet.*

This supersedes `DESIGN.md` §2's "Path B — The Vessel", which specced the ship as slots plus a
Power budget. The Power budget is replaced by **space on a grid**, and ship combat is no longer a
card game at all.

---

## The two kinds of combat

The run contains two entirely different fights, and the map routes you between them.

| | **Personal combat** | **Ship combat** |
|---|---|---|
| Where | On a celestial body | In space |
| System | The deckbuilder — cards, stance, hand, energy | The module grid — no cards, no hand |
| At stake | **The ronin's health** | **The cutter's hull** |
| Progression that applies | The Way: cards, upgrades, Stance Masteries | The Vessel: modules, weapons, grid space |
| Heat | Yes | Yes |

This is what makes `DESIGN.md` §2's dual progression mechanically load-bearing rather than two
shopping lists: each path is the *only* thing that helps in half the fights, and Alloy is spent on
both. It also means Alloy can repair the cutter but never the ronin, so the two attrition tracks
price differently.

**Only personal combat uses a deck.** There is no ship deck and no card is tagged by context.

---

## The grid

The ship is a rectangle. Modules are rectangles that occupy space on it.

```
┌───┬───┬───┬───┬───┐
│ W │ W │   │   │   │
├───┼───┼───┼───┼───┤
│   │ C │ C │   │   │
├───┼───┼───┼───┼───┤
│   │   │   │ S │ S │
└───┴───┴───┴───┴───┘
```

- A tiny module is **1×1**. A powerful reactor is **2×3**.
- Space is the constraint, replacing the Power budget entirely. A great module you have no room for
  is the same decision the Power budget was reaching for, but spatial — and spatial constraints are
  legible at a glance in a way a number is not.
- **Weapons are not part of the grid.** They mount separately.
- You start with a standard weapon, which can be upgraded and later replaced with better ones.

---

## Modules as a conversion network

Modules are not stat sticks. They produce and consume resources, and the interesting builds are
chains where one module's output is another's input.

The worked example:

```
Weapon:  Plasma Cannon        (mounted, not on the grid)
Grid:    Gravity Manipulator
         Singularity Core
         Thermal Converter
```

- **Plasma Cannon** generates Heat.
- **Thermal Converter** converts Heat → Energy.
- **Gravity Manipulator** creates Singularity.
- **Singularity** increases Plasma damage.

So the cannon's drawback feeds the converter, the converter pays for the manipulator, and the
manipulator makes the cannon hit harder. The build is the strategy.

This is the same design principle as the card game's stance axis — a small vocabulary whose pieces
recontextualise each other — expressed spatially instead of in a hand.

---

## Open questions

These block implementation. Nothing below is decided.

1. **What does the player do on a ship-combat turn?** Does the build resolve on its own while the
   player picks targets and timing, or is there a per-turn decision — routing power, choosing which
   module fires, moving something on the grid? "The build is the strategy" could mean the fight is
   mostly execution, but a fight with no decisions in it is a cutscene.

2. **Does the grid change mid-combat, or only between fights?** Rearranging under fire is a much
   richer puzzle and a much bigger UI. Locking it between fights makes ship combat about preparation.

3. **Does damage hit the grid?** FTL-style targeted subsystem damage — a hit knocks out the tile
   your Thermal Converter sits on — would make placement a defensive decision too, not just a
   packing problem. It would also mean losing a module mid-fight, which is a strong FTL beat.

4. **Where does the ship's Energy come from,** and is it per-turn like the card game's 3, or
   accumulated? The Thermal Converter implies Energy is spendable and scarce.

5. **Adjacency.** Does the Thermal Converter need to touch the Plasma Cannon's feed, or is the grid
   purely about packing? Adjacency rules turn packing into a real puzzle, but they are also the
   fastest way to make a grid frustrating.

6. **Resource vocabulary.** Heat and Energy carry over from the card game. Singularity is new. How
   many ship-side resources is too many — and does the ≤14 keyword cap cover both systems or one
   each?

7. **Scope.** This is a second combat system with its own content pool, its own balance targets, and
   its own simulator support. It roughly doubles the remaining build. Does it come before or after
   the card game is tuned and shipped?

---

## What exists in code today

- `RunState.pilot.health` — the ronin, damaged by personal combat.
- `RunState.ship.hull` — the cutter, untouched so far because no space combat exists.
- `RunState.ship.installed` and `powerCapacity` — the old slot/Power model, now known to be wrong.
  It will be replaced by the grid, not extended.

Nothing else. The milestone order in `PROMPT.md` has not been renegotiated to fit this.
