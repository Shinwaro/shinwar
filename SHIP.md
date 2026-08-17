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

## Settled

1. **The grid rearranges under fire.** Repositioning is one of the intervention verbs, so it costs
   the turn's action — otherwise it is free optimisation.
2. **Adjacency gives synergies.** A bonus for touching, never a requirement to function, so a badly
   packed ship is weaker and never broken.
3. **Ship Energy is per-turn, like the card game's 3.** Accumulation snowballs long fights, which
   is exactly what autoresolve does not want, and a resource that resets keeps every turn a fresh
   decision. *Taken as a default rather than a considered ruling — say if it should bank.*

## Open questions

Fewer than there were. These still block implementation.

1. **Does the grid change mid-combat, or only between fights?**
   *Leaning: **rearrangeable under fire**.* That makes the grid a live puzzle rather than a loadout
   screen, and it pairs with autoresolve — repositioning becomes one of the high-leverage verbs
   worth spending a turn's intervention on. It is the bigger UI by some distance, and it needs a
   cost (a move probably costs the turn's intervention, or Energy) or it is free optimisation.

2. **Adjacency, with synergies.**
   *Leaning: **yes**.* Modules that touch feed each other — the Thermal Converter wants to sit
   against the Plasma Cannon's feed, and placing it there is the reward. Combined with (1) this is
   the whole game of the grid: what you own, where it sits, and what you shuffle when a hit knocks
   out a tile.
   The known risk is frustration — adjacency puzzles turn punishing fast when the pieces are big and
   the board is small. Mitigations to design in from the start: keep footprints small, keep the
   board generous, and make adjacency a **bonus for touching** rather than a **requirement to
   function**, so a badly packed ship is weaker and never broken.

   *Not to be coded yet — recorded so the grid is not built in a way that forecloses either.*

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

---

## The rework (playtest pass 4)

The grid was a stacking problem with a button on every tile. It is now a packing
problem with a build on it.

**Shapes and rotation.** `Footprint` carries an optional row-major `mask` — `#`
filled, `.` empty — so L, T, S and ring shapes exist, and `PlacedModule.rot`
carries quarter turns. Everything in `grid.ts` works on CELL SETS rather than
bounding boxes, because a box gets both packing and adjacency wrong the moment a
shape has a notch in it: it refuses a 1×1 that belongs in an L's elbow, and it
pays an adjacency bonus for two shapes whose filled cells never actually meet.

Rotation is refused rather than nudged. A rotate that slid the module somewhere
else to make itself fit would undo the packing the player just did around it.

**Passives, not verbs.** Most modules now contribute `ShipStats` — crit chance
and crit damage, flat damage, damage reduction, parry, pierce, shield, lifesteal
and extra shots — and only a handful still grant an intervention. A grid full of
buttons is a grid where the build does nothing until you press something; a grid
of passives is already working, and the one verb a turn is a lever on top of it.

**Scaling is where the builds come from.** A `ShipScaling` entry reads a pool and
turns it into a stat, capped per entry. That makes the fight a curve rather than
a number: a lens that turns Heat into crit is a different ship on turn one than
on turn five, and the weapon that cooks the reactor is what moves it along.
Aggregation happens *after* the producers and converters have run, so the chain
closes inside a single resolve.

The chains the pool is built around, so a new module can be checked against
something rather than eyeballed:

| Build | Chain |
|---|---|
| **Heat** | Plasma Cannon → Pyrometric Lens (Heat into crit) → Kiln Coupler (crit hits harder) |
| **Void** | Gravity Manipulator (Energy into Singularity) → Singularity Core (Singularity into damage) → Collapse Ring (pierce) |
| **Turtle** | Reactive Plating + Ablative Wedge + Mirror Facet: reduction, parry, lifesteal |
| **Swarm** | Autoloader Rack (extra shots) + Whetstone Array (damage per shot) |

**Crit is rolled once per volley, not per shot.** A swarm build would otherwise
crit somewhere every single turn and the stat would stop being a spike and start
being an average.

**The grid grows during the run.** A Station sells a bay extension — width
first, then height, up to `SHIP.targetEndGrid`. That is what makes the bigger
shapes worth rolling at all: a module that will not fit today is a reason to come
back rather than a reason it was worthless.

**`ShipCombatState.triggered` is presentation data in state, deliberately.** The
screen replays the resolver's own firing order to stagger the pop-and-glow, and
it has to be the real order rather than something the UI infers from the grid.

---

## Grid versus grid (playtest pass 8)

The enemy has a grid now, fully visible, and it is the thing you click.

**Subsystems are gone.** A ship's parts are modules from the same pool the
player draws from, packed first-fit onto its own grid at combat start. Its
plating really is plating; its damage really is a Whetstone Array. Both sides
run through the same `shipStats`, so the numbers cannot drift apart — there is
only one of them.

**The volley always goes at the hull.** Aiming a volley at a subsystem and
aiming a strike at a module were the same decision wearing two hats, and having
both meant neither was interesting.

**The strike is free, one a turn, and lasts the fight.** Both halves are
simulator findings rather than taste:

- *Free*, because the Energy gate was never a decision. Every build that could
  afford a strike made one every single turn, and the Void build — whose
  converter eats the whole pool before anything else sees it — could never
  afford one at all. A cost that is either zero or infinite is not a cost.
- *Lasting*, because a disable that wears off moved win rates by a couple of
  points while one that holds turns fights around. It self-limits: after three
  or four strikes there is nothing left worth turning off.

Nothing is permanent past the fight. A wreck is a wreck, and your own grid is
repaired on the way out — the ship is a run-long investment and losing part of
it to one bad turn would make space nodes something to avoid.

**Enemy hulls are modest and the durability lives in their grid.** That is the
whole reason the strike is a decision: a big hull number is something you grind
through, a plating module is something you can choose to turn off.

**Some enemy moves reach into your grid.** Telegraphed a turn ahead like
everything else, taking whatever is contributing most. As a background tax it
changed win rates by a couple of points and added noise; as something you can
see coming, it is a reason to have packed a spare.

### Tuning

`npm run shipsim` drives the real engine — `startShipCombat`, `markStrike`,
`resolveShipTurn` — with a bot that strikes the most valuable module and spends
its verb. Bands: 6–12 turns, 2–5 strikes, a real build clearing Act 1 and
sweating in Act 3, a bare grid losing from Act 2.

Where it landed, 40 fights per build per enemy:

| | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| Heat | 100% / 4.1 turns | 99% / 6.1 | 99% / 7.2 |
| Void | 100% / 4.3 | 100% / 8.5 | 31% / 10.2 |
| Turtle | 100% / 12.0 | 100% / 15.0 | 100% / 16.5 |
| Swarm | 100% / 2.7 | 100% / 2.9 | 100% / 2.8 |
| Bare | 100% / 7.0 | **0%** | **0%** |

Turtle sits above the band and Swarm below it, and that is the archetypes being
different rather than a tuning failure — one wins by still being there, the
other by not needing to be. Void is the weakest and the most fragile. The bare
control losing from Act 2 is the check that the grid is the game.

Two findings the strike is carrying: Act 2 turtle went 0% to 100% with it, and
Act 1 turtle went 15.7 turns to 12.0.
