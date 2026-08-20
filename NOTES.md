# NOTES

Decisions taken that `PROMPT.md`, `DESIGN.md` and `CLAUDE.md` did not specify. Newest milestone
last. If a decision here turns out wrong, change it here as well as in the code.

---

## M0 — clear the ground

### Dependencies

`vite`, `typescript`, `vitest` as specified, plus **`@types/node`**. It ships no runtime code and
reaches nothing in the bundle; it is there because the guard tests grep the source tree with
`node:fs` and because `sim/` runs under bare `node`. If that feels like a crack in "dependencies
stay near zero", the alternative is untyped `require` calls in the tests, which is worse.

Nothing else. No CSS framework, no animation library, no state library, no web fonts, no CDN.

### `.ts` extensions on every relative import

Vite, Vitest and Node's built-in type stripping all resolve `./foo.ts` identically. Extensionless
imports do not work under bare `node`. Writing the extension everywhere is what lets `npm run sim`
be `node sim/index.ts` with no extra dependency and no build step, and it costs three characters.

`allowImportingTsExtensions` and `erasableSyntaxOnly` are both on in `tsconfig.json` to keep that
true. `erasableSyntaxOnly` bans TS syntax that survives to runtime — enums, parameter properties,
namespaces — which is a good constraint regardless.

These are *additional* strictness, not a loosening. The three flags the prompt names (`strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) are all on, along with
`noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters` and `noImplicitOverride`.

### State fields are `T | null`, never optional

`JSON.stringify` drops `undefined`, so an optional field cannot survive a round trip — the
serialization test would fail for a reason that has nothing to do with the bug you were chasing.
`stableStringify` throws on an `undefined` field so the failure names the field instead.

Content *definitions* are not state and use `?` freely.

### `stableStringify` sorts keys

`JSON.stringify` orders keys by insertion, so two equal states built by different code paths
stringify differently. That would make the determinism test a test of construction order. Added
`src/engine/serialize.ts` — one file beyond the layout in `CLAUDE.md`, and the sim and replay both
want it.

### The registry returns definitions sorted by id

Not in registration order. Reward pools, shop stocks and encounter tables iterate these lists; if
their order depended on which file imported which first, a harmless import reshuffle would silently
change every seed. Costs one sort, removes a whole class of impossible-to-find bug.

### Hook bus details

- `HookName` is derived from a `HookPayloads` map, so a hook cannot exist without a declared
  payload shape.
- `AnyHookRegistration` is the payload map distributed over the union. `HookRegistration<HookName>`
  would widen the payload to the union of all payloads and reject every concrete handler —
  contravariance. `defineHook()` keeps inference at the call site.
- Sort key is `priority`, then `sourceId#key`. `key` is only needed when one source registers two
  handlers on the same hook; registering two that would sort identically throws at load.
- Which handlers are *live* comes from `activeHookSources(state)`: installed modules, masteries,
  unresolved threads, the current environment, and every status on either side. Content declares
  behaviour; state decides what is on the ship right now.
- Recursion depth is capped at 16 and **throws in every environment**, not only in dev. An
  unbounded hook cycle takes the tab with it, and it is a content bug wherever it happens.
- A handler that changes state leaves a `kind: 'hook'` log line. Handlers that change nothing are
  silent, so an inert module does not flood the log.

### The log is a rolling window

Capped at 4000 entries, oldest dropped. The source of truth for reproducing a run is
`seed + action log`, not this; the log is the readable narration on top, and an hour-long run
should not grow it without bound.

### The action log records ignored actions

`applyAction` is total — an action that makes no sense in the current phase returns the state
unchanged rather than throwing, so a replayed log never explodes halfway through. The store records
what was *dispatched*, including the ignored ones, because replay must see the same sequence or it
is not a replay.

### Seeds

Two groups of four from a 31-character alphabet with no `0/O` and no `1/I/L` — these get read aloud
and written down. Normalized by trim and upper-case, so `abc ` and `ABC` are the same run. The
engine has no entropy of its own: `formatSeed()` takes an entropy function, and the UI supplies it.

### Depth rules 1–5 only

`DESIGN.md` §7 names five. The remaining fifteen are `null` in `balance.ts` and the title screen
says so out loud ("7 deeper rules are not written yet") rather than showing a bare number that
implies content. Inventing fifteen difficulty rules is design work, and it belongs to M7.

### Purity guard covers `src/content/` too

The prompt specifies `src/engine/`. Content is pure data by the same argument, it passes today, and
extending the grep costs nothing.

### Deferred from M0, deliberately

- **`beforeunload` guard.** Specified for M2. `queries.shouldGuardUnload()` exists and is correct;
  nothing wires it yet, because at M0 there is no run worth protecting.
- **Starting deck and default ship modules.** `createRunState` leaves both empty — the 12 starting
  cards land at M1 and the basic reactor/hull/weapon bay at M3. Registering ids that resolve to
  nothing would defeat the point of the validator.
- **`sim/` is a stub.** It loads content, validates it, and prints a state hash, which proves the
  engine runs headless under `node`. The bot arrives at M6 and must not slip past it.
- **`CombatState` is typed but always `null`.** The fields are fixed by the rules in `PROMPT.md` §5
  and the hook payloads refer to them, so declaring them now costs nothing and gives M1 a spine.

### `_redirects` was deleted

`PROMPT.md` §2 lists it for deletion; `CLAUDE.md` described it as kept "so the original intent is
on record". The file is inert — Cloudflare Pages matches its rules on the path only, so a source
starting with `https://` is silently ignored, and it has never once fired. The intent is recorded
in `CLAUDE.md` prose, which is where it belongs, so the file went. `CLAUDE.md` updated to match.

### Mobile overflow, twice

Two separate causes, both worth remembering because they will recur:

1. Grid items default to `min-width: auto`, so an intrinsically wide child — the wordmark SVG —
   pushes the whole column past the viewport. Fixed with `min-width: 0` on the grid children.
2. An `<input>` carries an intrinsic width from its `size` attribute, and on a flex row that width
   contributes to the container's min-content size **even with `min-width: 0`**. `flex: 1 1 0`
   instead of `1 1 auto` fixes it.

---

## The animation plan

Agreed: **nothing before M2, a small pass right after M2, the real work at M7.**

The small pass is three things and no more — damage numbers rising off the target, HP bars draining
rather than snapping, and a beat between a card leaving the hand and its effect landing. That is
enough to make a state change *readable as a sequence*, which is legibility rather than polish: you
should be able to see the Focus fire before the stance bonus. Screen shake, weapon effects and hit
sparks all wait for M7.

**Built after M2, as planned.** `src/ui/anim.ts`. Exactly the three things and no more.

- **Floating numbers** live in a fixed `.fx-layer` on `document.body`, deliberately outside every
  screen's subtree: screens are replaced wholesale on re-render, and a number mid-flight must not be
  swept away with them. WAAPI drives them so each one removes itself when its animation finishes.
- **Bars drain** via `setBarFill`, which remembers the last width per bar key and starts the new
  element there before moving it to the new value on the next frame. A freshly built element has
  nothing for a CSS transition to transition *from*, which is why the naive version snaps.
- **The beat** is a stagger: floaters are spaced 115ms apart with a 70ms lead, so a card that hits
  twice reads as two blows rather than one number appearing over another.

A fully blocked hit still floats — "blocked" over your shield is the clearest possible confirmation
that the Block did its job, and silence there reads as the game ignoring you.

Two engine log entries gained a `to` field so the stream has one shape: unblockable damage and block
gain. Nothing else in the engine changed, which is the point.

Two constraints on whatever gets built:

- **The engine stays instant.** State transitions are synchronous and pure; only the *rendering* is
  timed. Animation must never gate a state change or the simulator and the tests diverge from the
  game.
- **The combat log is the event stream.** Every state change already appends a log entry in order,
  so the animation layer consumes entries added since the last render and plays them out. It cannot
  desync from what actually happened, and it needs no event system of its own. A few entries will
  want richer `detail` fields; the shape is already right. This is also what makes
  `prefers-reduced-motion` free — skip the timeline, jump to the end state.

## M1 — combat vertical slice

### The preview is a dry run of the real thing

`previewCard` calls `playCard` on the current state and diffs the result. Because state is
immutable, "playing" it costs nothing and throws nothing away.

This is the single most important decision in the milestone. The prompt requires that preview and
resolution call the identical damage function; a dry run goes further — there is no second walk of
the effect ops at all, so a preview cannot drift even if someone adds a modifier to one path and
forgets the other. `previewDamage` is also a literal alias of `computeDamage` rather than a wrapper,
for the same reason.

The cost is that the combat screen runs one dry run per living enemy per render. That is two or
three pure function calls over a small object; it is not worth optimising, and if it ever is, the
answer is to memoise the call, never to hand-roll a second calculation.

### `attacksThisTurn` counts damage instances, not cards

DESIGN.md §1 requires Iai Slash in IAI to total 14: 6 base + 4 rider + 4 stance passive. The rider
is a second `damage` op on the same card, so a naive "first attack card each turn" rule gives it the
+4 twice and lands on 18.

So the counter increments per damage instance and the IAI bonus fires only on instance 0. FLOW's −2
penalty applies to every instance, deliberately — a 3× multi-hit in FLOW loses 6, which is the price
of the extra draw. There is a test for both.

### Enemy AI is data

Two script kinds cover every Act 1 enemy: `sequence` cycles a list, `weighted` rolls on the `combat`
stream with a cap on consecutive repeats. Nobody writes a function to add an enemy. The repeat cap
matters for feel as much as balance — three identical turns in a row reads as a broken enemy rather
than as variance.

### Targets are relative to the actor

From the player, `enemy` means an enemy; from an enemy, `enemy` means you, and `self` means that
enemy. One rule, no special cases, and enemy moves reuse the whole effect vocabulary for free —
the Lathe Drone's Plate is the same `block` op as your Solar Parry.

### Intents: the choice is frozen, the number is not

`intentMoveId` is committed at telegraph time and nothing on the player's turn re-rolls it. But the
numbers shown for that move are recomputed on every read, through the damage pipeline. So making
yourself Vulnerable after seeing a telegraphed 7 updates it to 10 rather than quietly lying.

Freezing the number instead of the choice is the easy mistake here, and it is the one that produces
"it said 7". There are tests for both halves.

### Stance passive resolves before the overheat check

At Heat 7 in IAI you are safe until end of turn, when the stance's +1 puts you at 8 and the check
fires. Ordering it the other way would make IAI strictly better than it reads. It is the bargain the
stance offers, so it happens where the player can see it coming.

### Solar Parry's GUARD rider changed

DESIGN.md §1 specs it as "when you are attacked this turn, deal 4 back". That needs a riposte/thorns
keyword plus a hook handler. **Ask before adding a keyword**, so it is not in — the rider is
`Gain 3 Block. Apply 1 Weak.` instead, which keeps the counter-punch identity using keywords that
already exist. Raise it if the thorns version is wanted; the hook bus already supports it.

Statuses at M1: Vulnerable, Weak, Strength. With Block, Heat, Focus, Exhaust and Innate that is
eight keywords against a cap of fourteen, and the content validator now counts them.

### Card selection is not an action

`Action` has `playCard` and `endTurn` and no `selectCard`. Selecting a card changes nothing about
the world and undoing it costs nothing, so logging it would bloat every replay with noise and stop
the action log being a record of what the player actually decided. Selection lives in the combat
screen's local state.

### Instance uids come from a counter, not the RNG

`RunState.uidCounter`. Burning a die roll to name a card would couple the streams to how many cards
happen to exist, which is exactly the kind of coupling the named streams exist to prevent.

### Files beyond the layout in CLAUDE.md

`combat/piles.ts` (draw/discard/exhaust movement, so the reshuffle rule lives in one place),
`combat/instances.ts` (uid minting and deck building — it holds `buildDeck` so `state.ts` can build
a starting deck without importing the combat loop, which would be an initialisation cycle),
`combat/preview.ts`, and `combat/describe.ts`. `ui/components/` gained `card.ts`, `enemy.ts`,
`gauges.ts` and `log.ts`.

### Deferred from M1, deliberately

- **The pause screen and `P`.** M2, with the rest of the run loop. Every other key in the prompt's
  §9 list is bound.
- **Rewards, map, Alloy.** M2. A win ends the run, and the game-over screen says so rather than
  pretending there is more.
- **`anim.ts` and `a11y.ts`.** Nothing yet needs them; `prefers-reduced-motion` is handled in CSS
  and the live regions are declared where they belong.
- **Only four distinct cards.** DESIGN.md §8 specifies the starting deck exactly: 5 Iai Slash,
  4 Solar Parry, 2 Vector Step, 1 Sever. The deck is meant to be mediocre, and judging whether
  stance and heat carry the game is easier with four cards than with forty. The pool scales at M6.

### M1 revisions after the first playtest

**FLOW is dormant, not deleted.** Robin's call: with a 12-card deck and no engine to feed, a third
stance was bookkeeping rather than decision. `ACTIVE_STANCES` in `balance.ts` is the whole switch —
`cycleStance` walks that array, and a new content validator rejects any card whose rider, `setStance`
or `stanceIs` names a stance not in it, so FLOW content cannot creep back in unnoticed. FLOW's rules
stay in the `STANCES` table and there is a test asserting its extra draw still works if forced, so
the day it returns it returns intact. DESIGN.md §1 specs three stances; this deliberately disagrees.

Vector Step's archetype moved from `flow` to `neutral` — it is the transition card for whatever
stances are in rotation, not a card for one of them.

**Draws are narrated.** The mechanic was correct all along — hand held at 5, the 12 cards stayed
conserved, the reshuffle fired — but nothing in the log said so, and an invisible mechanic reads as
a broken one. Turn-start draws report a count (`Drew 5 cards.`); a draw the player spent a card on
names them (`Drew Sever.`), because that is what they paid for. The reshuffle announces itself too.

The general lesson, worth applying to everything after this: **a state change with no log line is
indistinguishable from a state change that did not happen.** The rule was already written down for
damage; it applies to every mechanic the player is meant to notice.

**Block moved next to the hull bar.** It is the number you check before ending a turn, so it belongs
beside the thing it is protecting rather than in a resource list further down. It stays visible at
zero, dimmed — "I have no Block" is as important to read as "I have 9". Removed from `.resources` so
there is only one Block number on screen.

**`needsTarget` is stance-aware.** Solar Parry's GUARD rider applies Weak to an enemy, which made a
pure defensive card demand a target even in IAI where that rider is dormant. It now only counts the
rider when the rider is live. Aiming a card that does nothing to anyone is friction with no decision
behind it.

**Log lines name things, never ids.** `weak +1 on e12` became `Weak +1 on Lathe Drone`. `combatantName`
is exported from `damage.ts` for it. The log is read by a person.

### Two kinds of combat, and the health split

Robin's design call, recorded in full in `SHIP.md`. The short version: personal combat (on a
celestial body) is the deckbuilder we have; ship combat (in space) is a **different system
entirely** — a spatial module grid with a conversion network, no cards and no hand. `SHIP.md`
supersedes `DESIGN.md` §2's Power-budget ship path.

Done now, because both were settled and neither depends on the open questions:

- **Health split in two.** `pilot.health` is the ronin; `ship.hull` is the cutter. Personal combat
  damages the ronin, which means the fight that exists today was reporting the wrong pool — the top
  bar said HULL and was taking the ronin's damage off it. It says HEALTH now.
- **`hullBelowPct` kept its name.** It is part of the effect-op vocabulary from `PROMPT.md` §6 and
  renaming an op is a vocabulary change, so it stays and reads against whichever pool the current
  fight threatens. Worth revisiting if ship combat ever gets its own conditions.
- The ship's 70 hull is a placeholder. It has never been played and the real number waits on the grid.

Not done: anything grid-shaped. The remaining open questions live in `SHIP.md`, and the biggest is
scope — a second combat system roughly doubles what is left to build, and the milestone order in
`PROMPT.md` has not been renegotiated to fit it.

Since decided, and written into `SHIP.md`:

- **Ship fights autoresolve, with one high-leverage decision per turn.** Not a second card game.
  The rule that carries it: **modules grant verbs, not just numbers** — your intervention list is a
  function of what is installed, so the build decides which decisions you are even allowed to make.
- **You cannot die in space; you die on the ground.** Losing a space battle always crashes you and
  never kills you. No roll — the uncertainty is in what it costs, never in whether you live.
- **The crash is a hard punish on four axes:** the ship is broken and cannot fly until repaired,
  the ronin arrives injured, the crash site is a pocket of surface nodes rolling encounters from the
  act's *elite* band, and the repair costs Alloy while the Wavefront keeps advancing.
- **The crash pocket is capped at 2–3 nodes with a visible exit.** That cap is a rule, not a tuning
  number: with no saves and a 45–70 minute budget, an unbounded run-within-a-run is the likeliest way
  this mechanic wrecks the pacing.

Leaning, recorded so the grid is not built in a way that forecloses either: the grid is
**rearrangeable under fire** (repositioning becomes one of the intervention verbs, and it needs a
cost or it is free optimisation), and modules **gain synergies from adjacency** — as a bonus for
touching, never a requirement to function, so a badly packed ship is weaker and never broken.

Rejected along the way, with reasons, so they do not come back by accident: a Space Invaders style
ship fight (breaks determinism, so it costs the seed, the simulator and the bug-report format — and
losing 50 minutes to a reflex slip is a worse feeling than losing to a bad route), and a random
survival roll on crashing (output randomness delivered as a verdict after the plan already failed).

### M2 — the run loop

**Mapgen retries rather than being clever.** Generation builds a skeleton, assigns types, assigns
encounters, then checks `mapProblems`. If anything fails it rolls again, up to 40 times, and throws
with a message naming the cause. The guarantees are satisfied by construction, so a retry means the
weights and the invariants have drifted apart — which is exactly when you want to be told loudly.

**The adjacency bugs, both of them.** "No two Safe Planets adjacent" and "no repeated encounter"
were first written against the same column one row down. An edge can arrive from a *neighbouring*
column, so a same-column check silently misses most of the cases it exists for. Both now walk the
node's real predecessors. This is the kind of bug the 1000-seed test exists to catch, and it did.

**Node types that resolve to nothing do not generate.** `event` weight is 0 until the event pool
lands at M4, and `?` resolves to combat-or-derelict rather than including an event branch. A node
type on the map that does nothing when entered is worse than one that is not there yet.

Elites and the boss fall back to the normal encounter pool, since their rosters arrive at M5.
Under-tuned beats empty, and a boss node that opens an empty fight is a stuck run.

**Screens have to subscribe.** The app shell swaps screens when the *view* changes, but plenty of
state changes leave the view alone — moving between map nodes, taking a reward card, repairing at a
station. The map and reward screens originally rendered once, so after a `?` resolved to a derelict
and returned you to the map, every node you clicked was one that was no longer reachable and the
game looked frozen. `ui/screen.ts` now owns that pattern: subscribe, re-render, and **unsubscribe on
unmount** — without the last part every screen ever mounted keeps re-rendering into a detached node
for the rest of the run.

**Re-entrant renders.** Replacing the hand removes the focused card, which fires `blur`
synchronously, whose handler asked for another render — landing back inside `replaceChildren` while
the DOM was mid-mutation and throwing `NotFoundError` once per card per turn. Both render paths now
carry a re-entrancy guard. Dropping the nested call is correct as well as safe: the outer render is
already producing the newest state.

**Deferred from M2, deliberately.** The Station sells hull repair only — cards, modules and the
rising card-removal counter arrive with the shop at M4 (`removalsPurchased` and `removalCost` are in
place for it). Anomalies are M4. Acts 2 and 3 are M5, so the Act 1 boss ends the run. The epilogue
generator is M7; the game-over screen gives an honest account and the seed instead.

### The star chart

Robin supplied a reference: a 4X-style star map — glowing coloured points, hairline lanes, dark
sky — with the note "a lot less noise and way cleaner", plus one structural rule: **always the same
starting point, branching out into 3 to 6 different paths.**

**One origin, a real fan.** `RunMap.entries` became `RunMap.startId`. Row 0 is exactly one node,
dead centre, and it fans into 3-6 lanes rolled on the `map` stream. Before the first move the only
reachable node is the origin — you arrive where you arrive, and the choice is which lane out of it
you take. `PROMPT.md` §5's "Act 1 node 1 is always normal combat in Clear Space" now reads
literally: it is one specific node, and mapgen asserts it.

Two invariants came with it: exactly one origin, and **every node reachable from it**. An orphan
node is one the player can see and never visit, which reads as a bug even when it is only decoration.

**Positions are generated, not laid out.** `MapNode` carries `x`/`y` in 0..1, produced with the rest
of the map so the layout is part of the seed — the same seed draws the same sky. Rows drive `y`,
columns drive `x`, and both take a small deterministic jitter: enough to break the grid, not enough
to make a lane cross its neighbour and lie about who connects to whom. The origin and the boss get
no jitter; they are landmarks.

**SVG lanes, real buttons as stars.** The lanes are one SVG layer; the nodes are `<button>`s
positioned over it. SVG gets the hairlines and the glow, and the player still gets genuine buttons
with keyboard reach and a focus ring, which `<circle>` would not.

**Noise discipline.** Only *reachable* nodes carry a caption. The requirement is that a combat's
environment is visible **before the player commits to the route** — that is satisfied by labelling
the three-to-six lanes being chosen between, not by printing fifty captions across the sky.
Everything else is a coloured star, with detail on hover, focus, and in the readout line.

**Three fixes the screenshots caught, in order:**

1. Sizing the star button to its contents put the *box* centre on the lane endpoint, so a labelled
   node hung its dot above the line it was supposed to sit on — and left the hit area 27px tall,
   well under the 44px floor. The button is now a 44×44 target centred on the point, with the label
   floated out of flow beneath it.
2. Auto-centring on the player ran on every render, so glancing at the boss and then hovering
   anything snapped the view back. It now fires only when the position actually moves.
3. A rebuild replaces the scroller, which resets its scroll to the top — so the remembered offset is
   restored on every render that is not a recentre. And the recentre uses `requestAnimationFrame`,
   not a microtask: on a fresh mount the screen is still detached when microtasks run, and setting
   `scrollTop` on an element with no layout does nothing at all.

The run bar was also restacked on narrow screens — it was eating close to a quarter of a phone
screen, which is a quarter less star chart. The seed stays visible there; it is required on the map
screen and is the only thing that survives the tab closing.

### The card pool, the rarity ladder, and the forge preview

**24 cards** (4 basic plus 20 offerable), up from 4. Enough that the reward loop — win, choose, deck evolves — is actually
exercised by play rather than only by a fixture in a test. The pool still scales to ~85 at M6.

No new effect ops were needed, which is the architecture's own report card: Meridian Cut, Criticality,
Counterweight, Momentum and Reactor Lance are all `conditional` and `scaleWith` over the vocabulary
that already existed.

**The ladder is now `basic → common → uncommon → rare → epic → legendary → artifact`.** Above `rare`,
`DESIGN.md` §8's damage curve says nothing, so the intent is written into `types.ts` to stop the new
tiers collapsing into "rare but bigger":

- `epic` — a rule change with a real cost: exhaust, Heat, health.
- `legendary` — run-defining; you build around it.
- `artifact` — unique, and changes how a whole system reads.

The top three tiers are deliberately thin — §9 names reward inflation as a trap, and a legendary you
see every other screen is a common with a better border. A test asserts the top-tier share stays
under 5% in every act, and another asserts every tier actually has cards in it, because an empty tier
is a weight that silently rerolls and quietly changes the whole distribution.

**Honest limitation:** `epic` and above want *persistent* effects to feel their tier, and the `power`
card type is not wired to the hook bus yet. Playing a power would need its id in
`activeHookSources` — a small change, but a real feature. Until then the top tiers are big
conditional one-shots, which is a fair `epic` and a thin `legendary`.

**Naming flag:** "artifact" is implemented as a card rarity, the plain reading of the request. If the
intent was relic-style passive items — a thing you hold rather than draw — that is a different
feature (an item slot plus hook handlers) and would be built differently.

**The forge preview is two-step, not hover.** Pick a card, see exactly what it becomes, then confirm.
Hover would have been cheaper, but a hover-only preview is *no preview at all on a phone*, and the
two-step matches how cards are played in combat. Desktop keeps hover as an extra. Strip got the same
treatment: removing the wrong card is painful enough to deserve a confirmation.

The preview marks **what changed** rather than showing two cards to diff by eye — changed text, a
changed rider, and a changed cost each get called out. `renderCardFace` is shared by the reward
screen and the preview so a card cannot look like two different cards depending on which screen you
meet it on.

### Playtest round two — what changed and why

From Robin playing it. Recorded because several are *design* rulings, not bug fixes.

- **No damage predictions, anywhere.** Not hover-only — removed entirely. "We are not trying to
  handhold the player; the game is supposed to be difficult and involve thinking." The card states
  its effect and the stance strip states the stance; adding them up is the game.
  `previewCard` and the preview-equals-resolution test stay — the guarantee is architectural and
  free to keep — but nothing on the combat screen asks for it.
- **Enemy turns are paced, not instant.** `endTurn` only queues the enemies; the UI dispatches
  `advanceEnemies` on a timer (500ms lead, +500ms per extra blow) and highlights whoever is
  swinging. `endTurnImmediately` runs the whole thing in one call for tests and the simulator, so
  the engine stays instant.
- **Overkill stays wasted.** A card whose first op kills no longer slides its remaining ops onto the
  next enemy. Free damage the player never chose to place is both a gift and a lie about where
  damage lands.
- **The reward pick is changeable.** Choosing only marks the choice; nothing reaches the deck until
  Continue. A screen that locks on the first click punishes reading the third card.
- **Alloy is paid on arrival.** Nobody has ever left money on a reward screen.
- Enemy Block uses the player's shield badge on the health row — Block is not a status.
- The forge preview is a fixed box; it used to resize under the pointer.

### Known balance problems, deferred to the tuning pass

Robin's read after playing, not yet acted on:

- **Focus is overtuned.** `+2 damage per stack` on top of the IAI first-attack bonus stacks too
  hard, and Iai Slash's rider grants Focus *after* spending it, so an IAI deck snowballs.
- **Heat is close to useless.** You never have to worry about it. GUARD vents 2 a turn, Purge Cycle
  and Iron Wake vent more, and nothing forces the gauge upward fast enough for 8 to be a real
  threshold. The whole "safe → strong → greedy → threatened" arc in `DESIGN.md` §1 is currently not
  happening inside a fight.

Both wait for `sim/` at M6 rather than being guessed at now.

## M3 — the ship

Built in three passes: the grid, then ship combat, then the loadout, the crash and elite drops.
`SHIP.md` holds the design; this records what the code actually does and why.

**The Power budget is gone.** Space on a 5×3 grid replaced it outright. `SlotId`, `powerCapacity`
and `installed` are all deleted — the grid is not an extension of the old model, it is a replacement.

**Adjacency counts shared edges, never corners.** Corner-touching reads as "not connected" to anyone
looking at a grid, and a rule the player has to be told is a rule they will get wrong. It is always
a *bonus for touching*, never a requirement to function; a badly packed ship is weaker and never
broken, and there is a test for that.

**Modules tick in placement order, sorted by cell.** Two ships with the same modules in different
cells must resolve identically for a seed, so iteration order can never be array order.

**Modules grant verbs, not just numbers.** The intervention list is a function of what is bolted on.
The weapon mount grants Overcharge by itself, though — agency must never depend on having found the
right module, so an empty grid still gets one thing to do.

**Aiming is not the intervention.** Subsystem targeting is the decision you always get whatever the
grid looks like; the lever is the one the build gave you. Shields cover the hull but not the parts,
which is what keeps aiming live all fight instead of being a turn-one-only move.

**The crash bills you on four axes** — dead drive, modules shaken loose from the last-packed corner
inward, an injured ronin, and a repair cost that rises each time. That last detail turns placement
into a defensive decision as well as a packing puzzle: what you put in the corner is what you lose.
You still cannot die in space.

**Deferred, deliberately:** the Station selling modules is M4's shop. The crash does not yet inject a
node pocket — being stranded is expressed as "space nodes refuse you until repaired" instead, which
delivers the punish without map surgery. `SHIP.md`'s 2–3 node cap still applies if that changes.

**Ship Energy is per-turn rather than banked** — taken as a default, not a considered ruling, and
flagged as such in `SHIP.md`.

**Balance is loose.** A three-turn kill in the first trace. Parked for the simulator alongside the
Focus and Heat problems.

### A false alarm worth recording

On mobile, `document.documentElement.scrollWidth` reads ~900 against a 375 viewport during combat.
Nothing is actually overflowing: the hand is a horizontal scroll-snap row, and Chrome folds a
scroller's extent into the root's reported `scrollWidth`. `window.scrollTo(600, 0)` leaves `scrollX`
at 0, and no unclipped element exceeds the viewport. Check whether the page actually scrolls before
chasing this one again.

## M4 — anomalies, threads, and the shop

**Events needed a second effect vocabulary, and got one.** `RunEffect` sits beside `EffectOp`
rather than extending it. `EffectOp` is combat-scoped and interpreted inside a fight; sharing the
two would have meant every card op had to answer "and what does this do outside combat", which is
how an op vocabulary turns into a scripting language. Twelve run ops, all in `engine/run/effects.ts`,
and adding an event still touches exactly one content file.

**The mechanical line under every option is generated.** `describeRunEffects()` is the same rule as
`describeCard()`, for the same reason — hand-written numbers drift the moment one is tuned. Worse
here than on a card, because an event choice is taken once and cannot be re-read mid-fight. What is
hand-written: the prose, the one-line framing, and the risk/payoff categories.

**Nothing in an event rolls a die behind the player.** Every option states exactly what it does now;
all the uncertainty lives in the Thread it opens. DESIGN.md §4 asks for "legible risk categories
rather than hidden dice", and the cheapest way to guarantee that was to have no dice at all. A
visible gamble ("50/50 for double") is still available later if the pool wants texture — it just is
not needed to make ten events read differently.

**An event never kills you.** Health and hull floor at 1, and a bill bigger than the account takes
what is there rather than being refused. Dying to a menu is the most resented thing a roguelike can
do, because there is no fight you could have played better.

**"Leave" is validated, not just conventioned.** The validator rejects a leave option with any
effects at all. The moment it pays something, every other option on the screen has to beat *it*
instead of beating nothing, and the whole load that option carries is gone. The validator also
insists at least one option per event opens a Thread.

**Threads charge grid space, not Power.** DESIGN.md priced the Clutch at "-1 Power"; with the grid,
the egg is a 1×1 inert `cargo` module. Same decision, expressed spatially, and it reuses everything
`ship/grid.ts` already does. If the grid is full it rides in storage instead — a full grid should
cost you the bonus, not the story.

**`threads.ts` does not apply payoffs.** It reports which threads have come due and the caller
applies them. Otherwise `threads.ts` and `effects.ts` import each other, and a cycle between two
files that both run at module load is a bug waiting for a refactor to find it.

**The clock is nodes entered, not acts.** `ThreadState.progress` is one number, ticked in
`enterNode`. Triggers are 4–5 nodes, which lands a payoff inside the same act while leaving enough
gap that it arrives somewhere you had stopped thinking about it.

**A reprisal takes the node it lands on.** `marked` fires an `ambush`, which replaces whatever that
node was going to be — you never find out, which is exactly what an ambush is. `RunState.forcedTier`
banks the tier so the reward pays what a reprisal is worth rather than what the stolen node was
worth, and it is spent in `concludeNode` so it can never leak into a second fight. The boss node is
exempt from being *replaced* but not from payoffs: the boss must be a culmination, not a curveball.

**Six threads, two per tone.** The 30/40/30 target with a ±10 tolerance means an even split passes,
and an even split is the honest thing to ship at six. The validator holds the ratio as the pool
grows.

**Event-only cards are marked `exclusive` and filtered out of every roll.** A card that is the whole
point of a choice stops being one if you can buy it two nodes later. Same filter feeds rewards and
the shop, from `offerableCards()`.

**A module you already own pays out instead of duplicating.** The grid identifies a module by its id,
so a second copy has nowhere to go — `unplace` and `moveModule` would both pick the wrong one. The
run effect converts it to its shop price. Money is the honest fallback; a dead option is not.

**Shop stock is rolled once and kept in state.** A shop that re-rolls between two renders is a shop
you cannot plan against, and planning against it is the entire activity. Re-entering the same
`nodeId` is a no-op, and every refused purchase returns the *same state object* so the store's
reference-equality check stops it re-rendering the screen.

**The Station is its own screen now.** It outgrew living at the bottom of `safe.ts`.

**The Manifest is on the map and on every between-fights screen**, not behind the pause key. What
you are carrying is part of reading the route. It shows the countdown too — nothing a player could
compute belongs on the hidden list; what stays hidden is the payoff, and the omen names its category.

**Node weights moved.** Anomalies were 0 and are now 15, taken mostly out of `unknown`; a `?` now
resolves to an event 34% of the time. Both were placeholders waiting for this pool.

### Deferred from M4

- The Vareth Hatchling is a card, not an ally. DESIGN.md wants a permanent companion that acts each
  turn; there is no ally system and inventing one for a single thread payoff was the wrong trade.
  `innate` gets most of the feel — it is there at the start of every fight.
- Thread payoffs that inject map nodes. `marked` steals a node instead, which needs no map surgery.
- `requiresThread` on an event option is implemented and unused. It is how a Thread alters a later
  event, which is the half of the Thread model Act 3 will want.

### Balance, unmeasured

Every number in the events, the threads and `SHOP` is a first guess. Card prices ladder 50→340 and
modules 90→520 against Act 1 payouts of 15–25 an encounter, which is deliberately tight — but
nothing here has been near the simulator, and it joins Focus, Heat and ship-fight length on that
list.

## M5 — environments, three acts, masteries, the front

The biggest milestone by surface area. Four systems, and all four rewrite a rule
the player has already learned, which is what made the seams the interesting part.

**Environments split into declared rules and hook handlers, and the split is load-bearing.**
A hook cannot change a number a pipeline is about to produce — it can only react after the fact,
and a handler that "tops up" a result yields a number that is the sum of a recursion rather than a
rule. So anything that modifies a calculation the engine is mid-way through is declared in
`EnvironmentRules` (heat gain, vent multiplier, draw count, a damage multiplier, the stance-change
cap, hidden intents, the double-act round). Anything that happens *at a moment* is a handler
(Radiation Belt's tick, the Debris Field's rock). Stellar Corona was the case that settled it: as a
handler responding to `onHeatGained` by gaining more heat, it re-enters its own hook.

**Chronal Shear queues the enemies twice rather than re-telegraphing.** `advanceEnemyTurn` used to
clear `intentMoveId` unconditionally; it now clears only when the queue is done with that enemy, so
the second activation resolves the move that was already on screen. Intents commit at telegraph
time — a doubling that re-rolled would break that for the one environment most likely to kill you.

**`CombatState.envMemory` is one bag, not six fields.** Two environments need to remember something
across a round. A field each would be six dead fields in every fight without them. It is plain JSON
like the rest of state and only `combat/rules.ts` touches it.

**Masteries are a diff against the stance table, never behaviour.** `stanceRulesFor(state, stance)`
folds every earned Mastery over `STANCES`, and everything that used to read `STANCES[...]` for
behaviour now reads through it — including the damage pipeline, so a Mastery reaches the preview by
construction rather than by being remembered. The stance strip reads the same table, because a strip
still describing the base stance after a Mastery rewrote it is worse than no strip.

**One Mastery per stance, enforced in the roll.** Caught in playtesting: a run held Iron Tide and
Still Water, both GUARD, and they composed by overwriting each other field by field — the second
silently undid half the first while the reward screen claimed otherwise. Two on one stance is now
impossible rather than merely unlikely.

**Masteries are granted, not chosen.** They are the reward for the detour, not a second decision on
top of it. Every one is a trade: a Mastery that is simply better makes its stance mandatory, and a
mandatory stance is the axis collapsing into a stat.

**Act 3's counters are declared where they can be previewed.** Chirality Warden's "60% less over 20"
is a `damageRules` entry read by the pipeline's target-reduction step, so the preview shows the
reduction. Heat Siphon, Null Prism and the Tessellate Shard's shared plating are hooks, because
they act at a moment. Null Prism exhausts the first card *after* it resolves rather than negating
it: a negated card is a turn the player could not have planned.

**Acts carry everything and reset only the sky.** Deck, ship, Alloy, Masteries and outstanding
Threads all survive `advanceAct`; map, position, shop and the front do not. The boss pays out
*before* the act turns over, so the act finale is not the one fight that gives nothing.

**The Wavefront is stated, not inferred.** Every node costs 1 time, a Station or a Safe Planet costs
2, and you only ever advance one row per node — so the doubling *is* the mechanism, and the map says
so in words. Grace is 4, which is exactly the number of free detours in an act. It never blocks a
route and never kills: catching up means the next fight starts with 3 Heat and the enemies one
Strength up. `DESIGN.md` §3 names this as the thing most likely to feel oppressive if tuned badly,
so it is deliberately generous and deliberately legible.

**Act 1 has no front and opens in Clear Space.** Both for the same reason: the opening act is where
the stance layer is still being learned, and a modifier on the first fight buries it.

### Two bugs the playtest found

**`healPlayer` wrote to a field that does not exist.** It set `pilot.hull` — not a field on
`PilotState` — instead of `pilot.health`, so every card with a `heal` op had been doing nothing
since M1. Excess-property checking does not fire through a spread, so nothing caught it.

**Scan could never reach an enemy.** Enemies are only clickable while a card is selected, so "select
a contact, then Scan" was an instruction the screen made impossible to follow. Clicking an unread
contact now scans it directly, and the tray shows the remaining budget rather than pretending to be
the control.

### Balance, unmeasured

Two acts of enemies, three bosses, eight environments, four masteries and the Wavefront's numbers
are all first guesses. A crude bot needed roughly sixty seeds to reach Act 2, which says more about
the bot — it plays every card in hand at the lowest-HP enemy — than about the tuning. Everything
here joins Focus, Heat, ship-fight length and M4's prices on the list `sim/` settles at M6.

## Playtest pass 1 — the debuff bug, and Heat as a real resource

Robin played it and came back with a long list. This is the first half of it.

### The bug behind "mob debuffs don't work"

They didn't. `decayStatuses` ran in `closeRound`, which happens *after* the enemies act, so a
debuff an enemy applied during the enemy phase was stripped in the same breath — applied, logged,
and gone before the player ever took a turn under it. Every enemy debuff in the game had been doing
nothing since M1, and the log line said otherwise.

The fix is a `fresh` flag on `StatusStack`, cleared at the two moments a holder acts: the start of
the player's turn, and the moment an enemy takes its action. Decay skips anything still fresh. That
gives the rule the status table always claimed — one stack falls off at the end of the holder's
turn — for both sides, whichever phase the status arrived in. Subtracting never sets the flag, or a
two-stack debuff would decay forever.

**And they were invisible anyway.** `combat.statuses` had zero references anywhere in `src/ui`.
Enemies had shown their statuses since M1; the player's were rendered nowhere at all, so an enemy
applying Weak was indistinguishable from an enemy doing nothing. Pips now sit under the health bar,
next to the thing they modify.

### Heat and the stances

Robin's read was that Heat never mattered and the stances were too strong. Both were true, and they
were the same problem: IAI handed out +4 on the first attack for free, and the only thing it cost
was 1 Heat that GUARD vented 2 of.

- **IAI's passive is now "attacks spend Focus"**, and GUARD banks it instead. Focus accumulates
  while you hold, and only ever cashes when you change stance — so the axis is a rhythm rather than
  a number, and the stance change *is* the decision. Capped at 12, or the correct play would always
  be to sit in GUARD forever.
- **IAI gains 2 Heat a turn, GUARD vents 1.** The gauge now climbs.
- **Overheat costs a percentage of MAX health and takes your next turn.** A flat 3 stops mattering
  the moment the deck is doing forty a turn, which is exactly why it never registered; a fraction
  scales with the run for free. The lost turn is the real cost — damage heals.
- **The gauge blows to zero on the skipped turn.** Otherwise an overheat at 10 in IAI walks straight
  into another one with no turn in between to do anything about it, and a spiral you cannot act on
  is a death sentence rather than a price. The skipped turn does *not* absorb the critical Energy
  penalty either, which would have refunded half the punishment for the worst overheat there is.
- **Six new Focus cards** so the mechanic has something to stand on, and the IAI masteries were
  rewritten around Focus — Unsheathed Mind doubles what a stack is worth, Banked Fire trades stack
  value for no Heat at all.

### The rest of the list

**An event option you cannot pay for is refused.** The floor that stops an event killing you also
made a big price free the moment you were low enough: "lose 12 hull" with 2 hull left cost two
points and read as a bargain. Options that would take more than you have are now disabled with the
reason on the card, enforced in the reducer rather than only in the UI.

**The hand wraps to a second row** instead of scrolling. A card you have to scroll to find is a card
you forget you are holding. Mobile keeps the scroll-snap row — at 375px a wrapping grid pushes the
hand off the bottom instead of off the side, which is worse.

**Death holds for 2.2 seconds** on the killing blow before the run-over screen. The engine ends the
run the instant health hits zero, so the result used to replace the cause in the same frame. It is
presentation only — the run is already over in state. The first version of this deferred the swap
*forever*: the timer's own re-render walked straight back into the branch that scheduled it, since
every condition was still true.

**Every place on the chart has a short name**, generated with the map and part of the seed. This is
navigational, not flavour: "Kessel Deep, then the Station" is a route you can hold in your head and
"the third dot from the left" is not. Two landmarks are fixed — Arrival, and the act finale.

### Still open from that list

Ship modules are still all verbs and no passives; they want crit, flat damage, damage reduction and
parry, scaling off Heat mid-fight, rotation, more shapes, and adjacency synergies. There is no relic
system, so there is still nothing that permanently raises Energy or draw. Enemy scaling within an
act is untouched. All of that is the next pass.

## Playtest pass 2 — relics, and what a boss is for

"I have yet to see actual items that increase power, and the fact that I have the same amount of
energy and cards every round makes it feel like I'm not progressing at all."

That was exactly right, and it was structural: nothing in the game raised Energy or draw. Modules
only matter in space, cards only make the deck better at what it already does, and the Safe Planet
only ever gave back what you had. There was no power curve.

**Relics are that curve.** Thirteen of them, declared rather than hooked — same split as
environments, for the same reason: every field on `RelicPassive` modifies something the turn loop or
the damage pipeline is already computing, and a hook fires after a calculation rather than inside
it. `pilotRules()` aggregates the carried set in registry order, so two relics touching the same
field always compose the same way for a seed.

**Energy is deliberately the rarest thing on the list**, and there is a test that says so. Energy
multiplies the whole deck rather than adding to it, so a common that granted one would flatten every
tier above it.

**The act finale offers three relics and you take one.** Robin's call, and it is the right one: a
boss should hand you a decision about what the rest of the run is, not a thing that happened to you.
The granted Stance Mastery it replaced was a mandatory rewrite of how the entire deck reads, arriving
without being asked for.

**Masteries moved to the Station**, at 220 Alloy, on a 45% chance per shop. Rewriting a stance is now
something you decide you want and pay for out of the same pool as the card, the module and the
removal — which is what makes it a decision rather than a gift. The cap and the one-per-stance rule
carry over unchanged.

`maxHealth` is the one passive that is not read continuously: it is applied once, when the relic is
taken, and never again. Everything else is a live read, so a relic taken mid-act changes the very
next number the pipeline produces.

### Still open

The ship module rework — passives instead of verbs, crit and parry and flat reduction, scaling off
Heat mid-fight, rotation, more shapes, adjacency synergies, and the pop-and-glow when a module
triggers. That is the next pass, and it is the last of Robin's list.

## Playtest pass 3 — the map, the ship roster, and the long turn

**Acts 2 and 3 had no enemy ships at all.** Every `ShipEnemyDef` was `act: 1`, so `openShipCombat`
filtered the roster down to nothing and quietly returned to the map — the player walked onto a space
node, nothing happened, and the node was spent. That is most of why ship fights felt rare. Four new
enemy ships for Acts 2 and 3, and the lookup now falls back down the acts rather than falling
through to nothing.

**The map was a set of parallel lines.** Six path walks over seven columns with a one-column drift
converge almost immediately, so most rows offered two ways forward and the "choice" was which lane
you happened to be in. Now nine walks plus a weave pass that adds sideways links between what is
already there, capped at three exits so a star never becomes noise. Measured across 600 maps: 45% of
nodes now offer a real choice, up from a map where the number was mostly one.

**Space fights are four in ten**, spread by `(row * 7 + col * 3) % 10` rather than a plain modulus —
`(row + col) % n` puts every space node on the same diagonal, which draws a stripe across the chart
rather than a mix.

**Every place is named, all the time.** The name was previously drawn only on nodes you could reach,
on the theory that fifty labels is noise. But a chart where most of the sky is anonymous cannot be
read ahead, and reading ahead is the whole reason three columns of it are on screen. The name is
always on; the type and environment ride underneath only where you are actually choosing.

**Seven tempo cards** for the long turn: Heat that buys Energy, draw that pays for itself, and two
payoff cards that scale on how much the turn has already done. They are meant to chain — Pressure
Release into Open the Line into Long Form is a turn you build rather than a hand you play. This is
the first content in the pool that makes riding the Heat gauge upward a plan rather than a mistake.

### Still open

The ship module rework, which is now the whole of what is left: cell-mask footprints and rotation,
a passive stat vocabulary (crit, parry, flat reduction, pierce and more) with scaling off the
in-fight pools, adjacency synergies between kinds, grid growth bought during the run, and the
pop-and-glow when a module fires.

## Playtest pass 4 — the grid becomes a build

The last of Robin's list. `SHIP.md` carries the design; this is what changed and
the things that only showed up in the doing.

**Cell sets, not bounding boxes.** This is the whole geometry change. A box test
refuses a 1×1 that belongs in an L's elbow, and it pays an adjacency bonus to two
shapes whose filled cells never meet — both wrong in the direction that makes the
packing puzzle feel arbitrary. `cellsOf`, `canPlace`, `touches` and `usedCells`
all work on the real cells now, and there is a test for each failure mode.

**Rotation normalises back to the origin**, so a turned shape still places from
its own top-left and the player never has to think about where the pivot went.
`distinctRotations` reports what a shape actually has, so a square never offers a
Rotate button that does nothing.

**Stats are declared and aggregated**, the same pattern as relics and
environments, for the same reason — they modify numbers the resolver is in the
middle of producing. Aggregation runs *after* producers and converters, which is
what lets Heat generated by this turn's volley feed this turn's crit chance.

**Every scaling entry is capped, and the test enforces it.** An uncapped
Heat-into-crit entry is a guaranteed crit by turn six, at which point the stat
has stopped being a spike.

**The Ship button says when it wants attention** — unfitted modules in storage
(with a count) or hull below 25%. Both were things you otherwise found out at the
worst possible moment.

**Module tooltips are generated in one place** (`components/moduletip.ts`), used
by the loadout, the shop and the ship fight, and they name the synergy out loud:
"Touching a plating: 15% to parry", or "LINKED to Core Reactor" once it is live.
Adjacency keyed to kinds is invisible otherwise, and a packing puzzle whose rules
you infer from a glowing border is a puzzle nobody solves on purpose.

**The grid grows at Stations** rather than starting big, which is what makes the
larger shapes safe to ship: a module that will not fit today is a reason to come
back.

### Balance, unmeasured

Every stat number, every scaling rate and every cap is a first guess, and the
four build chains have never been played against each other. This is the largest
single block of unmeasured tuning in the game and it goes straight onto M6's list
with the rest.

## Playtest pass 5 — Heat that bites, and a fight you can watch

**Heat: a longer gauge with the line in the middle of it.** 0–20 now, overheating
strictly above 10, IAI cooking 4 a turn and GUARD venting 2. The old shape was
decoration: a 10-point gauge tripping at 8, where GUARD vented more than most
turns generated, so you arrived at the threshold only if you set out to. With the
line at 11 on a 20-point gauge, the top half is somewhere you can choose to live.

**Overheating costs the Energy, not the turn's visibility.** The first version
skipped the turn outright — no draw, no hand, nothing to look at, and the fight
jumped forward while the player was still reading. Now the turn happens
normally, you draw, and Energy is zero: you see exactly the hand you cannot play
and have to end the turn holding it. Same cost, entirely legible, and a relic
that hands the Energy back is now an ordinary thing to write rather than one that
would have to special-case a skipped turn. Heat still blows to zero with it, or
an overheat walks into another one with no playable turn in between.

**Focus is folded into the printed damage.** A card that says 6 and deals 12 is
asking the player to do arithmetic the game already did. The itemisation stays in
the log, where it is the debugger.

**IAI Slash lost its Focus rider.** IAI is where the stack is *spent*; a card
that handed one back on the same swing was quietly refunding the stance's own
cost. And "Iai" reads as a lowercase L in this typeface, so it is IAI everywhere.

**Sensor Fog no longer sells the information back.** Scan is gone entirely —
action, budget, UI. A free reveal once a turn made the environment a click you
paid before getting the telegraph anyway, which is a chore rather than a
condition. Blind is the environment; the answer to it is defensive play.

**Pacing.** Floaters run at 180ms lead and 260ms apart rather than 70/115, the
enemy lead is 750ms, and the enemy turn now waits for the player's numbers to
finish before it starts. A fight where everything arrives in one frame reads as a
spreadsheet updating, and a four-hit card was indistinguishable from a big one.

**The map says what you are walking into.** Encounter name and environment now
get their own lines under the node name, each in its own colour, rather than
being folded into one grey run with the node type. These are the two facts a
route is actually chosen on.

**Space nodes offer a refit and drop salvage.** Two modules on the approach, take
one; one cut out of the wreck on every win. A ship fight used to be whatever your
grid already happened to be — you could see it coming two nodes out and there was
nothing to do about it, because the ship path only moved at Elites and Stations.
The grid is still the limit, so this fills the packing puzzle rather than
inflating power: more parts than cells is the decision.

### Still open

Ship combat itself is still thin — the refit and the salvage give it stakes and
a reason to route toward it, but the fight is one lever and an aiming decision.
Making the turn itself interesting is a separate piece of work.

## Playtest pass 6 — salvage is a choice, and it lands after the fight

**The pre-fight refit is gone.** Handing a module out on the approach to every
space battle made them weightless: a reward that arrives on a schedule is not a
reward, and it filled the grid without the player ever choosing what went on it.

**Three parts off every wreck, take one.** The same screen, moved to the other
side of the fight, where it is a decision about the run made knowing what the
fight cost. The loadout is one click away from it, because "will this even fit"
is half of what is being decided.

**Early ship supply comes from derelicts now.** A `?` that rolls treasure has a
45% chance of holding a module instead of Alloy. That is the right node for it —
it is already the one that might be anything, and a part in a hulk needs no
explaining — and it front-loads naturally, because `?` nodes are thickest early
while the grid is emptiest.

**One spare in the hold at the start.** A 1x1 Heat Sink. Not power: its job is to
make the loadout screen worth opening on turn one rather than after the first
space fight has already gone badly.

## Playtest pass 7 — split damage numbers, marked space nodes, and a simulated fight

**A hit is two numbers now.** 9 damage into 6 Block floats `-6` in blue and `-3`
in red, offset left and right so they read as two facts rather than one number
flickering. The old version printed the word "blocked" on a full absorb and said
nothing at all otherwise, which left the most common question in a fight — "did
my Block do anything" — unanswered on screen.

**Space nodes are marked on the chart.** A blue ring on the star, `· SHIP` on the
caption, and "ship fight" in the accessible label. A space battle is a different
game with a different build behind it, so you route toward or away from one
several nodes out rather than discovering it on arrival.

### The battleship prototype, simulated before building

`npm run shipsim` — 400 fights per build per act, using the real module pool and
the real stat aggregation, modelling both sides having a grid and one 1x1
disabling strike a turn. Five configurations. What it found:

**Energy does not gate the strike.** At a cost of 2, every build that could
afford one struck on *every single turn* — strike count equalled turn count — and
the Void build struck *zero* times in every fight, because its converter eats the
whole Energy pool into Singularity before anything else sees it. So the cost is
either free or infinite, never a decision. That is the strongest argument there
is for taking Energy out of the space fight entirely.

**A temporary disable barely registers.** Comparing no-strikes against
strike-for-two-turns: most win rates moved by a few points. The exception was the
turtle build in Act 2, 59% to 100%.

**A disable that lasts the fight is transformative.** Turtle in Act 3 went 0% to
86%; swarm 1% to 76%. And the strike count *fell* to 2–4 per fight, because you
run out of things worth turning off. That is the shape a decision should have:
finite, front-loaded, and it stops being obvious once the good targets are gone.

**Fights are far too short.** The swarm build ends Act 1 fights in 1.9 turns and
Act 2 in 2.8. Enemy hull needs roughly tripling before any of the above matters.

**The enemy striking back changed almost nothing** — the with-and-without
configurations are within a couple of points everywhere. It is not carrying
weight at these numbers, whatever it does for tension.

### What Backpack Battles actually does

Worth writing down because it argues against the obvious instinct. Its combat is
*fully* automatic — items run on cooldowns, weapons cost Stamina to fire, and the
player makes no decisions at all once the fight starts. Every decision is in the
placement phase. The fight is a readout of the build.

That is the opposite of adding levers to the turn. If SHINWAR's ship fight keeps
a per-turn decision it is closer to Into the Breach than to Backpack Battles, and
the honest synthesis is: make the build carry the fight, and keep exactly one
in-fight decision — which is what the strike is.

## Playtest pass 8 — grid versus grid

The design Robin asked for, built and tuned. `SHIP.md` carries it; this is what
only showed up in the doing.

**The first tuning pass made the game unwinnable.** Tripling enemy hulls without
touching enemy damage produced 0% win rates from Act 2 onward for every build.
The exchange rate is the thing, not either number alone: the cutter's 145 hull,
the enemy's 95–200, weapon damage, and enemy damage per turn all move together
or none of them mean anything.

**The simulator was unfair to Act 3 until it grew the build.** It handed every
act the same four modules, which made Act 3 look impossible when the real
difference was that a player arriving there has salvaged half a dozen. Three
parts in Act 1, five in Act 2, seven by Act 3 — and Act 3 went from 0% to
winnable for three of four builds without a single number changing.

**Extra shots multiply flat damage, and two sources of each is a runaway.** The
Autoloader Rack granting a shot flat and another on adjacency, stacked with two
flat-damage modules, had the swarm build ending Act 3 fights in 2.8 turns. The
adjacency bonus became flat damage instead.

**A build with no offence cannot win by surviving.** The turtle was taking twenty
turns to finish an Act 1 fight, which is not a slow win, it is a spectator sport.
Reactive Plating and Mirror Facet each carry a point or two of damage now.

**`subsystemBroken` is gone**, and with it the last of the old aiming model.

## Playtest pass 9 — the gauge goes back, and the ship comes out

Two decisions from one session, and they are connected: both are about a system
that grew past what it was earning.

### Heat: move the line, not the scale

The gauge went to 20 because Robin asked to "only overheat past 10", and 11 is
unreachable on a ten-point bar. Granting that by doubling the scale was the
mistake. The stance clock doubled with it — IAI 2 -> 4 a turn, GUARD's vent
1 -> 2 — but the **cards did not**. They still gained 2 and 3, and their payoffs
still tested `heatAtLeast` 4, 5, 6 and 8, every one of those written against a
0-10 bar.

So every source of Heat collapsed onto the stance clock. IAI at 4 a turn crossed
the line on turn three whatever you played, and the bill was a zeroed turn plus
~10 health plus a burned card. Robin's report was that overheating went from
"never happens" to "impossible", and both halves of that are correct: it was
unavoidable in IAI and unreachable in GUARD, and in neither case was it a
decision.

Rescaling the cards to match was tried first and reverted at Robin's call. The
gauge is 0-10 again, tripping at 8, with IAI at 2 and GUARD venting 1 — the
numbers from before the change. **The lesson is the general one:** when a
threshold is in the wrong place, move the threshold. Moving the scale underneath
it silently re-points every number that was calibrated against it, and the ones
that break loudest are not the ones that break worst.

Two runaways the doubling had created quietly, worth recording because neither
would have shown up as an error: **Flashpoint** scaled +3 damage *per point* of
Heat, so on a 20-point bar it was a sixty-damage one-cost, and **Reactor Lance**
the same at a smaller ratio. Anything reading a resource as an unbounded input
has to be re-derived when that resource's ceiling moves.

### The ship: one combat system

Cut entirely. Space nodes, the module grid, shapes and rotation, adjacency
synergies, the loadout, the crash, salvage, ship hull, and the grid-versus-grid
fight from pass 8 — all of it.

It was not bad. Pass 8's version simulated cleanly: every real build cleared
Acts 1-2, three of four cleared Act 3, and a grid nobody built lost from Act 2,
which is exactly the shape a build system should have. The problem was never the
tuning. **It was a second ruleset inside a 45-70 minute run, met about four
times.** Three reworks each produced a better version of a thing that should not
have been separate, and that pattern — each pass improving something that keeps
coming back unsatisfying — is the signal that the frame is wrong rather than the
numbers.

What the deletion bought, concretely:

- **One health pool.** The cutter's 145 hull and the ronin's 70 were two
  attrition tracks with two repair economies competing for one Alloy pool. Every
  heal, rest and repair now points at one number.
- **`arena` is gone.** A `space` node and a `surface` node played identically the
  moment the ship fight left, so the distinction was a label with no mechanics
  under it. `NodeType` lost `crash` and `wreck` with it — both were unreachable
  already, expressed as "space nodes refuse you" rather than as injected nodes.
- **Elites and Anomalies pay in Alloy and cards** where they used to pay in
  modules. Event options that cost hull cost health at half the number, since the
  cutter had roughly double the pool.
- **The Station sells three things** instead of five.

Two things worth knowing if it ever comes back. `activeHookSources` gated hook
firing on installed modules, so the hook-ordering tests used the grid purely to
make handlers live — they now ride as unresolved Threads, and the test says so.
And the reward screen already had "pick one of N modules" in it, which is why
salvage folded into it without ceremony rather than needing its own screen.

`SHIP.md` and every deleted file are in git history at `4837c1f`.

## M6, part one — the simulator, and what it said immediately

The bot and the report are built. The tuning pass they exist to inform is
deliberately not done — Robin's call, "we can adjust and balance later" — so this
records what the tool is and the one finding it produced before anyone asked it
anything.

### The bot

`sim/bot.ts` plays through `applyAction` and nothing else. Every decision is an
action a click could produce, so a refused action is a bug in the bot rather than
something to route around, and the runner counts refusals as "stuck" runs and
says so loudly rather than quietly averaging over fewer games than it claims.

It is deliberately not a good player. The bar a fight has to clear is a
competent human who is not solving it perfectly; a bot tuned into a perfect
solver measures the solver. What it must be is *consistent*, so its own choices
come off a counter hashed with the run seed rather than `Math.random`. Two
identical sim invocations print identical reports, which is what makes the
report diffable — and a diff in it is a diff in the game.

Two scoring details that turned out to matter more than the rest:

**Damage is scored against what the target has left, not raw.** Overkill stops
counting, and progress toward a kill is worth more than the same damage spread
across two enemies. Every enemy removed is its whole intent removed from every
future turn — the largest single lever in a fight against more than one thing,
and the bot was materially worse before it knew that.

**Block only counts up to what is actually coming.** A bot that hoards Block
reports fights as safer than they are, because the wasted Block never shows up
as damage taken.

### The finding: attrition is roughly three times sustainable

Even after the focus-fire fix and routing that treats a Safe Planet as the most
valuable node on the chart, **86% of runs end in Act 1** and the win rate is 0%.
This is not the bot being bad. The arithmetic is not close:

- **15.2 health lost per fight**, median, against a **70-health** pilot.
- Act 1 is 15 rows with maybe two Safe Planets on a given route, healing 30% of
  max — about 21 each.
- So a route through Act 1 offers roughly 70 + 42 = 112 health against something
  north of 200 spent.

A concrete opening: two `scrap_hound`s telegraph **18 a turn** at a player who
has 3 Energy and can raise **9 Block** with one Solar Parry. Even spending the
whole turn on defence, the floor is a net loss every turn, and spending the turn
on defence means the fight lasts longer, which costs more turns of 18.

The lever is not one number. Candidates, in the order the sim can test them:
enemy damage bands for Act 1, `safePlanetHealPct`, the number of Safe Planets, or
the starting deck's block density. That is exactly the question the tool now
exists to answer, and answering it by hand first would be the guessing it was
built to replace.

**The card table is live but half-dark.** Pick rate works and is already
interesting — Purge Cycle at 7% and Pressure Release at 2% are cards nobody
takes. Every win rate reads 0% because nothing wins, so pick-against-win — the
pair that actually identifies a problem — cannot say anything until a run is
winnable. Fix difficulty first, then read the table.

### Depth stops at 5

The ladder ran to 20 with rules 6-20 unwritten, so the slider offered fifteen
difficulty levels that played exactly like Depth 5. A difficulty setting that
does nothing is worse than one not offered: you pick 12, die, and learn nothing
about what 12 meant. `MAX_DEPTH` is 5 and `DEPTH_RULES` holds five entries.
Raising it again is that constant plus the entries to go with it — each Depth is
a *rule*, per DESIGN.md §7, so it is five more ideas rather than five more
multipliers.

### Still open in M6

Content is at 41 cards, 20 enemies, 10 events against targets of ~85, ~28 and
~35. `CONTENT.md` is written, which is the thing that makes that scale-up cheap.
`BALANCE.md` waits on the tuning pass, since it is meant to record why each
number is what it is and right now the honest answer is "untested".

## M6, part two — the power curve, because the numbers were never the problem

Robin, after four passes of me tuning enemies down: *"The root of the issue is
that the character doesn't get enough progression through meaningful upgrades.
Nothing changes from the start to the first boss. You're the same character."*

That was the correct diagnosis and mine was not. I had been lowering enemy
numbers to meet a player who never got stronger, which is treating a symptom and
guarantees the game gets easier without ever getting better.

### The measurement that settled it

The simulator was asked to report the curve directly, and it said:

| | start | end of a run |
|---|---|---|
| deck size | 12 | **23** |
| cards forged | 0 | **1.0** |
| relics | 0 | 2.0 |
| masteries | 0 | **0.0** |

The deck nearly doubled and **one card in twenty-three** was ever improved.
Masteries never happened at all. So the only thing that reliably "progressed"
was the number of cards competing to be drawn — which is dilution, not power.
Nothing else moved.

### What was actually wrong, in four places

**Relics were boss-only.** The first one arrived at the *end* of Act 1, so for
the entire first act you were the character you started as. They now drop from
Elites too, which is also the first time routing into an Elite has been worth
anything.

**The Safe Planet asked a false question.** "Rest, or forge, or strip" is only a
decision if you can afford to say no to resting, and a hurt player never can. So
the forge and the strip were offered constantly and taken almost never. The rest
is now automatic on arrival and the menu is what you *improve*. Same node, and
the interesting half survives.

**Alloy did not convert into power.** It bought a card, one forge, one removal
and a Mastery priced at 220 that nobody could reach. So it piled up.

**Nothing raised Energy or draw.** Those are the two numbers that change how many
cards a turn you get to play, and only three relics touched them — from a pool
you saw twice a run.

### Implants

A second item class, and the distinction from relics is the point: **relics are
found, implants are aimed at.** They use the same declared-passive machinery, so
`pilotRules()` aggregates both and nothing downstream knows the difference.

Sold on a Station shelf, two slots, and stackable — counted with multiplicity, so
two Honed Edges really is +4 on every attack for the rest of the run. That is why
`pilot.implants` is a list and not a set. The three run-definers are capped at one
each (an Energy, a card drawn, damage on every attack) so a pile of Alloy cannot
simply buy six Energy; the cheap ones stack to three or four, and choosing two of
those over one Reactor Tuning is a build.

Their text is **generated** from the passive by `describeImplant()`. A permanent
purchase being compared against two others has to say exactly what it will do,
and a hand-written line goes stale the day someone tunes the number.

Also: bosses now grant +8 max health on the way into the next act — the one
progression beat a card reward cannot dilute — and Station and Safe Planet node
weights went up, because at 5 and 4 a player could cross a whole act meeting
neither.

### Where it landed

Across the whole session, at 300 runs:

| | before | after |
|---|---|---|
| runs ending in Act 1 | 86% | **22%** |
| reach Act 3 | 1% | **24%** |
| win rate | 0% | 4% |
| cards forged | — | 2.0 |
| implants fitted | — | 1.0 |

Act 2 is the wall now (55% end there), and the win rate is still far under the
40-55% target. But the shape is right for the first time: the character arrives
at Act 2 measurably different from the one that started, which was the actual
complaint.

**Still thin, and worth saying:** one implant a run is not much of a curve — the
constraint is Station frequency and Alloy income, not the shelf. Masteries are
still at zero even after dropping to 170. And the deck still grows to 24, which
means removal is not keeping up with rewards.

## Playtest pass 10 — spiky damage, enemies that ask different questions, honest tiers

Robin, on the state after the progression pass: the mobs deal no damage at all;
the point is to shield when they attack and find openings to hit back. Every
encounter feels the same, with almost no variation in moveset. And the items are
not equal in power within a tier — "gain 1 Focus a turn" sat a tier *above*
"every attack deals 2 more", which is plainly backwards.

### Flat damage is the failure mode, not high damage

I had cut enemy damage across the board over four passes, which made Block a
passive tax rather than a read. If every turn costs six, you block every turn and
never think about it. The fix is not "more damage" — it is **spiky** damage:

- **Scrap Hound** bites for 11 or snaps for 3x2. Same enemy, two very different
  turns, with a repeat cap so you are choosing rather than guessing.
- **Lathe Drone** runs strike / plate / **press 14** / sap. A fixed cycle with one
  real spike in it, and the spike is always third — a cycle you can learn is a
  cycle you can plan a Block around, which is the entire point of it.

Health per fight went 7.5 -> 9.6 and Act 1 deaths 22% -> 34%, which is the bite
coming back without returning to the 86% it started at.

### Two new statuses, and they are data

`damagePerTurn` and `heatPerTurn` are now fields on `StatusDef`, ticked in one
place by `tickStatuses()`. A poison is a row in a table rather than a handler
somewhere else, and the next status that wants a tick gets the same one instead
of a second copy that drifts.

- **Poison** — unblockable, decays. Block is the answer to nearly everything else
  in this game, so the pressure worth adding is the kind that walks past it. It
  falls off, so it is a reason to hurry rather than a tax.
- **Scald** — Heat per turn. Against a deck that never goes near the overheat
  line this is nothing; against one riding it, it is the whole fight. This is the
  first thing in the game that makes Heat someone else's decision as well as
  yours.

Both tick at the *start* of the turn, after the hand is dealt and the intents are
committed, so the player sees the damage and the Heat before choosing what to
spend the turn on. A clock you only learn about after acting is not a clock, it
is an ambush.

### Two new Act 1 enemies, and they are the puzzles

- **Rust Tick** — the first enemy Block cannot answer. Low damage, poison clock,
  and it burrows for 6 so it is slow to kill. The correct play is to stop
  defending and end it, which is the opposite of everything before it.
- **Kiln Adept** — +2 Strength every third turn. Next to anything else it makes
  target priority a real question, and it puts that question in Act 1 rather than
  Act 3 where focus-fire currently first matters.

New encounters to state those questions plainly: **Nest** (Tick + Hound: the
clock and the wall), **Kindling** (Adept + Wisp: the Adept gets worse every turn
you spend on the Wisp, and the Wisp is Scalding you), and **Stray** (a lone Lathe
Drone, so the opening fight teaches block-the-spike without also asking who to
kill first).

### The tier ladder was backwards

`whetted_edge` — +2 on **every** attack, unconditional, forever — was **common**.
`breath_marker` — +1 Focus a turn, which only IAI ever cashes and only in a build
that wants it — was **uncommon**. Robin caught it; it is exactly inverted.

Retiered on one principle: **how unconditional is it**. Flat damage on every
attack and a card drawn every turn are near-universal, so they cost a tier or two
more than something that needs a build to matter. Whetted Edge is rare, Wide
Aperture is epic, Breath Marker and Bleed Valve are common.

**Elite and boss offers are now single-tier.** Rolling each slot independently
produced screens with a common, a rare and a legendary side by side, which is not
a choice — it is a right answer with two decorations next to it. The tier is
rolled first and all three come from it, so the decision is which effect suits
the build rather than which border is shiniest. Tiers with fewer than three left
are skipped rather than padded, because a padded offer is a mixed offer again.

### Not done, and named so it is not lost

- **Relics still do not interact with cards.** Robin is right that they are
  mostly "+damage" and "-damage taken". The interesting ones would read the play
  — something that pays out on a turn you played four cards, or on the first
  attack after a stance change, or that turns Block into something on a turn you
  did not need it. That needs new hook points, not new numbers.
- **Acts 2 and 3 still have flat rosters.** Only Act 1 got the spike-and-variety
  pass.
- **Card tiers have not been audited** the way relic tiers just were, and the
  same inversion is likely sitting in there.

## Playtest pass 11 — map spacing, and two things that were just wrong

### The reward screen was rendering relics twice

Robin: "when choosing relic after fights the 3 appear in 2 rows with the same
cards." A real bug, and mine. When ship combat came out I removed the module
shelf from `reward.ts` with a text slice that ran from the first
`offer.moduleIds` block to the relic block — which left the relic block
duplicated verbatim. Both copies rendered, both were live, and clicking either
worked, so nothing failed loudly.

The lesson is about the tool, not the bug: slicing source by searching for a
marker will happily leave a duplicate when the same marker appears twice. A
`grep -c` on the surviving marker afterwards would have caught it in one command.

### Safe Planets are kept two nodes apart, along paths

`afterSafe` only looked one row back, so two rests could sit with a single node
between them — you arrive at the second still full, and the choice the node
exists for is wasted. `typesWithin()` now walks predecessors `MAP.safeSpacing`
rows deep along real edges.

Along **edges**, not rows: two rests side by side in the same row are fine,
because no single route takes both. What matters is what you meet in sequence.

One thing looking backwards could not catch: the guaranteed rest-before-boss row
is placed unconditionally rather than rolled, so nothing stopped a rolled rest
landing just in front of it. That window is closed by hand. Verified at 0
violations across 900 maps with a minimum of 4 rests each, and there is now an
invariant test over 1000 seeds so it cannot drift back.

Anomalies went 15 -> 20 and Elites 10 -> 14, out of combat's share. Anomalies are
the most varied thing on the map, so the map is duller when they are rare; Elites
are now worth routing to since they drop a single-tier relic offer. The mix lands
at roughly 19% Anomaly, 10% Elite, 10% Safe.

### Block no longer gives up before the blow lands

The engine drops Block at the start of your turn — GUARD keeps 3 — and that
happens in the *same dispatch* as the last enemy's blow. The screen therefore
snapped the shield to 3 while the damage numbers from the hit it had just
absorbed were still in the air, which reads as the armour quitting early.

Fixed in presentation only, because the engine was already right: the displayed
number is held at its old value until the floaters land, then released. Held only
when Block **fell** — a gain shows immediately, since that is the player's own
card doing something and there is nothing to wait for.

## Debris Field: "highest HP" was never neutral

Robin: the Debris Field punishes the player for having more health than the mobs.
Correct, and it is the kind of unfairness that reads as neutral on the page.

The rule was "the rock hits the highest-HP combatant". The ronin has 70 health;
an Act 1 enemy has twenty-something. So it resolved to the player nearly every
round — a flat 7 a round dressed as a hazard, charged for precisely the thing
that keeps a run alive. Measured against a `hound_pair`, the old rule marked the
player essentially 100% of the time.

Now it draws uniformly from everyone still standing, on the `combat` stream, and
still marks a full turn ahead so the telegraph is unchanged. Same measurement:
**35.2% player, 64.8% an enemy** across 600 fights — which is 1-in-3 in a
three-combatant fight, i.e. exactly uniform.

Two things worth keeping:

**The break falls out of the rule rather than being written into it.** A fight
with two enemies is a fight where the rock probably hits something else. That is
a fair consequence of "pick anyone", not a designed favour, and it means the
environment reads differently in a pack fight than in a duel without a special
case saying so.

**`combatants()` no longer carries `hp`.** Nothing sorts by it any more, and a
helper that offers an `hp` field next to a list of targets is an invitation to
write another rule that quietly means "the player". Removing the field is the
part that stops this recurring.

The test that replaced the old one asserts the property rather than the
mechanism: across 40 seeds the mark must land on more than one kind of target.
The old test asserted `toBe('player')` — it was encoding the bug as the spec.

## Playtest pass 12 — relics that watch you, acts that vary, tiers that don't lie

### Relics were never wired to the hook bus

The interesting relics — the ones that pay out for a stance change, a fourth card
in a turn, a kill — are written as handlers rather than passives. They fired
nothing. `activeHookSources()` gated on masteries, threads, environments and
statuses, and **relics were simply not in the list**.

Silent, and that is the part worth remembering: an unfired hook looks exactly
like a hook with nothing to do. Five relics would have shipped saying they did
something and doing nothing at all. Caught by smoke-testing one by hand rather
than by any test, so there is now a test that plays a stance-change card while
carrying Turning Point and asserts Focus actually moves.

Implants are in the same list now, ahead of needing it.

### Five relics that read the play

- **Turning Point** — 2 Focus whenever you change stance. Pays for the rhythm the
  stance layer is built around.
- **Kindling Ledger** — draw when you vent. Makes Heat management draw cards
  rather than only avoid damage.
- **Momentum Core** — 1 Energy when an enemy dies. Rewards focus-fire, which is
  the tactical lesson the game most wants taught.
- **Long Form** — 1 Focus on every fourth card in a turn. Only a deck that can
  build a long turn ever sees it.
- **Backdraft** — draw 2 when you overheat. Turns the punishment into something
  you can build toward on purpose.

None carry a passive. The whole effect is the hook, which is exactly why they can
care about *when* rather than only *how much* — the thing the old pool could not
express.

The pool test that demanded every relic have a passive had to be widened: it was
quietly defining a relic as a bag of stat modifiers, which is most of why the
pool read as "+damage" and "-damage taken" for so long.

### Acts 2 and 3 get the questions Act 1 got

- **Bloom Weevil** (Act 2) — 62 health, almost no damage, and it seeds Poison 4.
  It cannot be out-blocked and cannot be ignored.
- **Rimewake** (Act 3) — +3 Strength every third turn on a three-hit move, plus
  Scald. A fight you cannot finish becomes one you cannot survive, and the
  obvious answer — turtle and grind — walks you into an overheat instead.

Plus real spikes where there were none: Sable Drifter 13 -> 19, Chirality Warden
15 -> 24. And encounters that state the question: **Bloom** (a clock that cannot
be blocked next to a spike that must be), **Screen** (Rimewake growing behind a
Tessellate Shard that blocks for it).

### The card ladder was inverted too

Exactly the shape Robin found in the relics:

- **Bulwark**, common, 1 Energy: **8 Block**. **Deflection Field**, uncommon, 1
  Energy: **5 Block**. A strictly worse card, one tier up. Now 11.
- **Standing Wave**, *epic*, 2 Energy, exhausts: **10 Block** — two less than the
  uncommon Iron Wake, and gone afterwards. Now 24.
- **Crossing Arc**, rare, 1 Energy, printed **6 damage** when the 0-cost common
  Hairline prints 4. Now 9.
- **Vareth Hatchling**, legendary: 5 damage and 3 Block. Now 9 and 6.

The principle, same as the relics: **price the unconditional part**. A tier is a
promise about the floor, not about the ceiling in the one build that wants it.

## The fine print

Robin asked what Exhaust means. Nothing in the game said, which is the answer to
the question underneath the question.

**Exhaust: the card leaves the fight when played.** It goes to the exhaust pile
rather than the discard, and the reshuffle only ever pulls from the discard — so
you get it once per combat and then it is gone until the next one.

Every card now carries a glossary of the terms it actually uses, in fine print
under the rules line, above the flavour. Three decisions in it worth keeping:

**Driven off the generated text, not the ops.** What needs explaining is what the
player can *see*. If a word is not printed on the card, explaining it there is
answering a question nobody asked. It picks up rider keywords for free, which is
why Standing Wave explains Weak — its GUARD rider applies it, and that is printed.

**Statuses are not restated.** `glossaryFor()` reads a status's own `text` out of
`statuses.ts`. Two copies of "Vulnerable takes 50% more damage" is precisely how
one of them ends up wrong after a tuning pass, and the whole reason card text is
generated in the first place.

**It is in the hand too, smaller, not hidden.** The first version hid it in the
hand to protect the layout — but mid-fight is exactly when "what does Exhaust
mean" gets asked, and a glossary you have to leave the fight to read is not
answering the question. 8.8px in hand, and typically two of five cards carry a
line at all.

`src/content/keywords.ts` holds the vocabulary that has no status row: Exhaust,
Innate, Block, Heat, Focus, Energy. Adding a term is one entry there.

## Playtest pass 13 — arriving somewhere

### The hover flicker, properly this time

The first fix was wrong in an instructive way. The lift was `translateY(-3px)`,
which near a card's lower edge moves it out from under the cursor: un-hover,
drop back under the cursor, hover again. I "fixed" it with a transparent pad
hanging 14px below each card — and the hand's row gap is about 9.6px, so on a
wrapped hand the pad covered the row below and stole *its* hover instead. That
is exactly why Robin reported it as still present and "kinda random".

Hover now changes no geometry at all: border and shadow only. Nothing that
responds to the pointer's position can move the element away from the pointer.
The lift survives on `is-selected`, which is driven by a click rather than by
where the mouse is, so it cannot feed back into itself.

**The general rule worth keeping: never let `:hover` change layout or position.**
Any geometry change on hover is a potential oscillator, and the ones that only
trigger near an edge look random from the outside.

### Landing on a place

A node used to resolve on the click, so setting down somewhere empty was
indistinguishable from a misclick — nothing happened and the map came back. Now
the chart goes dark, the place names itself, and what is there says so:

> You set down on **Arrival**
> You are met by a Kiln Adept and a Cinder Wisp.

Generated from the node, like every other line the player reads, so it can never
promise a fight that is not there. Enemies are named because that is information
as well as atmosphere — the first look at the fight, a beat before the fight.
Where there is nothing, it says that plainly; naming the emptiness is what turns
a dead node into a place you visited.

It holds for 2.6s and leaves on any click or key. Never *only* on a timer: a
screen you cannot dismiss is one that feels broken the second time you read it.

### Threads were never broken, only invisible

Robin asked whether Threads do anything. They always did — `settleThreads` fires
the payoff on arrival. The problem was entirely where it landed: log lines,
written while the map was re-rendering, in a panel nobody reads mid-route. A
promise made five nodes ago paid out into scrollback.

`settleThreads` now returns its lines, and the arrival screen shows them under
the place description — the Thread named, then what it cost or gave. The beat
where "what just happened" belongs.

**Worth remembering: a system that fires correctly and reports into a log the
player never opens is indistinguishable from a system that does nothing.** The
bug report was "do these work?" and the answer was yes, which was not the point.

### No two blank nodes in a row

`event` and `unknown` are the two types that show no encounter on the chart, and
41% of their exits led into another one — so walking two nodes and fighting
nothing was ordinary. Zero across 900 maps now, with an invariant test over 1000
seeds. The mix stays healthy: 38% combat, 15% unknown, 13% station, 11% each of
event and elite, 10% safe.

One row of lookback is enough. It is consecutive pairs that read as empty, not a
high overall share of them — the constraint should be as narrow as the complaint.
