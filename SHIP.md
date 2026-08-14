# Ship combat — the grid

*Status: design. Nothing in this document exists in code yet.*

This supersedes `DESIGN.md` §2's "Path B — The Vessel", which specced the ship as slots plus a
Power budget. The Power budget is replaced by **space on a grid**, and ship combat is not a card
game.

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
| Can it end the run? | **Yes** | **No** — see *Losing*, below |

This is what makes `DESIGN.md` §2's dual progression mechanically load-bearing rather than two
shopping lists: each path is the *only* thing that helps in half the fights, and Alloy is spent on
both. Alloy repairs the cutter but never the ronin, so the two attrition tracks price differently.

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
  is the same decision the Power budget was reaching for, but spatial — and a rectangle that will
  not fit is legible at a glance in a way a number you are under is not.
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

The cannon's drawback feeds the converter, the converter pays for the manipulator, and the
manipulator makes the cannon hit harder. **The build is the strategy.**

Same principle as the card game's stance axis — a small vocabulary whose pieces recontextualise each
other — expressed spatially instead of in a hand.

---

## How a fight plays

**Autoresolve with a small number of high-leverage decisions per turn.** Decided.

Each turn the ship resolves itself: weapons fire, modules convert, the enemy fires back. The player
does not micromanage it. What the player gets is a **small budget of interventions** — one per turn
to start, more from certain modules — chosen from a short list.

The rule that makes this work:

> **Modules grant verbs, not just numbers.**

Your intervention list is a function of what is installed. A ship with no vent module cannot choose
to vent. A ship with a targeting array can choose what to shoot. So the grid does not only decide
how hard you hit — it decides **which decisions you are allowed to make**, which is a far more
interesting thing for a build to determine.

Candidate verbs, each granted by a module:

| Verb | Granted by | Effect |
|---|---|---|
| **Overcharge** | weapon mount | This shot hits much harder and costs extra Heat |
| **Vent** | heat sink | Dump Heat now, out of turn |
| **Target** | sensors | Choose the enemy subsystem this volley hits |
| **Divert** | reactor | Move Energy between systems this turn |
| **Brace** | plating | Reduce incoming damage this turn |

One decision a turn, made from a list you built, with the consequences visible before you commit.
That is FTL's shape, and it is why FTL's ship never stops being a puzzle. It is deliberately *not*
a second card game.

---

## Losing — the crash

**You cannot die in space. You die on the ground.** Decided.

When the cutter's hull reaches 0 you always survive. There is no roll — a die thrown after the plan
has already failed is exactly the output randomness `DESIGN.md` §2 argues against. What is uncertain
is *what it costs you*, never *whether you live*.

But it is a hard punish, and it works on four axes at once:

**1. The ship is broken.** Hull is left at a sliver and modules are knocked offline. Which ones
depends on where the damage landed on the grid, so placement is a defensive decision as well as a
packing problem. You cannot fly out until the drive is repaired.

**2. You arrive hurt.** The crash takes a bite out of the ronin's health — the pool that *can* end
the run. You start the ground sequence already down.

**3. You are stranded somewhere hostile.** The crash injects a **crash site** into the map: a small
pocket of surface nodes you must clear before the ship flies again. Encounters there roll from the
act's **elite** band rather than its normal band, so the "higher than normal chance of dying" is a
real, tunable number rather than a feeling. This is where a run actually ends.

**4. It costs Alloy and it costs time.** Repairing the drive is a purchase, so every Alloy spent
getting off the rock is Alloy not spent on the deck or the ship. And the Wavefront keeps advancing
while you are down there — the crash is a positional punish as well as an economic one.

### Rules that keep it from spiralling

- **The crash pocket is capped at 2–3 nodes** and always ends in a repair node. It is a detour with
  a visible exit, not an open-ended grind. With no saves and a 45–70 minute budget, an unbounded
  "run within a run" is the single most likely way this mechanic wrecks the pacing — so the cap is
  not a tuning number, it is a rule.
- **Each crash strips more than the last.** A second crash recovers fewer modules than the first.
  The escalation lives in what you lose, never in whether you survive.
- **The cost is visible before you commit to the fight.** Routing into a space battle you might lose
  has to be a decision with a known price, not a coin flip you resent afterwards.

### Why this is worth building

It converts a loss into a transition rather than an ending, which is `DESIGN.md` §5's whole
argument. It generates a story out of the systems instead of scripting one — lose the ship, wake up
planetside, hurt, fighting things above your weight to afford a repair. It manufactures the
"desperate" beat from §5's run arc mechanically. And it is what retroactively justifies having two
health pools at all: losing in space stops being a run-ender and becomes a handover to the pool that
is still intact.

It also makes space combat *worth risking*, which is required if ship fights are going to be a route
choice rather than a wall.

---

## Open questions

Fewer than there were. These still block implementation.

1. **Does the grid change mid-combat, or only between fights?** Rearranging under fire is a richer
   puzzle and a much bigger UI. Locking it between fights makes ship combat about preparation, which
   fits autoresolve better. *Leaning: locked during a fight.*

2. **Adjacency.** Does the Thermal Converter need to *touch* the Plasma Cannon's feed, or is the
   grid pure packing? Adjacency makes it a real puzzle and is also the fastest way to make a grid
   frustrating. *Leaning: no adjacency at first — packing plus knocked-out tiles is already two
   spatial concerns, and adjacency can be added later without breaking saved builds (there are none).*

3. **Ship Energy.** Per-turn like the card game's 3, or accumulated across turns? The Thermal
   Converter implies it is spendable and scarce. Accumulation makes long fights snowball, which
   autoresolve may not want.

4. **Resource vocabulary.** Heat and Energy carry over. Singularity is new. Does the ≤14 keyword cap
   cover both systems together or one each? *Recommend: one budget across both — the player learns
   one game, not two.*

5. **Scope and ordering.** This is a second combat system with its own content pool, balance targets
   and simulator support. It roughly doubles what is left to build, and `PROMPT.md`'s milestone
   order does not account for it.

---

## What exists in code today

- `RunState.pilot.health` — the ronin, damaged by personal combat. Can end the run.
- `RunState.ship.hull` — the cutter. Nothing touches it yet. Cannot end the run.
- `RunState.ship.installed` and `powerCapacity` — the old slot/Power model, now known to be wrong.
  It will be **replaced** by the grid, not extended.

Nothing else.
