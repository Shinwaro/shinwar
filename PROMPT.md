# Build Prompt — SHINWAR

**How to use this file.** It's already in the repo root alongside `CLAUDE.md` and `DESIGN.md`. Open Claude Code at the repo root and say:

> Read PROMPT.md, CLAUDE.md and DESIGN.md. Build Milestone 0, then stop.

Then go milestone by milestone. **Do not let it build more than one milestone at a time.** M1 is the one that matters — you need to play the combat before there are eighty cards depending on it.

---

---

# PROJECT: SHINWAR

You are building **Shinwar**, a space-themed roguelike deckbuilder, at `shinwar.se`. The player is a ronin of a dead orbital sect — a space samurai — flying a salvaged cutter through a collapsing star frontier. Inspired by Slay the Spire, FTL, Into the Breach, and Monster Train.

**The repo is the game.** It currently contains a small "lab" site of unrelated experiments; Milestone 0 removes it. Nothing from the old site survives except two assets, named below.

Read `CLAUDE.md` for the repo's binding conventions and `DESIGN.md` for the design rationale. **This prompt is the technical contract; `DESIGN.md` is the intent; `CLAUDE.md` overrides both.** Where they conflict, ask.

This is a long-lived project I'll extend for months. **Optimize every decision for extensibility and for my ability to add content without touching engine code.** A shortcut that makes the tenth card easy and the hundredth card hard is a bug.

---

## 1. Stack and constraints

**TypeScript strict, Vite, Vitest. No UI framework.** Plain DOM plus CSS, `<canvas>` for the starfield and combat effects only. Build output is a static bundle in `dist/`.

`tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Turning any of these off is a design smell — tell me instead.

**Dependencies stay near zero.** Vite, TypeScript, Vitest. Ask before adding anything else.

**No persistence, at all.** No `localStorage`, `sessionStorage`, cookies, IndexedDB, analytics, or network calls. Close the tab, lose the run. This is deliberate — see §3. A grep test enforces it.

**Desktop-first, mobile playable.** See §9.

**No web fonts, no CDN.** System font stack.

---

## 2. Milestone 0 — clear the ground

Do this first and stop.

**Delete:** `experiments.js`, `x/` (both `deep-run` and `reaction-time`), `404.html`, `_redirects`, `assets/index.js`, `assets/shell.css`, and the existing root `index.html`. They're in git history if I ever want them back. Commit the deletion separately from the new scaffold so the diff stays readable.

**Keep two things, and port them:**

1. **The SHIN/WAR wordmark** — the inline SVG in the old `index.html`. Hand-plotted on a 100-unit cap height with an 18-unit stem, WAR painted first in `#8c1b1b` so the N crosses over the W. Move it into a TS component that returns the SVG. **Do not convert it to a font, do not "clean up" the path coordinates, do not re-plot it.** The overlap only lands correctly because the numbers are exact. It becomes the title screen logo.

2. **`assets/space.js`** — the seeded asteroid-and-debris canvas. Port it to `src/ui/space.ts` with types. Preserve all three of its properties: fixed seed constant so it's the same rock every visit, canvas fixed to the viewport rather than the document, and the loop stops when the tab is hidden or `prefers-reduced-motion` is set. It backs the title and menu screens.

**Then scaffold:** `package.json`, Vite config, `tsconfig.json`, Vitest, the folder layout from `CLAUDE.md`, `src/engine/rng.ts` with named streams, `hooks.ts`, `state.ts`, `types.ts`, an empty content registry with dev-mode validation, and the guard tests from §10. A title screen showing the wordmark over the asteroid, with a Depth selector and a seed field, that starts a run and dumps state as JSON.

**Also update Cloudflare Pages:** the project currently has no build command because the repo root was the site. It now needs build command `npm run build` and output directory `dist`. I'll make that change in the dashboard — remind me at M0 and again at M8, because a stale config will serve the old deleted site and look exactly like a broken deploy.

---

## 3. Design changes from DESIGN.md

`DESIGN.md` §7 specs unlocks, a Codex, and a persistent Depth ladder. All need storage. **Cut them.**

- **Everything available from run one.** All cards, modules, events, ship hulls in the pool immediately. No unlocks, no grind.
- **Depth is a title-screen setting**, 0–20, chosen before the run. Each Depth adds one rule, never just +HP.
- **Run epilogue still happens** — generated text on the game-over screen, not logged anywhere.

This is better than what `DESIGN.md` proposed. That document argues at length against grind-gating; the no-storage rule just enforces the argument.

**Run length target is 45–70 minutes**, up from the 35–50 in `DESIGN.md` §8. Scale Act lengths accordingly — three acts, with Act 2 the longest and Act 3 the tightest and most dangerous. With no saves, a run past 90 minutes is a genuine problem; treat the simulator's median-turn output as a budget, not a target.

**Two mitigations for the no-saves rule, both required:**
- `beforeunload` guard during an active run. Standard browser confirmation, not a JS dialog. Only during a live run.
- The seed is visible and one-click copyable on the title, map, pause, and game-over screens, and can be typed in to start. That's not persistence, it's a number I can write down — and it's how I'll report bugs to you.

Everything else in `DESIGN.md` stands: Stance and Heat, the dual Pilot/Ship progression, Reactor Power as the ship's deck-size constraint, environments as visible route decisions, Threads, the run arc, the balance numbers in §8.

**Because runs are now an hour, enable the Wavefront** (`DESIGN.md` §3) from Act 2 rather than Act 3 only. An hour-long run needs pacing pressure earlier or the midgame sags. Tune it generously at first.

---

## 4. Architecture — the non-negotiables

1. **`src/engine/` is pure.** No DOM, no `window`, no `document`, no `Date.now()`, no `Math.random()`. Enforced by a test.
2. **One seeded PRNG in state, named independent streams:** `map`, `combat`, `rewards`, `events`, `shop`. Mulberry32. Adding a combat roll must never change generated maps for a seed — there's a test for exactly that.
3. **Pure immutable transitions:** `applyAction(state, action) => newState`. `GameState` stays JSON-serializable — no classes, no `Map`, no `Set`, no stored functions.
4. **Therefore `seed + action log` reproduces any run.** Build replay-from-log as a real feature at M2 and use it in tests.
5. **UI computes nothing.** Reads state, renders, dispatches. Needs a number? Calls an engine query — the same one the resolver uses.
6. **One damage pipeline.** Preview and resolution call the identical function.
7. **Content is data.** One file edit per card.

### The hook bus — build this first

`src/engine/hooks.ts`. Pure deterministic pub/sub. Modules, statuses, masteries, environments, and card powers all subscribe here. It's what makes synergy emergent instead of special-cased.

```ts
type HookName =
  | 'onCombatStart' | 'onCombatEnd'
  | 'onTurnStart'   | 'onTurnEnd'   | 'onRoundStart' | 'onRoundEnd'
  | 'onCardPlayed'  | 'onCardDrawn' | 'onCardExhausted'
  | 'onStanceChange'
  | 'onHeatGained'  | 'onHeatVented'| 'onOverheat'
  | 'onDamageDealt' | 'onDamageTaken' | 'onBlockGained'
  | 'onEnemyKilled' | 'onPlayerDeath'
  | 'onNodeEntered' | 'onRewardOffered' | 'onShopStocked'
  | 'onThreadSet'   | 'onThreadResolved';

interface HookHandler<T> {
  id: string;       // source: module/status/mastery id
  priority: number; // lower runs first; document defaults in BALANCE.md
  handle(state: GameState, payload: T): GameState;
}
```

Handlers are pure. **Ordering is by `priority`, then a stable registration key — never insertion order or object identity.** Recursion depth counter that throws loudly in dev. Every firing appends a log entry (§7).

Once this exists, a ship module is *just* data plus a handler. So is a mastery, a status, an environment. That uniformity is the entire point.

---

## 5. Core rules

`DESIGN.md` explains why. `src/content/balance.ts` holds every number so I can tune without touching logic.

**Combat loop:** `startPlayerTurn → play cards → endPlayerTurn → resolveHeat → enemyTurns → startRound`. Energy 3/turn, unspent lost. Draw 5, modified by stance and modules. Reshuffle from discard using the `combat` stream. Block resets at turn start; GUARD retains 3.

**Stance** — always exactly one, drives conditional card riders:

| Stance | Passive |
|---|---|
| **IAI** | First attack each turn +4 damage. Gain 1 Heat at end of turn. |
| **GUARD** | Vent 2 Heat at end of turn. Retain 3 Block at turn start. |
| **FLOW** | Draw +1 each turn. Attacks deal 2 less. |

Cards may carry a `stanceRider`. **The UI must show the rider highlighted when active and greyed when not.** This is the single most important readability requirement in the game — a player who can't see at a glance which half of a card is live can't plan.

**Heat** — per-combat, 0–10, starts at 0 (modifiable by modules). Does not decay; must be vented.
- End of player turn, `heat >= 8`: take `(heat - 7) * 3` damage and exhaust a random card from hand (`combat` stream). At `heat >= 10`, additionally lose 1 Energy next turn.
- Always shown as an exact number with the threshold and its consequence spelled out.

**Focus** — stacking buff, consumed on next attack for `+2 damage per stack`, then reset. Not a spendable resource.

### Damage pipeline (`engine/combat/damage.ts`)

An ordered array of named pure steps, `(ctx: DamageContext) => DamageContext`:

1. base
2. `+ Focus * 2` (attacks only; flag for consumption)
3. flat additives (Strength-likes, stance bonus, module flats)
4. multiplicatives (Vulnerable, Weak, environment)
5. target-side reductions (armour, plating)
6. Block absorption
7. floor at 0, round down

`previewDamage(state, source, target, effect): DamageBreakdown` returns the final number **and the itemized steps**, so the UI shows `8 base +4 IAI ×1.5 Vulnerable = 18`. The resolver calls the same function. Never write a second damage calculation anywhere.

### Enemy intents

Telegraphed at the start of the player's turn with **exact numbers**. Multi-hit renders `3 × 5`. Buffs named explicitly. AI is a small per-enemy script (state machine or weighted pattern, `combat` stream). **Intents commit at telegraph time and do not re-roll after the player acts.** Correctness requirement.

### Ship & Power

Slots: `reactor | hull | drive | sensors | weapons | cargo`. Modules draw Power; reactors supply it. Installing over budget is rejected with a clear reason and a prompt showing exactly what to un-power. Un-installing is always free. Start: budget 8, basic reactor, basic hull plate, empty weapon bay.

### Map

3 acts, StS-style DAG generated bottom-up with merging paths. Act lengths tuned for the hour target — Act 2 longest, Act 3 tightest. Assert in tests:

- Every start node reaches the boss.
- ≥2 Safe Planets per act, never adjacent on a path.
- ≥2 Elites reachable per act.
- ≥1 Station in the back half of each act.
- No two consecutive combats with the identical encounter.
- Act 1 node 1 is always normal combat in Clear Space.

**Every combat node shows its environment badge before the player commits.** Environments are content data with hook handlers.

**Safe Planet** is a menu, pick one: heal 30% max hull / upgrade a card / remove a card (free, once) / trade 8 hull for 60 Alloy. Never a bare heal button.

### Rewards

Normal: 3 card choices + **Skip**, plus Alloy. Elite: guaranteed module + card choice + large Alloy + mastery roll. Rarity weights by act in `balance.ts`.

Anti-frustration, in `rewards.ts`:
- Track the deck's archetype lean (`iai | guard | flow | overheat | neutral`). After 3 consecutive reward screens with no matching card, softly up-weight matches. **Soft, not guaranteed** — fewer dead runs, not handing me my build.
- Never the same card twice in one screen.
- Every Station stocks a card removal.

---

## 6. Effect ops

Cards contain data, never code. `engine/combat/effects.ts` interprets them.

```ts
type Target = 'self' | 'enemy' | 'allEnemies' | 'randomEnemy' | 'chosenEnemy';

type EffectOp =
  | { op: 'damage'; amount: number; target: Target; times?: number }
  | { op: 'block'; amount: number }
  | { op: 'applyStatus'; status: StatusId; stacks: number; target: Target }
  | { op: 'gainHeat'; amount: number }
  | { op: 'ventHeat'; amount: number }
  | { op: 'gainFocus'; amount: number }
  | { op: 'setStance'; stance: StanceId }
  | { op: 'cycleStance'; direction: 1 | -1 }
  | { op: 'draw'; amount: number }
  | { op: 'discard'; amount: number; random?: boolean }
  | { op: 'gainEnergy'; amount: number }
  | { op: 'exhaustSelf' }
  | { op: 'addCardToHand'; cardId: CardId; upgraded?: boolean }
  | { op: 'heal'; amount: number }
  | { op: 'conditional'; when: Condition; then: EffectOp[]; else?: EffectOp[] }
  | { op: 'scaleWith'; source: ScaleSource; per: number; then: EffectOp[] };

type Condition =
  | { kind: 'stanceIs'; stance: StanceId }
  | { kind: 'heatAtLeast'; value: number }
  | { kind: 'heatAtMost'; value: number }
  | { kind: 'targetHasStatus'; status: StatusId }
  | { kind: 'handSizeAtLeast'; value: number }
  | { kind: 'cardsPlayedThisTurnAtLeast'; value: number }
  | { kind: 'hullBelowPct'; value: number };

type ScaleSource = 'currentHeat' | 'focus' | 'blockGainedThisTurn' | 'cardsPlayedThisTurn';

interface CardDef {
  id: CardId;
  name: string;
  type: 'attack' | 'skill' | 'power' | 'status' | 'curse';
  rarity: 'basic' | 'common' | 'uncommon' | 'rare';
  archetype: 'iai' | 'guard' | 'flow' | 'overheat' | 'neutral';
  cost: number | 'X';
  effects: EffectOp[];
  stanceRider?: { stance: StanceId; effects: EffectOp[] };
  upgrade: Partial<Pick<CardDef, 'cost' | 'effects' | 'stanceRider' | 'name'>>;
  exhaust?: boolean;
  innate?: boolean;
  flavor?: string;   // hand-written. Rules text is NOT.
}
```

**Write `describeCard(def, state?): string` that generates rules text from the effect ops**, contextualised to current state when passed. Hand-written rules text drifts from behaviour the instant a number changes, and drifted text is the most common cause of a game feeling unfair. Flavor is separate and hand-written.

**Ask before adding an op.** Check whether `conditional` + `scaleWith` already covers it. Every op is permanent complexity.

---

## 7. Threads and logging

**Threads** (`engine/run/threads.ts`) are persistent *run-scoped* flags that later spawn nodes, alter events, change shops, or modify bosses. Always resolve within the same run. Cap 4 active. A **Manifest panel** lists them at all times with their known description — the player must always be able to see that they are Marked.

Implement `the_clutch` and `marked` from `DESIGN.md` §4 as the reference pair at M4; between them they exercise the whole model (a persistent cargo cost that becomes an ally, and an injected hostile node in Act 3).

Write a content test asserting the pool stays near 30% positive / 40% mixed / 30% costly, so it doesn't drift punitive as I add events.

**Logging.** Every transition appends `{turn, round, source, kind, text, detail?}`. Surface it as a scrollable in-combat log. It's simultaneously your debugger and the player's answer to "why did I take 19 damage." Never let damage happen without a log line.

---

## 8. Simulation and balance

`sim/`, headless, Node. Modelled on Mega Crit's approach: they crossed **pick rate** against **win-rate correlation** to find both overpowered cards (high pick + high win) and dead cards — ones nobody picks are "basically not a card in our game at that point."

`npm run sim -- --runs 5000 --depth 0` outputs:

- Win rate overall, by act reached, median run length in turns **and estimated minutes**.
- **Per card:** offers, pick rate, win rate when in final deck, average copies in winning decks.
- **Per module:** the same.
- **Per encounter:** average hull lost, death rate.
- **Per environment:** win-rate delta vs Clear Space.
- Heat: overheat frequency, and the turn it first typically happens.
- **Flagged outliers:** pick rate <8% or >60%; encounters with death rate >2× the act median.

The bot needn't be good, only *consistent* — maximise damage per energy, vent at heat ≥6, block when incoming ≥ current block. Make the policy pluggable so I can add a second personality and compare. Because the engine is pure and seeded this is nearly free once the engine exists. **Do not defer past M6.**

The estimated-minutes output matters more than usual here. No saves means run length is a hard constraint, not a preference.

---

## 9. UI

**Desktop-first, mobile playable.** Design the real layout for desktop. Keep mobile functional, but don't let it constrain how much the desktop shows.

**Interaction model, identical on both:** click/tap a card → it lifts and becomes selected. While selected, the stance rider resolves, valid targets outline, and **every enemy shows its predicted damage inline**. Click/tap a target → the card plays. Click the card again or press `Esc` to deselect. On desktop, hover additionally previews without selecting.

Do **not** make drag-to-play the primary interaction. It's fiddly on touch, fights page scroll, and gives nothing the two-step doesn't. Building it this way makes mobile nearly free rather than a second UI.

### Desktop (≥900px)

```
┌──────────────────────────────────────────────────────────────┐
│ HULL 42/70  ▓▓▓▓▓▓░░░░   ALLOY 130    ENV: Stellar Corona  ⓘ │
├──────────────────────────────────────────────────────────────┤
│    [ENEMY A]  38/45           [ENEMY B]  12/20               │
│    ⚔ 3 × 5                    ⚔ 14  ↑Str                     │
│    Vulnerable 2                                              │
├──────────────────────────────────────────────────────────────┤
│  STANCE: ▶ IAI ◀   "First attack +4 · +1 Heat at turn end"   │
│  HEAT  ▰▰▰▰▰▰░░░░  6 / 10      OVERHEAT AT 8 → 3 dmg + burn  │
│  Block 0    Focus 2    Energy ●●○                            │
├──────────────────────────────────────────────────────────────┤
│  [ Iai Slash ] [ Solar Parry ] [ Vector Step ] [ Sever ] ...  │
│  Deck 8   Discard 4   Exhaust 1        [End Turn]    [Log]   │
└──────────────────────────────────────────────────────────────┘
```

### Mobile (portrait)

Enemies stacked full-width, stance strip and heat gauge always visible, hand as a horizontal scroll-snap row with cards no smaller than 44px targets. Use `dvh` for the play area so it survives browser chrome sliding. `touch-action: manipulation` and `overscroll-behavior: none` on the stage. `e.preventDefault()` on `touchstart` handlers that also bind `click`, or they fire twice. Never shrink cards below legibility to fit more on screen — scroll instead.

### Both

- The stance strip states in plain words what the current stance does. Never make the player remember.
- The heat gauge always shows the exact threshold and consequence.
- Intents show exact values and never change after telegraphing.
- Keyboard: number keys play cards, `E` end turn, `Tab` cycle targets, `L` log, `Esc` deselect, `P` pause.
- Real `<button>`s, keyboard reachable, visible focus, readable contrast, `aria-live` on the log and on heat-threshold crossings.
- `prefers-reduced-motion`: skip tweens, keep state changes instant.
- No `alert()`, `confirm()`, or `prompt()`. In-page dialogs only.
- **A pause screen** with the seed, the current deck, the ship loadout, active Threads, and Abandon Run behind a confirmation. At an hour a run, the player needs to be able to look things up mid-fight.

---

## 10. Testing

Vitest. The engine is pure, so tests are cheap. Write them as you go.

**Guard tests — these encode `CLAUDE.md` so nobody has to remember it:**
- **Purity:** grep `src/engine/` for `Math.random|document\.|window\.` → fail.
- **No persistence:** grep `src/` for `localStorage|sessionStorage|document.cookie|indexedDB|fetch\(|XMLHttpRequest` → fail.

**Correctness tests:**
- **Determinism:** same seed + same action log → identical final state, asserted by JSON hash.
- **Stream independence:** adding a combat RNG call must not change generated maps for a seed.
- **Damage pipeline:** `previewDamage` equals damage actually dealt, across a matrix of stances × statuses × environments. **The most important test in the project.**
- **Mapgen invariants:** the §5 guarantees hold across 1000 seeds.
- **Content validation:** everything validates; no dangling IDs; every card has an `upgrade`; every event has ≥3 options plus a worthless "leave"; thread payoff ratio in tolerance.
- **No unwinnable states:** 1000 headless seeds, no live state with 0 playable actions and 0 energy.
- **Serialization round-trip:** state → JSON → state, identical. (Used by replay, not by saves.)

---

## 11. Milestones

Build **in order**. Stop after each, tell me what to look at, and wait.

**M0 — Clear the ground.** §2 in full: delete the lab, port the wordmark and `space.ts`, scaffold the toolchain and folder layout, `rng.ts` with named streams, `hooks.ts`, `state.ts`, empty registry with validation, guard tests, determinism test. Title screen: wordmark over the asteroid, Depth selector, seed field, starts a run and dumps JSON. Remind me about the Cloudflare build settings.

**M1 — Combat vertical slice.** One playable fight. Stance, heat, energy/draw/block, the damage pipeline with previews, the two-step selection model, enemy intents, 12 starting cards, 3 Act 1 enemies with real AI, combat log, win/lose. **This milestone decides whether the game is good.** I'll play it for a while before we continue. Every number in `balance.ts`.

**M2 — Run loop.** Act 1 mapgen, node types, routing, rewards with skip, Safe Planet menu, Alloy, pause screen, run-over screen with epilogue and seed, replay-from-log, `beforeunload` guard.

**M3 — Ship & Power.** Ship screen, slots, Power budget with un-power prompts, 10 modules across all slot types hooking into combat, Elites dropping modules.

**M4 — Events & Threads.** Event screen, 10 events including `the_clutch`, the Thread system, Manifest panel, Station shop with card removal.

**M5 — Environments, Acts 2–3, Wavefront.** All 8 environments as hook sets, badges on the map, Acts 2 and 3, 3 bosses, the archetype-countering Act 3 enemies from `DESIGN.md` §5, Stance Masteries, the Wavefront from Act 2.

**M6 — Content & tuning.** Scale to ~85 cards, ~30 modules, ~28 enemies, ~35 events. Build `sim/` and run it. Write `BALANCE.md` and `CONTENT.md`. Tune until no card sits outside the 8–60% pick band and median run length lands in 45–70 minutes.

**M7 — Feel.** Animation timings, hit feedback, subtle screen shake (toggleable, off under reduced-motion), the epilogue generator, Depth ladder 0–20 fully implemented, combat-stage background.

**M8 — Ship it.** `npm run build`, verify `dist/` works from `npm run preview`, all guard tests pass, no console errors, bundle size reported. **Confirm the Cloudflare Pages build command is `npm run build` and output directory is `dist` before pushing** — a stale config will serve the deleted lab and look exactly like a broken deploy. Then push; Cloudflare rebuilds in ~20 seconds.

---

## 12. How to work with me

- **Ask before** adding a dependency, an effect op, a keyword, a fourth combat resource, or loosening a `tsconfig` strictness flag.
- Keep `NOTES.md` current with decisions I didn't specify.
- At each milestone: what's playable, what you deliberately deferred, and the single biggest risk in what you built.
- If something in `DESIGN.md` turns out mechanically bad once implemented, **say so and propose an alternative.** The design doc is a hypothesis, not scripture.
- Boring, obvious code in the engine. Save the cleverness for the content.
- Commit at each milestone. Don't push until M8 unless I ask.

Start with M0. Stop when it's done.
