# Adding content

Every kind of content in SHINWAR is **data in one file**. If adding something
requires touching the engine, the effect-op vocabulary is missing something —
extend that instead, and read the last section first.

Nothing here needs a build step. Add the entry, run `npm test`, and the content
validator will tell you what you got wrong before the game ever loads it.

---

## The rule that governs all of it

**Rules text is generated, never written.** `describeCard()` derives the text
from the effect ops. Hand-written rules text drifts from behaviour the moment
you tune a number, and drifted text is the single most common cause of a game
feeling unfair — the player planned around what it said.

`flavor` is the exception and the only one. That is hand-written, and it is
never mechanical.

---

## A card

One entry in the right file under `src/content/cards/`, picked by archetype:

| file | archetype |
|---|---|
| `basic.ts` | the starting deck — do not add here |
| `iai.ts` | `iai` — burst, Focus spending, the decisive strike |
| `guard.ts` | `guard` — Block, Focus banking, venting |
| `overheat.ts` | `overheat` — reads the gauge as a resource |
| `tempo.ts` | the long turn — draw, Energy, whole-turn scaling |
| `neutral.ts` | `neutral` — fits any deck |
| `events.ts` | `exclusive: true` payoffs from a specific Anomaly |

```ts
{
  id: 'rising_cut',            // unique, snake_case, never reused
  name: 'Rising Cut',
  type: 'attack',              // attack | skill | power | status | curse
  rarity: 'uncommon',
  archetype: 'iai',
  cost: 1,
  effects: [{ op: 'damage', amount: 8, target: 'enemy' }],
  stanceRider: {               // optional: what it does in one stance
    stance: 'iai',
    effects: [{ op: 'gainFocus', amount: 1 }],
  },
  upgrade: {                   // required — and must change something
    name: 'Rising Cut+',
    effects: [{ op: 'damage', amount: 12, target: 'enemy' }],
  },
  flavor: 'Up through the guard, because the guard was the invitation.',
}
```

**What the tests will enforce:**

- The upgrade must change the text or the cost. An upgrade that reads identically
  is a reward that does nothing.
- The upgrade keeps the same rarity and a non-empty name.
- `describeCard()` must produce non-empty text.
- A `stanceRider` may only name a stance in `ACTIVE_STANCES`. FLOW is dormant, so
  a FLOW rider is rejected rather than silently dead.
- Every rarity above `basic` must have at least one card in it — an empty tier is
  a weight that silently rerolls.

**Targets** (`SCOPE.targets` in `balance.ts`): ~85 cards. Keep the rarity ladder
top-heavy at the bottom — see `RARITY_WEIGHTS`; a legendary you see every other
screen is a common with a better border.

### The effect ops

`damage`, `block`, `gainFocus`, `gainHeat`, `ventHeat`, `gainEnergy`, `draw`,
`applyStatus`, `changeStance`, `heal`, `exhaustRandom`, `conditional`,
`scaleWith`.

The last two carry most of the interesting design:

```ts
// conditional — a threshold the player can see and play around
{ op: 'conditional',
  when: { kind: 'heatAtLeast', value: 6 },
  then: [{ op: 'damage', amount: 24, target: 'enemy' }],
  else: [{ op: 'damage', amount: 10, target: 'enemy' }] }

// scaleWith — the payoff for a turn you built
{ op: 'scaleWith',
  source: 'cardsPlayedThisTurn', per: 1,
  then: [{ op: 'damage', amount: 3, target: 'enemy' }] }
```

**Before adding an op, check whether `conditional` + `scaleWith` already say it.**
They usually do, and every new op is vocabulary every future author has to learn.

---

## An enemy

One entry under `src/content/enemies/`, by act: `act1.ts`, `act1elites.ts`,
`act2.ts`, `act3.ts`.

An enemy is **moves plus a script**. The AI is data, so adding one stays a single
file edit and the choice stays reproducible from the seed.

```ts
{
  id: 'slag_picker',
  name: 'Slag Picker',
  tier: 'normal',              // normal | elite | boss
  act: 1,
  hp: [24, 32],                // rolled per fight, inside ENEMY_BANDS
  moves: [
    { id: 'rake', label: 'Rake',
      intent: [{ kind: 'attack', amount: 5, times: 2 }],
      effects: [{ op: 'damage', amount: 5, target: 'enemy', times: 2 }] },
    { id: 'shell', label: 'Shell',
      intent: [{ kind: 'block' }],
      effects: [{ op: 'block', amount: 8 }] },
  ],
  script: { kind: 'sequence', moves: ['rake', 'rake', 'shell'] },
  flavor: 'It has been here longer than the wreck it lives in.',
}
```

**`intent` and `effects` must agree.** The intent is what the player plans
against; the effects are what lands. Attack amounts are recomputed at display
time so the telegraphed number is exactly what will hit — including the player's
Vulnerable — but if the two lists describe different moves, nothing catches it
but a playtest.

**Intents commit at telegraph time and never re-roll.** This is a correctness
requirement, not a nicety. A player who plans around a telegraphed 14 and takes
21 will never trust the game again.

Scripts: `{ kind: 'sequence' }` cycles forever; `{ kind: 'weighted' }` rolls with
a per-move repeat cap so nothing can chain the same big hit three times.

Stay inside `ENEMY_BANDS` for the act and tier unless you have a sim run saying
otherwise.

---

## An Anomaly

One entry in `src/content/events/index.ts`. Three real options plus a leave.

```ts
{
  id: 'the_long_dark',
  name: 'The Long Dark',
  acts: [2, 3],                          // omit for all
  text: 'Hand-written framing. Two or three sentences, no mechanics.',
  options: [
    { id: 'wait', label: 'Wait it out',
      detail: 'Hand-written. What it feels like, not what it does.',
      effects: [{ op: 'health', amount: -8 }, { op: 'alloy', amount: 70 }],
      risk: 'The body', payoff: 'Immediate, moderate' },
    // ...
  ],
}
```

The **mechanical line under each option is generated** from its effects by
`describeRunEffect()`. `detail` is the flavour above it. Same rule as cards.

**The leave option must be worthless, and a test asserts it.** An Anomaly where
walking away is correct is not a decision.

Run effects: `alloy`, `health`, `maxHealth`, `card`, `upgradeRandomCard`,
`removeRandomCard`, `setThread`, `resolveThread`, `ambush`.

**Targets:** ~35 events. An event is spent once per run (`seenEvents`), so the
pool size is directly how repetitive a run feels.

---

## A Thread

`src/content/threads.ts`. A Thread is a promise that comes due four or five nodes
later — the run's memory.

```ts
{
  id: 'yard_debt',
  name: 'Yard Debt',
  tone: 'costly',                        // positive | mixed | costly
  omen: 'Someone is owed.',              // the CATEGORY, never the payoff
  description: 'Shown on the Manifest, always visible.',
  trigger: { kind: 'nodes', count: 5 },
  payoff: [{ op: 'ambush', tier: 'elite' }],
}
```

`THREADS.toneMix` is asserted by a test — roughly 30% positive, 40% mixed, 30%
costly, so the pool cannot drift punitive one addition at a time.

The **omen names the category and never the payoff**. Knowing "I am Marked" is
what makes the reprisal feel earned instead of random.

---

## An environment

`src/content/environments.ts`. Two halves, and the split is the important part:

- **`rules`** — anything that *modifies a calculation the engine is producing*.
  Declared data, because a hook fires after a number exists and cannot change it.
- **A hook handler** — anything that *happens at a moment*: a rock at the end of
  the round, a radiation tick.

Getting this backwards is the most common way to introduce a preview that
disagrees with the result.

---

## A relic

`src/content/relics.ts`. Data plus, optionally, a `passive` — the same declared
shape, aggregated by `pilotRules()` and read where the number is produced.

`maxHealth` is the one passive applied once rather than read continuously.

---

## Where the hooks go

Everything extensible hangs off `src/engine/hooks.ts`. Handlers are pure
`(state, payload) => state`, sorted by explicit `priority` then a stable
`sourceId#key` — **never** by insertion order or object identity, or determinism
breaks in ways that take a day to find.

Priority bands live in `HOOK_PRIORITY`. Pick a band, don't guess an integer.

A handler only fires if the run is actually carrying its source —
`activeHookSources()` gates on carried relics, earned masteries, unresolved
threads, the live environment, and statuses in play.

---

## Ask before

Three things are where complexity gets in, and none of them should be added
without a conversation first:

1. **A new effect op.** Check `conditional` + `scaleWith` first.
2. **A new keyword/status.** Cap is 14 (`SCOPE.keywordCap`) and the validator
   enforces it. Depth is supposed to come from stance and heat recontextualising
   a small vocabulary, not from more nouns.
3. **A fourth combat resource.** Energy, Heat and Focus are the three.

---

## Checking your work

```bash
npm test
```

`validateContent()` runs in dev on every boot and in the simulator before it
will run a single game. It resolves every id — statuses, cards, threads,
encounters, environments — and refuses dangling references.

```bash
npm run sim -- --runs 400 --cards
```

Pick rate against win rate. Under 8% and the card is not in the game; over 60%
and it is mandatory. Neither number means anything alone.
