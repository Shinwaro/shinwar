# SHINWAR — Design Document

*A space-themed roguelike deckbuilder at shinwar.se.*

**Format:** browser game, single-player, run-based. Card combat with a stance layer, StS-style branching star map, dual progression (Pilot path + Ship path).
**Class at launch:** The Space Samurai — a ronin of a dead orbital sect, flying a salvaged cutter through a collapsing frontier.

---

## Part I — Why the reference games work

This section is the "why." Everything in Part II is derived from it. If you later want to change something in Part II, come back here first and check which principle you'd be breaking.

### 1. Meaningful decisions come from competing needs, not from many options

The strongest recurring pattern across Slay the Spire, FTL, and Into the Breach is that the player is never choosing between *good* and *bad*. They are choosing between two things they both need, with only enough resources for one.

Slay the Spire's core tension is short-term versus long-term: end the fight fast and eat the damage, or stall and let scaling enemies out-grow you. Cloudfall's breakdown of the game puts it plainly — the design "forces meaningful compromises between immediate needs and future potential," and crucially, **solutions never fully solve problems.** Wild Strike gives you damage but pollutes your deck with Wounds. Evolve fixes Wounds but does nothing on its own. Fiend Fire rewards you for having built the whole chain.

The design instruction: every reward should be a partial answer that opens a new question.

**Anti-pattern:** a reward screen where one option is simply better. If your card rewards are "8 damage," "6 damage," and "4 damage," you have a UI, not a decision.

### 2. Randomness must be *input*, not *output* — and it must be mitigable

The Thoughtful Gamer's analysis of Slay the Spire draws the line clearly. **Input randomness** determines *what you get to choose from*; **output randomness** determines *what your choice does*. Players tolerate the first almost infinitely and the second barely at all, because input randomness is a puzzle to solve and output randomness is a verdict handed down.

Slay the Spire mitigates variance three ways:

- **Weighted, not uniform, probabilities.** Card rarity, relic pools, and shop contents shift over the run. You are never pulling from a flat bag.
- **Output randomness is opt-in.** Snecko Eye randomizes your card costs — but you *chose* to pick up Snecko Eye. Nobody has chaos imposed on them.
- **Layered planning.** Because players learn what tends to appear where, they can strategize about *where the risk lives*, which converts randomness from noise into terrain.

Into the Breach went further and removed output randomness entirely: full enemy intent telegraphing, deterministic damage, a battlefield that is a solvable puzzle every turn. Subset learned from FTL that a difficulty spike introducing *new* mechanics at the finale felt unfair; Into the Breach's finale instead asks you to defend — a culmination of skills you already have, not a curveball.

The design instruction: **no random damage ranges, no random targeting, no hidden dice.** Randomness lives in *what the universe offers you*, never in *whether your plan works*.

### 3. Simple mechanics + one multiplying axis = depth

Balatro is 52 cards and poker hands. Monster Train is Slay the Spire plus one idea — vertical floors — and that single idea generates hundreds of hours of strategy. Into the Breach is a tiny grid and push/pull.

The pattern isn't "few mechanics." It's **few mechanics plus one axis that changes what all of them mean.** Position in Monster Train. Chips-versus-mult in Balatro. Terrain and shove direction in Into the Breach.

This is the highest-leverage design decision you will make. Pick one axis and let it recontextualize everything, rather than adding a second, third, and fourth subsystem.

For Shinwar, that axis is **Stance** (with **Heat** as its pressure valve). More on that in Part II.

### 4. Build variety comes from redundancy under scarcity

Because Slay the Spire offers you 1-of-3 cards after most fights, you almost never assemble the perfect combo. Cloudfall notes this forces players to **build redundancy across different cards rather than perfect synergies** — you end up with three half-solutions instead of one clean one, and that's where the interesting play is.

Balatro's Jokers work because they're multiplicative and *conditional*: each one is a small rule change that interacts with other rule changes. The famous "cursed" tension Mark Brown identifies — LocalThunk hides the score preview for drama, but the math is public, so players run external calculators — is a real warning. **Information that is theoretically computable but practically hidden doesn't create mystery; it creates spreadsheets.** The Binding of Isaac hit the same wall; McMillen later called hidden item effects a major flaw because "you can't play Isaac without a browser open."

The design instruction: hide *outcomes* (what the universe will offer next), never *mechanics* (what your cards do right now).

### 5. Failure has to produce something

Hades' Greg Kasavin: "If the whole game is structured around dying and restarting, then we had to make sure the moment of death isn't about rage-quitting." Supergiant pays out narrative on failure — dialogue triggered by contextual conditions, so each death potentially unlocks something that wouldn't have happened otherwise. Kasavin's framing is the target: players must feel "compelled to explore further and feel the time you spent wasn't a waste."

But note the trade-off. Hades' meta-progression includes real power (Mirror of Night), which makes early losses feel productive but risks turning difficulty into a grind wall. Slay the Spire's meta-progression adds almost no power — it unlocks *content*, widening the pool. Dead Cells sits between them.

**Recommendation for Shinwar: the Slay the Spire model, with the Hades presentation.** Unlock variety, not stats. Pay out *story and knowledge* on death — a run epilogue, a log entry, a new event or module entering the pool. A player who loses should end the run knowing something they didn't know, and with the pool slightly wider next time.

### 6. Tension comes from attrition and imperfect information, not from big numbers

FTL and Darkest Dungeon both make you spend a resource you can't fully replenish. In FTL it's hull and scrap under a pursuing fleet; in Darkest Dungeon it's the roster's mental state.

Red Hook's affliction system deep-dive is instructive on two counts. First, the goal was to break the RPG assumption that heroes always fight — a stressed hero might refuse. Second, and more useful: **they originally wanted the stress meter opaque, and discovered players needed the number.** Visible stress with explicit `+20 Stress!` feedback preserved the drama while making the pressure legible. Opacity didn't add tension; it added confusion.

The design instruction: make the pressure gauge visible and precise. Drama comes from *watching the number climb toward a threshold you understand*, not from not knowing what the number is.

### 7. Metrics beat intuition for balance

Mega Crit's GDC work is the practical playbook. They tracked **selection rate** (how often a card is picked when offered) against **win-rate correlation** (how often it appears in winning runs), and used the two together:

- High pick rate + high win rate → **overpowered.** (Dual Wield, after a buff, let players go infinite.)
- Low pick rate → **effectively not in the game.** Giovannetti: it's "basically not a card in our game at that point."

They grew from three graphs to ninety-plus, patched weekly in Early Access, and weren't precious — they threw away whole archetypes and restarted.

The design instruction: **build the headless simulator on day one, not month six.** A bot that plays 10,000 runs and reports per-card pick/win correlation is worth more than any amount of solo playtesting, and it's cheap to build if the engine is pure.

### 8. Memorable runs come from specific, consequential moments

The stories people tell about FTL and Darkest Dungeon are never "I had good stats." They're "I took the giant alien spiders event again," "my last crew member vented the ship to kill the boarders," "Dismas went Abusive on the final corridor."

What those have in common:
- A **named**, specific situation, not a generic one.
- A **choice the player made** that they can point to.
- A **consequence that arrived later**, so the story has two acts.

That third one is the underused lever. Most roguelike events resolve instantly. Deferred consequences — a decision in Act 1 that pays out or bites in Act 3 — are the single cheapest way to manufacture stories.

### 9. Common failure modes to design against

| Trap | What it looks like | Fix |
|---|---|---|
| **Solved run** | One dominant opening; every run plays the same. | Vary the *problem*, not just the tools. Environments and boss weaknesses should make different builds correct on different runs. |
| **False choice** | Three rewards, one obviously best. | Every option answers a *different* need. Add cost or condition to the strongest one. |
| **Reward inflation** | You gain so much that Act 3 is trivial. | Cap accumulation with a budget (see Reactor Power, Part II). Scale the *type* of threat, not just enemy HP. |
| **Unfair, not hard** | Damage you couldn't have seen coming. | Full intent telegraphing. Every source of damage must be previewable one turn ahead. |
| **Keyword sprawl** | 40 mechanics, each shallow. | Hard cap on keywords (target ≤ 14 at v1.0). Deepen by combining, not by adding. |
| **Deck bloat** | Deck grows, consistency collapses, player can't fix it. | Card removal must be reliably purchasable and reasonably cheap. |
| **Unwinnable states** | Bad start = dead run, discovered 20 minutes later. | Detect and telegraph. Offer an escape valve (costly retreat, emergency jump). |
| **Grind gating** | Losses only matter because they bank currency. | Unlock content, not power. |
| **Stat-inflation difficulty** | Higher difficulty = enemies have more HP. | Higher difficulty should ask *new questions* (extra enemy, harsher environment, tighter economy). |
| **Hidden math** | Player can't tell why they took 19 damage. | Damage preview uses the same code path as damage resolution. Combat log always available. |

---

## Part II — Translating this into space

The goal you stated is right and worth restating: **the setting must be mechanically load-bearing, not decorative.** A "space game" where the fireball is called a plasma bolt is a fantasy game with a reskin. What follows is an attempt to make physics-of-space concepts *be* the mechanics.

### The central conceit

Space is a vacuum. You cannot get rid of heat. Every weapon you fire, every shield you raise, every engine burn cooks you from the inside, and the only way out is to stop and radiate. That single fact carries the entire risk/reward spine of the game.

Meanwhile: gravity dictates where you can go and how hard you hit. Radiation is a cost you accept for shortcuts. Stars are both a resource and a hazard. Black holes bend time — which, in a turn-based game, means turn order.

Nothing here is flavor. Each one is a rule.

---

### 1. Combat core — Stance and Heat

**Stance is the multiplying axis.** Three stances; you're always in exactly one. Cards read differently depending on which.

| Stance | Kanji/name | Identity | Passive |
|---|---|---|---|
| **IAI** | 居合 — the draw-cut | Burst. One decisive strike. | Your first attack each turn deals +4. You gain +1 Heat at end of turn. |
| **GUARD** | 受 — receive | Defense and counterpunch. | Vent 2 Heat at end of turn. Block is not fully lost at turn start (retain 3). |
| **FLOW** | 流 — the current | Tempo, chains, engine. | Draw +1 card each turn. Attacks deal -2 damage. |

Most cards have a **base effect plus a stance rider**:

```
IAI SLASH            1 Energy   Attack        [basic]
  Deal 6 damage.
  IAI: Deal 4 more and gain 1 Focus.

SOLAR PARRY          1 Energy   Skill         [basic]
  Gain 6 Block.
  GUARD: When you are attacked this turn, deal 4 back.

VECTOR STEP          0 Energy   Skill         [basic]
  Change stance. Draw 1.

MERIDIAN CUT         2 Energy   Attack        [uncommon]
  Deal 12 damage. Gain 2 Heat.
  IAI: Deal 6 more and Stagger. Gain 1 more Heat.
```

(Note that in IAI, Iai Slash on your first attack of the turn is
6 base + 4 rider + 4 stance passive = 14 for one energy — but the
stance passive only fires once per turn, and IAI is cooking you
1 Heat every turn you stay in it. That's the shape of the whole
game in miniature.)

This gives you enormous expressive range from a small card pool, because **every card is effectively two or three cards depending on state.** It also creates natural puzzle-play: the right sequence this turn is a function of stance transitions, not just card values.

Keep stance changes *cheap but not free* — mostly 0-cost cards, some cards change stance as a rider. The interesting decision is "is it worth spending a card slot on the transition."

**Heat is the pressure valve.** Per-combat, starts at 0, scale 0–10.

- Powerful cards generate Heat. Cheap/defensive cards vent it.
- **At end of turn, if Heat ≥ 8: Overheat.** Take `(Heat − 7) × 3` damage and burn (exhaust) a random card in hand.
- **At Heat 10: Critical.** Above damage, plus you lose 1 Energy next turn.
- Heat does **not** decay on its own. You must vent.

Why this works, mapped to Part I:
- It's the "solutions never fully solve problems" principle made systemic. Your best cards actively build toward your death.
- It manufactures the emotional arc you asked for *inside a single fight*: safe → strong → greedy → threatened → desperate.
- It's fully visible and deterministic. The player always knows exactly how hot they are and exactly what happens at 8. (Darkest Dungeon's lesson: show the number.)
- It gives the "Overheat" archetype something to build around — cards that *want* high Heat — so the pressure gauge becomes a resource for one build and a threat for another.

**Focus (Ki)** is a stacking buff, not a fourth resource: `+2 damage per stack on your next attack, then reset.` It's the IAI build's scaling engine.

**Resource count check:** Energy (per-turn), Heat (per-combat), Stance (state). Three, and each does a distinct job. Resist adding a fourth.

---

### 2. Dual progression — the Pilot and the Ship

You asked for two paths. The design requirement is that they must be **independently upgradable but mechanically entangled**, or they're just two shopping lists.

#### Path A — The Way (Pilot progression)

The samurai's own capability. Currency: cards and techniques.

- **Cards** from combat rewards, elites, shops, events. Standard deckbuilding.
- **Forging** at Safe Planets and Stations: upgrade a card (`Iai Slash+`), or **remove** one. Removal must be reliably available — it's the anti-bloat valve.
- **Stance Masteries** — rare, run-defining. Earned only from Elites and boss kills. Each permanently alters one stance for the rest of the run:
  - *Unsheathed Mind* — IAI: your first attack each turn deals +8 instead of +4, but you gain 2 Heat at end of turn instead of 1.
  - *Iron Tide* — GUARD: retain all Block instead of 3, but you may only change stance once per turn.
  - *River Without Banks* — FLOW: attacks deal -0 instead of -2, but you draw 1 fewer at the start of combat.

  Masteries are the "one axis, recontextualized" lever — a mastery makes your entire existing deck read differently. Cap them at 2-3 per run.

#### Path B — The Vessel (Ship progression)

The cutter you fly. Currency: **Alloy** and **Reactor Power**.

The ship has **slots by type** (Reactor, Hull, Drive, Sensors, Weapon Bay, Cargo) and a **Power budget**. Every installed module draws Power. Your reactor supplies a fixed amount.

**This is the most important structural idea in the ship path.** Power is the ship's equivalent of deck size: it prevents pure accumulation, forces you to un-install things you like, and turns "I found a great module" into a real decision rather than a free win. FTL's power grid is the direct ancestor, and it's why FTL's ship never stops being a puzzle.

Module examples, showing how they entangle with the Pilot path:

```
COOLANT LATTICE        Hull      2 Power
  Vent 1 extra Heat whenever you vent.

MASS DRIVER            Weapon    3 Power
  At the start of your turn, if Heat >= 5, deal 9 damage
  to a random enemy.                    <- rewards Overheat builds

PREDICTIVE ARRAY       Sensors   2 Power
  The first time you change stance each turn, draw 1.
                                        <- rewards Flow builds

REACTIVE PLATING       Hull      2 Power
  In GUARD, the first attack against you each turn
  deals 5 less.

OVERCLOCK CORE         Reactor   0 Power (supplies +3)
  +3 Power capacity. You start every combat at 2 Heat.
                                        <- capacity is itself a tradeoff

GRAVITIC ANCHOR        Drive     1 Power
  Enemies with an incoming Stagger effect take +50% damage.

SALVAGE MANIPULATOR    Cargo     1 Power
  Gain 15 extra Alloy from Elite encounters.
                                        <- economy module: pays for itself
                                           only if you fight elites
```

Note that several modules are only good *for a particular deck archetype*. That's deliberate: it means ship rewards are not universally good, so choosing them is a real decision, and it means the two progression paths pull on each other.

#### The shared scarcity

**Alloy is spent on both paths.** Card removals, card upgrades, ship modules, hull repair, and reactor capacity all come out of the same pool. Every purchase is "pilot or ship, now or later." That's the mechanism that makes the dual-path structure generate decisions rather than just doubling the reward stream.

---

### 3. The map — celestial bodies as decision surface

Standard branching-path structure (Slay the Spire's DAG), 3 acts, 14-16 nodes per act, 6 starting columns narrowing to a boss. But with two additions that make the star map do more work than a fantasy map can.

#### Node types

| Node | Icon concept | What it offers |
|---|---|---|
| **Safe Planet** | green world | Choose ONE: heal 30% hull / forge (upgrade a card) / strip (remove a card) / refuel-trade hull for Alloy |
| **Combat** | ship silhouette | Standard fight. Reward: card choice + Alloy. |
| **Elite** | red skull-marked hull | Hard fight. Reward: **guaranteed Ship Module** + Stance Mastery chance + large Alloy. |
| **Anomaly** | swirl | Dilemma event (see §4). |
| **Station** | ring habitat | Shop: cards, modules, removals, hull repair, reactor cells. |
| **Unknown** | `?` | Weighted roll: mostly event, sometimes ambush, sometimes derelict treasure. Weights shift as you consume them. |
| **Boss** | the thing at the end | Act finale. |

Critically, **the Safe Planet is a choice, not a heal button.** "Heal or upgrade" is one of the best decisions Slay the Spire makes and it costs nothing to implement.

#### Environments — the second layer

**Every combat node on the map displays its environment before you commit to the route.** The environment changes the rules of that fight for both sides.

| Environment | Rule |
|---|---|
| **Stellar Corona** | All Heat gain +1. Venting is doubled. |
| **Deep Void** | Heat decays 2 per turn on its own, but you draw 1 fewer card on turn 1. |
| **Gravity Well** | Attacks of 12+ damage deal +50%. You may only change stance once per turn. |
| **Radiation Belt** | All combatants gain 1 Irradiate at the start of each turn (1 damage per stack, per turn, does not decay). Rewards fast kills. |
| **Debris Field** | At the end of each round, a rock hits the highest-HP combatant for 7. Telegraphed one turn ahead with a target marker. |
| **Sensor Fog (Nebula)** | Enemy intents are hidden. A free **Scan** action, once per turn, reveals one enemy's intent. |
| **Chronal Shear (near singularity)** | Every third round, enemies act twice. Round counter shown prominently. |
| **Clear Space** | No modifier. |

This is the answer to "what do I need right now?" A Flow deck reads Sensor Fog as manageable and Gravity Well as a disaster. An Overheat deck loves Deep Void and fears Stellar Corona. A Guard deck laughs at Debris Field. **Two players looking at the same map fork should genuinely disagree about which way to go.**

It also means the route decision is legible *without* the player having to memorize enemy rosters — the information is right there on the node.

Note the design discipline: even Debris Field's randomness is **telegraphed a full turn ahead with a visible target marker.** It creates a problem to solve, not a verdict.

#### The Wavefront (recommended, but stage it)

A pursuing hazard, FTL-style: the collapse front advances behind you. Most nodes cost 1 Time; Station and Safe Planet cost 2. If the Wavefront reaches your column, the next fight starts with a hazard stack.

This is the mechanism that produces the **"greedy → threatened"** beat at map scale — it puts a price on the detour to the shop. It is genuinely good, and it is also the thing most likely to make your game feel oppressive if tuned badly.

**Ship it in Act 3 first, at a generous pace.** Extend to Acts 1-2 only if playtesting says the map is too safe. If you're unsure, leave it out of v1 entirely; the game works without it.

---

### 4. Events as dilemmas

Your egg example is exactly right, and it generalizes into a template. Every Anomaly should have:

1. **A specific, named situation** — not "you find a crate."
2. **3–4 options that each answer a different need** — power, economy, safety, information.
3. **Legible risk categories** rather than hidden dice. The player should be able to tell *what kind* of thing might happen, even if not exactly what.
4. **At least one option that defers its consequence** — creating a Thread.

#### Threads — the story engine

A **Thread** is a persistent run flag that can later spawn nodes, modify events, alter shops, or change a boss. This is the single cheapest mechanism for producing memorable runs, and it's the thing most small roguelikes skip.

Worked example, your egg:

```
ANOMALY — "The Last Clutch"

A Vareth seedship, hull cracked, drive dead. Their translator is
crude but the meaning is not: this is the final viable egg of
their species. They are asking you, a stranger with a sword,
to carry it somewhere safe.

> ESCORT IT
  Gain: nothing now. Cargo slot occupied (-1 Power).
  THREAD: "The Clutch" — the egg will matter later.
  [Risk: unknown | Payoff: unknown]

> SELL IT TO THE SYNDICATE
  Gain: 120 Alloy immediately.
  THREAD: "Marked" — the Vareth remember.
  [Risk: low now | Payoff: immediate, large]

> BREAK THE SHELL
  Gain: Card — "Vareth Chitin Edge" (rare).
  THREAD: "Marked" (stronger variant).
  [Risk: moral | Payoff: immediate, specific]

> LEAVE THEM
  Gain: nothing. No thread.
  [Risk: none | Payoff: none]
```

And the payoffs, later in the run:

- **The Clutch** → In Act 3, at a random node, the egg hatches mid-combat. The hatchling is a permanent ally that acts each turn (5 damage, or absorbs one attack). Also unlocks a unique Safe Planet variant where the Vareth repair your hull for free. The *cost* was a Power slot for two acts.
- **Marked** → A Vareth reprisal ship appears as an extra Elite-tier node in Act 3. Beating it drops a strong module. The 120 Alloy was real, and so is the bill.

Both branches are good. Neither is safe. That's the target.

**Keep "Leave" always available and always genuinely worthless.** It's what makes the other options feel like decisions rather than a slot machine you're forced to pull.

#### Thread design rules

- Threads should resolve **within the same run**. Cross-run consequences sound cool and mostly read as arbitrary.
- Aim for **2–4 active threads** in a typical run. More than that and none of them land.
- The player should be able to see their active threads in a "Manifest" panel — visible, like Darkest Dungeon's stress bar. Knowing "I'm Marked" is what makes the Act 3 reprisal feel earned instead of random.
- Roughly 30% of threads should be *positive* payoffs, 40% *mixed*, 30% *costs*. If threads are only punishments, players will stop engaging with events.

---

### 5. The run arc

You described the target emotional shape precisely:

> Weak → developing → powerful → greedy → threatened → desperate → victory/death

Here's how each beat gets manufactured rather than hoped for:

| Beat | Act | Mechanism |
|---|---|---|
| **Weak** | Act 1 early | Starting deck is deliberately mediocre. 12 cards, no engine. Enemies are small but you have no answers, so every hit lands. Power budget barely covers your default modules. |
| **Developing** | Act 1 late | First Stance Mastery from the Act 1 elite. First 2-3 archetype cards. You can *see* the deck you want. |
| **Powerful** | Act 2 mid | The engine comes online. There should be a stretch of 2-3 fights where you feel genuinely strong. **Do not skip this.** Games that never let you feel powerful don't get replayed. |
| **Greedy** | Act 2 late | Elites are visibly worth it: guaranteed module + mastery chance. The shop has the piece you need but you're 40 Alloy short. The Wavefront (if enabled) prices the detour. |
| **Threatened** | Act 3 early | Environments get harsh. Enemies start punishing *your specific build* (see below). Overheat thresholds start actually mattering because your deck is fast. |
| **Desperate** | Act 3 late / boss | Hull is low, Alloy is spent, one Thread is coming due. |
| **Victory / death** | Boss | Follow Into the Breach's lesson: **the boss must be a culmination, not a curveball.** It should test the skill the whole run taught, harder — never introduce a brand-new mechanic in the final fight. |

#### Making Act 3 punish *your* build (adaptation, not execution)

This is the answer to "how do I stop players executing one optimal strategy." Act 3 should include enemies that read the player's state:

- **Chirality Warden** — takes 60% less damage from attacks over 20. Kills the pure-IAI one-shot plan; asks you to have a second gear.
- **Heat Siphon** — gains Strength equal to your current Heat at the start of its turn. Overheat builds must actually manage the gauge.
- **Null Prism** — the first card you play each turn is negated. Punishes decks that lean on a single key card.
- **Tessellate Swarm** — three small enemies with shared Block. Punishes single-target burst, rewards Flow.

Note these are *counters to archetypes*, and the player can see which enemies are ahead of them on the map. So the correct move isn't "have a perfect deck," it's **"route toward the enemies your build handles, and pick up one answer for the ones it doesn't."** That's adaptation.

---

### 6. Information design

The rule: **hide the future, never the present.**

Always visible, always exact:
- Enemy intent: icon + exact number + multi-hit shown as `3 × 5`. Buffs and debuffs the enemy is about to apply are named.
- Damage preview on hover, computed by **the same code path that resolves damage**, so it cannot lie. (Architecturally enforced — see the build prompt.)
- Current Heat, and the exact Overheat threshold and consequence.
- Current stance and what it's doing, stated in plain words on-screen.
- Full combat log, scrollable, showing every modifier applied.
- Active Threads, in a Manifest panel.
- Map: node type + environment, several columns ahead.

Deliberately hidden:
- Which specific cards a future reward will offer.
- What a `?` node will turn out to be.
- The exact payoff of an unresolved Thread (but the *category* is signposted).
- Enemy HP totals on nodes you haven't reached.

This split is what Part I §2 and §4 are for. The Balatro/Isaac lesson is that the second list must stay short and must never include anything a player could compute. If the player would need a wiki to play well, you've hidden the wrong thing.

---

### 7. Meta progression without grinding

**Between runs, unlock content, not power.**

- Defeating an act boss for the first time adds cards to the pool.
- Resolving a Thread for the first time adds that thread's follow-up nodes to future runs' possibility space.
- Reaching Act 3 unlocks the second and third starting ship hulls (which are *sidegrades* — different Power budgets and starting modules, not "better").
- A **Depth ladder** (0–20), Slay-the-Spire-Ascension-style, is the actual long-term hook. Each Depth adds one specific rule, never just +HP:
  - Depth 1: Elites are harder. Depth 2: shops cost more. Depth 3: fewer Safe Planets. Depth 4: Overheat threshold drops to 7. Depth 5: bosses gain a second phase. …
- A **Codex** that logs every event you've seen, every thread you've resolved, and every enemy you've faced — the Hades "failure produces something" payout, with no power attached.

**Run epilogue on death:** a short generated summary. "You died 3 nodes from the Event Horizon. Your deck was built around Iai. The Vareth never got their egg." That sentence is what makes someone press New Run.

---

### 8. Balance starting points

Concrete numbers so the first build is playable rather than theoretical. Treat these as v0 and let the simulator move them.

**Player**
- Starting Hull 70 / 70. Energy 3. Draw 5. Deck 12 cards.
- Starting deck: 5× Iai Slash (6 dmg), 4× Solar Parry (6 block), 2× Vector Step (0-cost stance change + draw 1), 1× signature (Sever, 2 energy, 14 damage, +3 Heat).

**Damage curve (the yardstick)**
- Common card: **6 damage or 6 block per 1 Energy**, unconditionally.
- Uncommon: ~8 per Energy, or 6 with a rider.
- Rare: 9–11 per Energy **with a condition attached**, or a rule change.
- Anything above 12 per Energy must cost Heat, cost card removal, or exhaust.

**Enemies**
| | HP | Damage/turn |
|---|---|---|
| Act 1 normal | 20–45 | 6–12 |
| Act 1 elite | 80–110 | 14–20 |
| Act 1 boss | 150–180 | 18–26 |
| Act 2 normal | 45–80 | 12–20 |
| Act 2 elite | 130–170 | 22–30 |
| Act 2 boss | 220–260 | 28–38 |
| Act 3 normal | 70–120 | 18–28 |
| Act 3 elite | 180–230 | 30–40 |
| Act 3 boss | 300–360 | 35–50 |

**Economy**
- Normal combat: 15–25 Alloy. Elite: 45–70. Boss: 80–110.
- Card removal: 60 Alloy, price rises 15 each purchase (per Slay the Spire's model — it stops you removing your whole deck).
- Card upgrade at a forge: free (limited to one per Safe Planet).
- Hull repair: 1 Alloy per 1 HP.
- Common module: 90. Uncommon: 140. Rare: 210.
- Reactor cell (+2 Power): 180, rising.

**Ship**
- Starting Power budget: 8. Starting modules: a basic Reactor (supplies), a basic Hull plate, an empty Weapon Bay.
- A full run should end with 12–16 Power and 5–7 installed modules — enough that you had to *choose*, not enough that you got everything.

**Targets**
- Median run length: **45–70 minutes**. Past 90 and it's a problem — with no saves, an abandoned run is a lost hour.
- Win rate at Depth 0 for a competent player after ~10 runs: **40–55%**.
- Win rate at Depth 20: **10–20%** for an expert.
- **No card should have a pick rate below 8% or above 60%** once tuned. Below 8% it isn't in the game; above 60% it's mandatory.

---

### 9. Scope discipline

The most common way a project like this dies is content sprawl before the core is fun. Suggested v1.0 targets:

- **1 class** (Space Samurai), **~85 cards**, **~30 ship modules**, **~28 enemies**, **9 elites**, **3 bosses**, **~35 events**, **8 environments**, **≤ 14 keywords**, **3 acts**.

That is enough for hundreds of runs *if* the stance/heat axis is doing its job. If it isn't, no amount of extra content will fix it — which is exactly why the vertical slice comes first.

Add a second class only after the first one has a stable win rate across the Depth ladder. Subset's advice applies: "take one small piece at a time and make sure each is fun and can be played immediately."

---

---

## Addendum — decisions made after this document was written

**No persistence, by choice.** No saves, no unlocks, no scores, no accounts. This kills §7 as written — the Codex and the persistent Depth ladder both need storage. What replaces it is better: **everything is available from run one**, and **Depth is a title-screen setting** you pick before starting. That section argues at length against grind-gating; removing storage simply enforces the argument. The run epilogue survives as generated text on the game-over screen, logged nowhere.

**Runs are an hour, and that raises the stakes on §8's length target.** Revised to a 45–70 minute median. Past 90 minutes an abandoned run costs a real evening, so treat the simulator's median-turn output as a budget rather than a target, and cut Act 3's length before cutting anything else. Two required mitigations: a `beforeunload` guard during an active run, and a visible, copyable, re-enterable seed on the title, map, pause, and game-over screens. A seed is a number you can write down, not persistence.

**An hour also changes the pacing argument for the Wavefront** (§3). At 35 minutes it was a nice-to-have that risked feeling oppressive. At an hour, the midgame sags without it — so it comes in from **Act 2**, tuned generously, rather than Act 3 only.

**A pause screen is now load-bearing.** At an hour a run, the player needs to look up their deck, ship loadout, and active Threads mid-fight without leaving combat. §6's information rules apply to it: everything present, nothing hidden.

**§6 gets a touch-safe interaction model.** The damage preview and the stance-rider highlight are what make the game legible, and both were specced around hover. The fix — click or tap a card to select it (rider resolves, targets outline, predicted damage appears inline on every enemy), then click or tap a target to play — works identically on desktop, touch, and keyboard. Desktop keeps hover as an extra preview. The game is desktop-first, but building selection this way makes mobile nearly free instead of a second UI.

Everything else stands: Stance and Heat, the dual Pilot/Ship progression, Reactor Power as the ship's deck-size constraint, environments as visible route decisions, Threads, the run arc, and the rest of the balance numbers in §8.

---

## Sources

- [Reverse Engineering Slay the Spire's Decisions — Cloudfall Studios](https://www.cloudfallstudios.com/blog/2020/11/2/game-design-tips-reverse-engineering-slay-the-spires-decisions)
- [Slay the Spire and Randomness Tolerance — The Thoughtful Gamer](https://thethoughtfulgamer.com/2021/01/28/slay-the-spire-and-randomness-tolerance/)
- [How Slay the Spire's devs use data to balance their roguelike deck-builder — Game Developer](https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder)
- [Slay the Spire: Metrics Driven Design and Balance — GDC Vault](https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics)
- [How Subset Games made the jump from FTL to Into the Breach — Game Developer](https://www.gamedeveloper.com/business/how-subset-games-made-the-jump-from-i-ftl-i-to-i-into-the-breach-i-)
- [How Supergiant weaves narrative rewards into Hades' cycle of perpetual death — Game Developer](https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death)
- [Roguelikes and narrative design with Hades creative director Greg Kasavin — GDC Podcast](https://gdconf.com/article/roguelikes-and-narrative-design-with-hades-creative-director-greg-kasavin-gdc-podcast-ep-16/)
- [Game Design Deep Dive: Darkest Dungeon's Affliction System — Game Developer](https://www.gamedeveloper.com/design/game-design-deep-dive-i-darkest-dungeon-s-i-affliction-system)
- [Balatro's 'Cursed' Design Problem — Mark Brown, GMTK](https://gmtk.substack.com/p/balatros-cursed-design-problem)
- [Tackling deckbuilding and roguelite design in Abrakam's Roguebook — Game Developer](https://www.gamedeveloper.com/design/tackling-deckbuilding-design-in-abrakam-s-roguebook)
