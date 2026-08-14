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
