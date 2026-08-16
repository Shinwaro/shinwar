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

### A false alarm worth recording

On mobile, `document.documentElement.scrollWidth` reads ~900 against a 375 viewport during combat.
Nothing is actually overflowing: the hand is a horizontal scroll-snap row, and Chrome folds a
scroller's extent into the root's reported `scrollWidth`. `window.scrollTo(600, 0)` leaves `scrollX`
at 0, and no unclipped element exceeds the viewport. Check whether the page actually scrolls before
chasing this one again.
