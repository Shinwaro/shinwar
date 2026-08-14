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

### A false alarm worth recording

On mobile, `document.documentElement.scrollWidth` reads ~900 against a 375 viewport during combat.
Nothing is actually overflowing: the hand is a horizontal scroll-snap row, and Chrome folds a
scroller's extent into the root's reported `scrollWidth`. `window.scrollTo(600, 0)` leaves `scrollX`
at 0, and no unclipped element exceeds the viewport. Check whether the page actually scrolls before
chasing this one again.
