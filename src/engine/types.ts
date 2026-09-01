/* The vocabulary of the game.
 *
 * Two rules govern everything in this file:
 *
 * 1. `GameState` and everything reachable from it is JSON-serializable. No
 *    classes, no Map, no Set, no functions, no Date. Replay, the determinism
 *    harness, the simulator and the state dump all depend on it.
 *
 * 2. State fields are never optional — they are `T | null`. `JSON.stringify`
 *    drops `undefined`, so an optional field cannot survive a round trip and
 *    would silently break the serialization test. Content definitions are not
 *    state, so they may use `?` freely.
 */

/* ---------- ids ----------
   Plain strings, deliberately. Branded types would fight JSON at every
   boundary, and the thing they would catch — a card referring to an id that
   does not exist — is caught properly by the content registry's validation
   pass, which also catches the cases a type brand never could. */

export type CardId = string;
export type EnemyId = string;
export type EventId = string;
export type EncounterId = string;
export type EnvironmentId = string;
export type MasteryId = string;
export type RelicId = string;
export type ImplantId = string;
export type StatusId = string;
export type ThreadId = string;

/* ---------- json ---------- */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/* ---------- the axis ---------- */

export type StanceId = 'iai' | 'guard' | 'flow';

/** Cycle order for `cycleStance`. Fixed, so direction means the same thing everywhere. */
export const STANCE_ORDER: readonly StanceId[] = ['iai', 'guard', 'flow'];

export type Archetype = 'iai' | 'guard' | 'flow' | 'overheat' | 'neutral';

/* ---------- effect ops ----------
   Cards contain data, never code. `engine/combat/effects.ts` interprets these.
   Adding an op is permanent complexity — check whether `conditional` and
   `scaleWith` already express it, and ask before adding one. */

export type Target = 'self' | 'enemy' | 'allEnemies' | 'randomEnemy' | 'chosenEnemy';

export type Condition =
  | { readonly kind: 'stanceIs'; readonly stance: StanceId }
  | { readonly kind: 'heatAtLeast'; readonly value: number }
  | { readonly kind: 'heatAtMost'; readonly value: number }
  | { readonly kind: 'targetHasStatus'; readonly status: StatusId }
  | { readonly kind: 'handSizeAtLeast'; readonly value: number }
  | { readonly kind: 'cardsPlayedThisTurnAtLeast'; readonly value: number }
  | { readonly kind: 'hullBelowPct'; readonly value: number }
  /**
   * The mirror, for cards that are strongest while you are still whole.
   *
   * The pair is the point. `hullBelowPct` alone only ever produced comeback
   * cards — dead weight until the run went wrong — and a deck of those is a
   * deck that wants to be hurt. A card that pays ABOVE a line is the opposite
   * bet: it asks you to stay clean, which is a plan you can actually hold.
   */
  | { readonly kind: 'hullAbovePct'; readonly value: number }
  /**
   * The same two lines, read on the TARGET instead of on you.
   *
   * `hullBelowPct` and `hullAbovePct` are about the state of your own run;
   * these are about the state of the thing in front of you, which is a
   * different question and a different kind of card. Below is an execution —
   * it asks you to pick the one that is nearly dead. Above is an opener — it
   * asks you to pick the one that is still whole, which against a pack is the
   * opposite instruction and against a boss is free.
   *
   * A condition rather than an op, and a pair rather than one, for the same
   * reason the pilot's own two are a pair: a lone "below" only ever produces
   * finishers, and a deck of finishers has nothing to do on turn one.
   */
  | { readonly kind: 'targetHullBelowPct'; readonly value: number }
  | { readonly kind: 'targetHullAbovePct'; readonly value: number }
  /**
   * Something died during this card's resolution.
   *
   * A condition rather than an op, which matters: effects run in order, so an
   * execution card is a plain `damage` followed by a `conditional` that reads
   * what the damage did. No new vocabulary, no trigger system, and the reward
   * is written in the same place as everything else the card does.
   *
   * Scoped to the card, not the turn — otherwise every card played after a
   * kill would collect the bounty.
   */
  | { readonly kind: 'killedThisPlay' };

export type ScaleSource =
  | 'currentHeat'
  | 'focus'
  | 'blockGainedThisTurn'
  | 'cardsPlayedThisTurn'
  /**
   * Cards this card has discarded so far in its own resolution.
   *
   * Scoped to the play, like `killsThisPlay` and for the same reason: "for
   * each card discarded" has to mean the ones this card threw away, not the
   * ones the last one did. It reads the effect context rather than the combat
   * state, which is why `scaleValue` takes both.
   */
  | 'discardedThisPlay'
  /**
   * Whole percentage points of health the TARGET has lost.
   *
   * The scaling half of the enemy-health family — `targetHullBelowPct` is a
   * threshold and this is a slope. Written in percentage points rather than raw
   * health so one card reads the same against a 30-hull Shard and a 430-hull
   * boss: "for every 10% of health the target is missing" is a sentence about
   * how the fight is going, not about which enemy is in front of you.
   */
  | 'targetHullMissingPct';

export type EffectOp =
  /**
   * `plusPer` scales the SIZE of the hit. `scaleWith` scales the NUMBER of them.
   *
   * Both were spelled the same way for a long time — a `scaleWith` wrapping a
   * `damage` — and that is the whole reason this field exists. "Deal 3 more
   * damage per Focus" compiled into one extra 3-damage instance per stack, so
   * The Whole Sword at six Focus was NINE separate swings. Every per-hit bonus
   * in the game then multiplied by nine: Strength is flat per hit, a
   * `damageEveryHit` relic is flat per hit, and a card that reads as one big
   * swing was quietly the best possible carrier for both.
   *
   * The fix is not smaller numbers, it is fewer instances. A card that says
   * "deal more damage" now deals ONE hit that is bigger, which is also what the
   * words always meant. `times` still exists for cards that genuinely swing
   * more than once, and those are now the only cards that stack per-hit bonuses
   * — which is a property you can look at a card and see.
   *
   * Read ONCE, before the first swing, from the state the op started in. A
   * multi-hit card whose own damage moves the source — `targetHullMissingPct`
   * is the obvious one — must not grow mid-card, or the second swing is bigger
   * than the first for reasons nothing on the face explains.
   */
  | {
      readonly op: 'damage';
      readonly amount: number;
      readonly target: Target;
      readonly times?: number;
      readonly plusPer?: {
        readonly source: ScaleSource;
        readonly per: number;
        readonly amount: number;
      };
    }
  | { readonly op: 'block'; readonly amount: number }
  | { readonly op: 'applyStatus'; readonly status: StatusId; readonly stacks: number; readonly target: Target }
  | { readonly op: 'gainHeat'; readonly amount: number }
  | { readonly op: 'ventHeat'; readonly amount: number }
  | { readonly op: 'gainFocus'; readonly amount: number }
  | { readonly op: 'setStance'; readonly stance: StanceId }
  | { readonly op: 'cycleStance'; readonly direction: 1 | -1 }
  | { readonly op: 'draw'; readonly amount: number }
  /**
   * `all` throws the whole hand and ignores `amount`.
   *
   * A flag rather than a large number, so the generated text can say "Discard
   * your hand" instead of "Discard 99" — which is what the player would have
   * read, and which is a lie about the rule as well as ugly.
   */
  | {
      readonly op: 'discard';
      readonly amount: number;
      readonly random?: boolean;
      readonly all?: boolean;
    }
  | { readonly op: 'gainEnergy'; readonly amount: number }
  | { readonly op: 'exhaustSelf' }
  | { readonly op: 'addCardToHand'; readonly cardId: CardId; readonly upgraded?: boolean }
  /**
   * A health delta. Positive regains it; NEGATIVE pays it.
   *
   * Extended rather than joined by a second op, because "lose 2 health" is the
   * same fact as "regain 2 health" with the sign flipped, and the effect-op
   * vocabulary is meant to stay small. A negative amount is charged straight to
   * the hull: unblockable, unaffected by Vulnerable, and not a hit — a cost you
   * chose to pay is not something that happened to you.
   */
  | { readonly op: 'heal'; readonly amount: number }
  /**
   * Alloy, from inside a fight.
   *
   * The one place the combat vocabulary reaches into the run, and it earns it:
   * a bounty you collect by killing something is a different promise from a
   * bounty you collect by winning, and only the first one changes how you pick
   * a target. Kept to a single scalar so it cannot grow into a second run-effect
   * vocabulary living in the wrong file.
   */
  | { readonly op: 'gainAlloy'; readonly amount: number }
  | { readonly op: 'conditional'; readonly when: Condition; readonly then: readonly EffectOp[]; readonly else?: readonly EffectOp[] }
  | { readonly op: 'scaleWith'; readonly source: ScaleSource; readonly per: number; readonly then: readonly EffectOp[] };

/* ---------- content definitions ----------
   Not state. Optionals are fine here. */

/**
 * `voided` is the game's word for a curse.
 *
 * A card you did not choose, cannot play, and have to pay a Safe Planet or a
 * Station to be rid of. It is the price tag on the Anomaly options that offer
 * something for nothing — those are the ones that need a cost the reward
 * screen cannot express, because the cost is *carrying it for the rest of the
 * run*.
 */
export type CardType = 'attack' | 'skill' | 'power' | 'status' | 'voided';

/**
 * The tier ladder. `basic` is the starting deck and is never offered.
 *
 * Above `rare`, DESIGN.md §8's damage curve says nothing — these tiers are
 * inventions and the simulator has to earn them. The intent, so they stay
 * distinct rather than becoming "rare but bigger":
 *
 *   common     the yardstick — 6 damage or 6 block per Energy, no strings
 *   uncommon   ~8 per Energy, or the yardstick with a rider
 *   rare       9-11 per Energy with a condition, or a small rule change
 *   epic       a rule change with a real cost — exhaust, Heat, health
 *   legendary  run-defining; you build around it
 *   artifact   unique, and changes how a whole system reads
 */
export type Rarity = 'basic' | 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic' | 'artifact';

/** Offerable tiers, weakest first. The order drives sorting and display. */
export const RARITY_ORDER: readonly Rarity[] = [
  'basic',
  'common',
  'uncommon',
  'epic',
  'legendary',
  'mythic',
  'artifact',
];

export interface StanceRider {
  readonly stance: StanceId;
  readonly effects: readonly EffectOp[];
}

export interface CardDef {
  readonly id: CardId;
  readonly name: string;
  readonly type: CardType;
  readonly rarity: Rarity;
  readonly archetype: Archetype;
  readonly cost: number | 'X';
  readonly effects: readonly EffectOp[];
  readonly stanceRider?: StanceRider;
  /**
   * Optional in the type, required by the validator for everything except a
   * `voided` card — which has nothing to become, by definition.
   *
   * The split is deliberate: the type says what is representable, the content
   * validator says what is allowed, and only the validator knows the rule is
   * about card type. Making this required would mean every curse shipping a
   * fake upgrade nobody can ever reach.
   */
  readonly upgrade?: Partial<
    Pick<CardDef, 'cost' | 'effects' | 'stanceRider' | 'name' | 'exhaust'>
  >;
  readonly exhaust?: boolean;
  readonly innate?: boolean;
  /**
   * Handed out by one specific event or thread and never rolled. Keeps a card
   * that is the whole point of a choice from also turning up in a shop.
   */
  readonly exclusive?: boolean;
  /**
   * This card reads the Focus stack without spending it.
   *
   * A card-level exception, not a change to the stance layer: Focus still banks
   * in GUARD and is still spent by attacks in IAI. This one simply declines to
   * be the attack that spends it, which is what lets a card scale on the stack
   * and leave it standing for the swing that follows.
   */
  readonly keepsFocus?: boolean;
  /** Hand-written. Rules text is NOT — `describeCard()` generates that. */
  readonly flavor?: string;
}

/**
 * A declarative modifier to something the engine computes.
 *
 * Environments come in two halves. Anything that *reacts* — a rock at the end
 * of the round, a radiation tick — is a hook handler, because that is what the
 * bus is for. Anything that *modifies a calculation the engine is in the middle
 * of* is declared here instead: a hook cannot change the number a pipeline is
 * about to produce, only respond after it has. Splitting them this way keeps
 * one damage pipeline and one heat path rather than two of each.
 */
export interface EnvironmentRules {
  /**
   * Stellar Corona: Heat a CARD YOU PLAY gives you is this much larger.
   *
   * Cards only, deliberately. Applied to every source it also taxed the IAI
   * stance tick, Scald and enemy moves — three things the player cannot price
   * in when choosing what to play, so the corona read as a flat "you overheat
   * sooner" rather than a rule about the deck in your hand.
   */
  readonly heatGainBonus?: number;
  /** Deep Void: Heat falls on its own at the end of each turn. */
  readonly heatDecayPerTurn?: number;
  /**
   * Deep Void: draw one fewer on every Nth round, counting from the first.
   *
   * It used to be a turn-1 penalty, which cost you the opening and then left
   * the fight alone -- a one-off tax rather than a condition you play under.
   * `2` gives short, full, short, full: the short hands are the ones you have
   * to plan for, and the full ones are what you plan with.
   */
  readonly drawPenaltyEvery?: number;
  /**
   * Gravity Well: attacks at or above this threshold deal a flat bonus.
   *
   * Flat rather than a multiplier. A multiplier on the big hits scaled with the
   * player's own build, so the environment that was meant to reward one heavy
   * swing instead rewarded whoever already had the heaviest swing — the same
   * damage rule, worth twice as much to the deck that needed it least. A flat
   * bonus is worth the same to everybody who clears the bar, which is the rule
   * the badge describes.
   */
  readonly bigHitThreshold?: number;
  readonly bigHitBonus?: number;
  /** Gravity Well: how many stance changes a turn allows. */
  readonly stanceChangesPerTurn?: number;
  /**
   * Sensor Fog: intents are hidden on every Nth round, counting from the
   * first. `2` gives blind, clear, blind, clear.
   *
   * It used to be a boolean meaning "the whole fight", which made the fight a
   * different game rather than a harder one: with nothing ever readable there
   * is no plan to make, only Block to hold, and a whole fight of that is one
   * decision repeated. A cadence keeps the blindness and gives it a rhythm you
   * can play around -- what you learn on a clear round is worth carrying into
   * the blind one.
   */
  readonly hideIntentsEvery?: number;
  /** Chronal Shear: on every Nth round, the enemy queue is built twice. */
  readonly doubleActEvery?: number;
}

export interface EnvironmentDef {
  readonly id: EnvironmentId;
  readonly name: string;
  /** Shown on the map node badge before the player commits to the route. */
  readonly text: string;
  /** Which acts it can appear in. Absent means all of them. */
  readonly acts?: readonly (1 | 2 | 3)[];
  readonly rules?: EnvironmentRules;
}

/* An enemy's AI is data, not code: a set of named moves plus a script that
   picks between them. That keeps "adding an enemy is one file edit" true, and
   it keeps the choice reproducible from the seed. */

export interface EnemyMove {
  readonly id: string;
  /** Shown on the intent when the move is not a plain attack. */
  readonly label: string;
  /** What the intent renders. Attack amounts are recomputed at display time so
      the telegraphed number is exactly what will land. */
  readonly intent: readonly IntentTemplate[];
  /** Targets are relative to the actor: from an enemy, `enemy` means you. */
  readonly effects: readonly EffectOp[];
}

export type EnemyScript =
  /** Cycles the listed moves forever. A state machine with one axis. */
  | { readonly kind: 'sequence'; readonly moves: readonly string[] }
  /** Weighted roll on the `combat` stream, with a cap on consecutive repeats. */
  | {
      readonly kind: 'weighted';
      readonly entries: readonly { readonly move: string; readonly weight: number }[];
      readonly maxRepeats: number;
    }
  /**
   * Two sequences, and a hull percentage that switches between them.
   *
   * Bosses only. A fixed cycle is honest — you can see the whole fight from
   * turn one — but three moves in a fixed order is also a fight that is solved
   * on turn three and then merely performed. One threshold puts a second act in
   * it without costing the player anything they were promised: the telegraph is
   * still committed a turn ahead, still exact, and still never re-rolled.
   *
   * `closing` restarts from its first move when the threshold is crossed rather
   * than continuing the running index, so the change is legible as a change.
   * Deriving that from `lastMoveId` keeps `EnemyAiState` — and so `GameState` —
   * exactly the shape it already was.
   */
  | {
      readonly kind: 'phased';
      /** Percent of max hull at or below which `closing` takes over. */
      readonly threshold: number;
      readonly opening: readonly string[];
      readonly closing: readonly string[];
    };

export interface EnemyDef {
  readonly id: EnemyId;
  readonly name: string;
  readonly maxHp: number;
  readonly act: 1 | 2 | 3;
  readonly tier: 'normal' | 'elite' | 'boss';
  readonly moves: readonly EnemyMove[];
  readonly script: EnemyScript;
  /**
   * A target-side rule in the damage pipeline. Act 3's counter-enemies read the
   * player's build, and "takes 60% less from anything over 20" is a rule about
   * a number the pipeline is producing, so it is declared rather than hooked.
   */
  readonly damageRules?: {
    readonly overAmount: number;
    readonly multiplier: number;
    readonly label: string;
  };
  readonly flavor?: string;
}

/* ---------- statuses ----------
   A status is data: a name, how it decays, and which damage-pipeline step it
   feeds. Nothing about Vulnerable or Weak is special-cased in the pipeline —
   they are rows in a table, which is what keeps the keyword count honest. */

export interface StatusDef {
  readonly id: StatusId;
  readonly name: string;
  /** Plain words, shown on hover and in the log. */
  readonly text: string;
  readonly kind: 'buff' | 'debuff';
  /** `turn`: one stack falls off at the end of the holder's turn. */
  readonly decay: 'turn' | 'never';
  /**
   * When `damagePerTurn` and `heatPerTurn` fire. Default `turnStart`.
   *
   * `turnEnd` also moves where the stack falls off: it goes immediately after
   * the tick rather than with everything else at the end of the round. The two
   * belong together — a status that bites as you finish your turn and then
   * lingers a whole round longer is a status whose cost you cannot count.
   *
   * Rust is `turnEnd` and Scald is not, and that is the difference between the
   * two: Scald is a clock you plan the turn AROUND, so it has to be on the
   * board before you spend anything. Rust is a price the turn charges you for
   * having taken it.
   */
  readonly tickAt?: 'turnStart' | 'turnEnd';
  /** Flat damage added per stack, on attacks the holder makes. Strength-likes. */
  readonly damageDealtFlat?: number;
  /** Multiplier on damage the holder deals. Weak is 0.75. */
  readonly damageDealtMult?: number;
  /** Multiplier on damage the holder takes. Vulnerable is 1.25. */
  readonly damageTakenMult?: number;
  /**
   * Flat reduction, per stack, on attacks that reach the holder.
   *
   * Tempered's half of the defensive game. Applied with the relic plating in
   * step 5 of the pipeline — after everything that multiplies, before Block —
   * because armour is the last thing between a number and you, and applying it
   * earlier would let a Vulnerable multiply the reduction back up again.
   */
  readonly damageTakenFlat?: number;
  /**
   * Floor on the compounded multiplier, however many stacks are held.
   *
   * Stacks compound — `value ** stacks` — so an uncapped 0.75 reaches 0.32 at
   * four stacks and keeps going. A debuff that can take two thirds of an
   * enemy's output off the table stops being a tempo play and becomes the
   * whole answer to a fight. Declared here rather than clamped in the pipeline
   * so the cap is a property of the status, visible next to the number it
   * caps, and so `describeStatus` can say it out loud.
   */
  readonly multFloor?: number;
  /**
   * One stack falls off when the holder vents this much Heat in a single
   * action.
   *
   * Scald's problem was that it never went away and every turn added another
   * Heat, so a long fight turned a two-stack debuff into a second overheat
   * clock the player could not touch. There was no counterplay at all — only
   * the hope of ending the fight before the arithmetic did.
   *
   * A vent big enough to matter is the counterplay, which is the right one: it
   * is the same resource the status attacks, so answering Scald costs you the
   * cards you would rather have spent on damage. Declared here rather than
   * hooked because the rule belongs to the status and reads better beside the
   * number it undoes, and so `describeStatus` can say it out loud.
   */
  readonly shedOnVent?: number;
  /**
   * Unblockable damage per stack, at the start of the holder's turn.
   *
   * Declared rather than hooked so a rust is a row in a table instead of a
   * handler somewhere else: the tick lives in one place and every status that
   * wants one gets the same one.
   */
  readonly damagePerTurn?: number;
  /** Heat gained per stack at the start of the turn. Player only — enemies have no gauge. */
  readonly heatPerTurn?: number;
  /**
   * Extra Energy each turn while ANY stack is held. Player only.
   *
   * The one status field that is deliberately not per-stack, because for this
   * one the stacks are the **duration** rather than the size: three stacks is
   * three turns of the same bonus, not one turn of three Energy. Per-stack
   * would make the same card either a brief enormous spike or a long
   * negligible one, and neither is "you are faster for a while".
   *
   * Read where the turn's Energy is computed rather than in the status tick,
   * so a turn the reactor took still grants nothing — an overheat that costs
   * you a turn must not be quietly refunded.
   */
  readonly energyWhileHeld?: number;
}

/* ---------- run-scope effects ----------
   What an event option or a thread payoff does. Deliberately a SEPARATE
   vocabulary from `EffectOp`: that one is combat-scoped and interpreted inside
   a fight, this one moves the run. Sharing them would mean every card op had to
   answer "and what does this do outside combat", which is how an op vocabulary
   turns into a scripting language.

   Same rule as cards, though: an event is data, never code, and the text the
   player reads is GENERATED from these by `describeRunEffects()`. */

export type RunEffect =
  | { readonly op: 'alloy'; readonly amount: number }
  /** The ronin. Negative can never take the last point — an event is not a death. */
  | { readonly op: 'health'; readonly amount: number }
  | { readonly op: 'maxHealth'; readonly amount: number }
  | { readonly op: 'card'; readonly cardId: CardId; readonly upgraded?: boolean }
  | { readonly op: 'upgradeRandomCard' }
  | { readonly op: 'removeRandomCard' }
  /**
   * A relic handed over by name rather than rolled. The only way to get one of
   * the relics marked `exclusive`, which is the point: an artifact that drops
   * from a weighted table is luck, and an artifact you were given for doing a
   * specific thing three times is a run you remember.
   */
  | { readonly op: 'relic'; readonly relicId: RelicId }
  | { readonly op: 'setThread'; readonly threadId: ThreadId }
  | { readonly op: 'resolveThread'; readonly threadId: ThreadId }
  /** A fight that arrives instead of whatever the node was going to be. */
  | { readonly op: 'ambush'; readonly tier: 'combat' | 'elite' };

/**
 * A generated run-effect line, in pieces, so the UI can make the things it
 * names inspectable. Built by `describeRunEffectSegments`.
 */
export type RunSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'card'; readonly cardId: CardId; readonly text: string }
  | { readonly kind: 'thread'; readonly threadId: ThreadId; readonly text: string };

export interface EventOption {
  readonly id: string;
  readonly label: string;
  /** Hand-written framing. The mechanical line underneath it is generated. */
  readonly detail: string;
  readonly effects: readonly RunEffect[];
  /**
   * Legible risk categories rather than hidden dice — the player should be able
   * to tell what KIND of thing might happen, even when the amount is deferred.
   */
  readonly risk: string;
  readonly payoff: string;
  /** `true` on the always-available, always-worthless "leave" option. */
  readonly isLeave?: boolean;
  /** Only shown when the run already carries this thread. */
  readonly requiresThread?: ThreadId;
}

export interface EventDef {
  readonly id: EventId;
  readonly name: string;
  readonly body: string;
  /** Which acts it can appear in. Absent means all of them. */
  readonly acts?: readonly (1 | 2 | 3)[];
  /**
   * Never rolled at an ordinary Anomaly — only reachable from a node that
   * names it. The Reliquary is placed at one exact row and must not also turn
   * up two nodes earlier by chance.
   */
  readonly pinnedOnly?: boolean;
  readonly options: readonly EventOption[];
}

export type ThreadTone = 'positive' | 'mixed' | 'costly';

/** When a thread comes due. Counted in nodes entered since it was set. */
export interface ThreadTrigger {
  readonly kind: 'nodes';
  readonly count: number;
}

export interface ThreadDef {
  readonly id: ThreadId;
  readonly name: string;
  /** What the Manifest panel shows. The player must always be able to see this. */
  readonly description: string;
  readonly tone: ThreadTone;
  /** The category of what is coming. Never the exact payoff — see DESIGN.md §6. */
  readonly omen: string;
  readonly trigger: ThreadTrigger;
  readonly payoff: readonly RunEffect[];
  /**
   * Whether it can be taken again once it has come due.
   *
   * Off by default, and that default is the important one — a Thread is a
   * promise the run makes once, and a debt you can pay twice is not a debt.
   * The Rites is the exception: kneeling at a second shrine is a thing a
   * person does, and doing it three times is what `mastery` below pays for.
   */
  readonly repeatable?: boolean;
  /**
   * A second payoff, on the Nth time it comes due in one run. Fires *as well
   * as* the ordinary payoff, not instead of it.
   *
   * Declared rather than hooked because a resolved Thread stops being a hook
   * source the instant it resolves — the handler would be unregistered at
   * exactly the moment it needed to fire.
   */
  readonly mastery?: {
    readonly after: number;
    readonly effects: readonly RunEffect[];
    /**
     * What the arrival screen says when it lands.
     *
     * The mastery payoff is the largest single thing that can happen to a run,
     * and it used to arrive as one more line in the Thread's payout list — "The
     * Sect Reliquary", in the same type as "Regain 10 health", with nothing
     * anywhere saying it was the third rite that did it or what the thing does.
     * A moment that took most of a run to earn has to be told as a moment.
     */
    readonly revelation?: {
      /** The eyebrow. Names the ACHIEVEMENT, not the reward. */
      readonly head: string;
      /** Lore. Vague on purpose — the rules text below it is the precise half. */
      readonly body: readonly string[];
      /** The causal line: what you did, in as many words as it takes. */
      readonly because: string;
    };
  };
}

/**
 * A Stance Mastery permanently rewrites one stance for the rest of the run.
 *
 * That is the "one axis, recontextualized" lever: a mastery makes the entire
 * existing deck read differently without adding a single card. It is expressed
 * as an override of the stance table rather than as behaviour, so everything
 * that already reads a stance keeps working and nothing is special-cased.
 */
/**
 * What a relic does, declared rather than hooked.
 *
 * Same split as environments: a hook cannot change a number the engine is about
 * to produce, only react after it has. Every field here modifies something the
 * turn loop or the damage pipeline is already computing, so they are declared
 * and aggregated by `pilotRules()`. A relic that wants to *do* something at a
 * moment registers a hook handler as well — its id is a hook source.
 *
 * This is the progression axis the run was missing. Cards make the deck better
 * at what it does; relics change what the deck is allowed to do, and they are
 * the only thing in the game that raises Energy or draw.
 */
export interface RelicPassive {
  /**
   * Gates the WHOLE passive on the hull, as a percentage of maximum.
   *
   * One field rather than a conditional variant of every number, because the
   * interesting relics are the ones that turn on all at once at a threshold —
   * "while you are nearly dead this thing hits like a truck" is one rule, not a
   * conditional bolted onto `damageFlat`.
   *
   * Read inside `pilotRules`, which is where every consumer already looks, so a
   * gated passive is invisible to the preview, the damage pipeline and the
   * totals panel in exactly the same way at exactly the same moment. A gate
   * that only some of those honoured would be a preview that disagrees with the
   * result, which is the one thing the pipeline may never do.
   *
   * `maxHealth` is deliberately never gated: it applies once when the relic is
   * taken and never again, so a threshold on it would mean nothing.
   */
  readonly whenHullBelowPct?: number;
  readonly whenHullAbovePct?: number;
  readonly energyPerTurn?: number;
  readonly drawPerTurn?: number;
  /**
   * Extra cards on the FIRST turn of a fight only.
   *
   * Declared rather than hooked, and this one is not a preference — a hook
   * cannot do it at all. `onTurnStart` fires before the hand is dealt, and
   * `drawForTurn` subtracts whatever is already in hand on turn 1 so that an
   * innate card occupies a slot instead of adding one. A hook that drew a card
   * there would have it subtracted straight back out: the relic fires, the log
   * says it fired, and the hand is the same size. Folded into the count itself,
   * there is no ordering left to get wrong.
   */
  readonly drawFirstTurn?: number;
  readonly blockPerTurn?: number;
  readonly focusPerTurn?: number;
  readonly ventPerTurn?: number;
  /** Health back at the start of each turn. Capped at the pilot's maximum. */
  readonly healPerTurn?: number;
  /**
   * Health back whenever an enemy dies. Capped at the pilot's maximum.
   *
   * Declared rather than hooked, even though a kill is a MOMENT and moments are
   * usually hook territory — because implants stack and hooks do not. A hook
   * fires once per registered source however many copies you have fitted, so a
   * hook-based version of this would have made the second Reclaim Loop do
   * literally nothing while still charging for it. `pilotRules` already sums a
   * passive across stacks, so declaring it is the only shape that can count.
   */
  readonly healPerKill?: number;
  /**
   * Added to the FIRST swing of every card you play.
   *
   * Every target of that swing gets it; later swings of the same card get
   * none. That is what keeps a three-hit card from tripling flat bonuses, and
   * it is the reason the shelf has two of these rather than one.
   */
  readonly damageFlat?: number;
  /**
   * Added to EVERY swing, including the later hits of a multi-hit card.
   *
   * The other half of the pair, and the expensive one — on a card that swings
   * three times it is worth three times what `damageFlat` is, so the numbers
   * on it are correspondingly smaller. Split rather than replaced because the
   * two make genuinely different builds: `damageFlat` rewards a deck of heavy
   * single swings, this rewards a deck that hits often, and a shelf that only
   * had one of them only ever asked one question.
   */
  readonly damageEveryHit?: number;
  /** Taken off every attack that reaches you, after Block. */
  readonly damageTakenFlat?: number;
  /** Moves the overheat threshold. Positive means more room. */
  readonly overheatThreshold?: number;
  /** On top of whatever the stance pays per stack. */
  readonly focusPerStackBonus?: number;
  /** Applied once, when the relic is taken. */
  readonly maxHealth?: number;
  readonly startingFocus?: number;
}

export interface RelicDef {
  readonly id: RelicId;
  readonly name: string;
  /** Hand-written framing. The mechanical line is generated from `passive`. */
  readonly text: string;
  readonly rarity: Rarity;
  readonly passive?: RelicPassive;
  /**
   * Kept out of the offer pool. It has to be granted by name — a `relic` run
   * effect — so the only way to hold it is to have done the thing that hands
   * it over.
   */
  readonly exclusive?: boolean;
  readonly flavor?: string;
}

/**
 * An implant. A relic you buy, and one you can buy twice.
 *
 * Relics are found; implants are *aimed at*. That is the whole reason both
 * exist: Alloy used to convert into a card, one forge, one removal and a rare
 * Mastery, so it piled up and the pilot never got faster or hit harder. An
 * implant is what saving three fights' worth of Alloy is for, and the big three
 * — an Energy, a card, damage on every attack — change how many cards a turn you
 * get to play rather than adding another card to draw.
 *
 * Same declared-passive machinery as a relic, so  aggregates both
 * and nothing downstream knows the difference.
 */
export interface ImplantDef {
  readonly id: ImplantId;
  readonly name: string;
  readonly rarity: Rarity;
  readonly price: number;
  readonly passive: RelicPassive;
  /**
   * How many times one run may fit this.
   *
   * Stacking is the point for the small ones — two Honed Edges is +4 on every
   * attack, and that is a build. The run-definers are capped at one so a pile of
   * Alloy cannot simply buy six Energy.
   */
  readonly maxStacks: number;
  readonly flavor?: string;
}

export interface MasteryDef {
  readonly id: MasteryId;
  readonly name: string;
  readonly stance: StanceId;
  /** Hand-written: the trade, in plain words, for the reward screen. */
  readonly text: string;
  readonly overrides: {
    /** Replaces the stance strip's line, which must never lie about behaviour. */
    readonly text?: string;
    readonly firstAttackBonus?: number;
    readonly heatAtTurnEnd?: number;
    readonly ventAtTurnEnd?: number;
    readonly blockRetained?: number;
    readonly extraDraw?: number;
    readonly attackPenalty?: number;
    readonly spendsFocus?: boolean;
    readonly focusPerStack?: number;
    /** Iron Tide's cost: you may only change stance this many times a turn. */
    readonly stanceChangesPerTurn?: number;
  };
}

/* ---------- log ----------
   Every transition appends one of these. It is simultaneously the debugger and
   the player's answer to "why did I take 19 damage". Damage never happens
   without a log line. */

export type LogKind =
  | 'run'
  | 'combat'
  | 'card'
  | 'damage'
  | 'block'
  | 'heat'
  | 'stance'
  | 'status'
  | 'hook'
  | 'reward'
  | 'thread'
  | 'debug';

export interface LogEntry {
  readonly turn: number;
  readonly round: number;
  /** Who caused it: a card id, enemy id, `'player'`, `'system'`. */
  readonly source: string;
  readonly kind: LogKind;
  readonly text: string;
  readonly detail: { readonly [key: string]: JsonValue } | null;
}

/* ---------- combat state ----------
   Populated at M1. The shape is fixed by the rules in the build prompt §5, so
   it is declared now: the hook payload types below refer to it. */

export interface StatusStack {
  readonly status: StatusId;
  readonly stacks: number;
  /**
   * Applied since its holder last acted, so the coming decay skips it once.
   *
   * Without this, a debuff an enemy puts on you during the enemy phase is
   * stripped by the decay at the end of that same round — it is applied, logged,
   * and gone before you ever take a turn under it. Every enemy debuff in the
   * game was silently doing nothing.
   *
   * Cleared when the holder acts: at the start of the player's turn, and when an
   * enemy takes its action. So a status is always live for exactly one turn of
   * whoever is carrying it, whichever phase it arrived in.
   */
  readonly fresh: boolean;
}

/** What a move declares. The amount is filled in at display time for attacks. */
export interface IntentTemplate {
  readonly kind: 'attack' | 'block' | 'buff' | 'debuff';
  readonly amount: number;
  readonly times: number;
  readonly label: string;
}

/** What the player sees. Exact, and rendered as `3 x 5` when `times > 1`. */
export interface IntentHit extends IntentTemplate {
  /** For attacks: the number that will actually land, before Block absorbs it. */
  readonly amount: number;
}

export interface EnemyAiState {
  /** Cursor into a `sequence` script. Seeded per FIGHT, not always 0. */
  readonly moveIndex: number;
  readonly lastMoveId: string | null;
  /** Consecutive plays of `lastMoveId`, so a `weighted` script can cap repeats. */
  readonly repeats: number;
  /**
   * The last few move ids, most recent first, for recency weighting.
   *
   * Capped at `AI.recency.length` so it can never grow — this is a field in
   * `GameState` and therefore in every serialised replay, and an unbounded
   * history would make a long fight's state grow with its length.
   */
  readonly recent: readonly string[];
}

export interface EnemyState {
  /** Unique within the combat — two copies of one `defId` are two instances. */
  readonly uid: string;
  readonly defId: EnemyId;
  readonly hp: number;
  readonly maxHp: number;
  readonly block: number;
  readonly statuses: readonly StatusStack[];
  /**
   * The move committed at telegraph time. It does NOT re-roll after the player
   * acts — that is a correctness requirement, not a nicety. The numbers shown
   * for it are recomputed on every render so the telegraph cannot drift from
   * what will land; the *choice* is what is frozen here.
   */
  readonly intentMoveId: string | null;
  readonly ai: EnemyAiState;
}

export interface CardInstance {
  /** Unique per physical copy, so two IAI Slashes are distinguishable. */
  readonly uid: string;
  readonly defId: CardId;
  readonly upgraded: boolean;
}

export interface CombatState {
  readonly encounterId: EncounterId;
  readonly environmentId: EnvironmentId;
  readonly turn: number;
  readonly round: number;
  readonly stance: StanceId;
  readonly heat: number;
  readonly energy: number;
  readonly block: number;
  readonly focus: number;
  readonly statuses: readonly StatusStack[];
  readonly draw: readonly CardInstance[];
  readonly hand: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
  readonly exhaust: readonly CardInstance[];
  readonly enemies: readonly EnemyState[];
  readonly cardsPlayedThisTurn: number;
  readonly blockGainedThisTurn: number;
  /** Gravity Well and the Iron Tide mastery both cap this. */
  readonly stanceChangesThisTurn: number;
  /**
   * Scratch space owned by the environment's hook handlers and by nothing else.
   *
   * Two of the eight environments need to remember something across a round —
   * which rock is marked, which intents have been scanned. A field per
   * environment on `CombatState` would be six dead fields in every other fight,
   * so they share one bag. It is plain JSON like the rest of state, and the
   * helpers in `combat/environment.ts` are the only things that touch it.
   */
  readonly envMemory: { readonly [key: string]: JsonValue };
  /**
   * Damage instances the player has dealt this turn, not cards played. The IAI
   * passive fires on instance 0 only, so a card whose rider adds a second hit
   * gets the bonus once — 6 base + 4 rider + 4 stance = 14, per DESIGN.md §1.
   */
  readonly attacksThisTurn: number;
  /** Energy lost next turn, from a critical overheat. */
  readonly energyPenaltyNextTurn: number;
  /**
   * The reactor cooked and takes your next turn. Set by an overheat, spent at
   * the start of the turn it costs you.
   */
  readonly skipNextTurn: boolean;
  /**
   * Cards the reactor is owed, to be taken out of the hand you draw next.
   *
   * An overheat used to burn a card the instant it resolved — out of the hand
   * that was about to be discarded anyway, at the end of the turn. Correct, and
   * completely invisible: the card left a hand that was already leaving, so
   * nobody ever saw the most memorable thing an overheat does.
   *
   * Owed instead, and collected after the next hand is dealt. The cost is the
   * same — a vent turn hands you 0 Energy, so a card off that hand is a card
   * you could not have played either way — and now it happens on its own beat,
   * in front of you, with a sound and a card burning up where it sat.
   *
   * A count rather than a flag because nothing says only one thing can owe one.
   */
  readonly burnOwed: number;
  /**
   * Enemies that still owe an action this round, in order. The player's turn
   * ends by filling this; the round ends when it empties. Stepping one enemy
   * at a time is what lets the UI pace the enemy turn instead of resolving the
   * whole thing in a single frame.
   */
  readonly pendingEnemies: readonly string[];
  /** The enemy acting right now, so the UI can point at it. */
  readonly actingUid: string | null;
  readonly outcome: 'ongoing' | 'won' | 'lost';
}

/* ---------- the map ----------
   A DAG of rows. Every node knows only which nodes in the next row it leads
   to, which is all routing needs and all the renderer needs. */

export type NodeType =
  | 'combat'
  | 'elite'
  | 'boss'
  | 'event'
  | 'station'
  | 'safe'
  | 'unknown';

export interface MapNode {
  readonly id: string;
  /**
   * What the place is called. Generated with the map, so it is part of the
   * seed. Short on purpose — this exists so a route can be held in your head
   * and named out loud, which "the third dot from the left" cannot be.
   */
  readonly name: string;
  readonly row: number;
  readonly col: number;
  /**
   * Where it sits on the chart, 0..1, with `y` measured from the top so the
   * boss is near 0 and the origin near 1. Generated with the rest of the map
   * so the layout is part of the seed — the same seed draws the same sky, and
   * the UI positions nodes rather than deciding where they go.
   */
  readonly x: number;
  readonly y: number;
  readonly type: NodeType;
  /** Combat nodes only. */
  readonly encounterId: EncounterId | null;
  /**
   * An Anomaly this node always shows, instead of rolling one.
   *
   * Exists for the Reliquary, which has to be at a known place rather than
   * somewhere the events stream happens to put it. Generated with the map, so
   * it is part of the seed like everything else on a node.
   */
  readonly eventId: EventId | null;
  /** Shown on the badge before the player commits to the route. */
  readonly environmentId: EnvironmentId | null;
  /** Node ids this leads to. Empty on the boss. */
  readonly next: readonly string[];
}

export interface RunMap {
  readonly act: 1 | 2 | 3;
  readonly nodes: readonly MapNode[];
  /**
   * The origin. Always exactly one, always the same kind of place — you arrive
   * where you arrive, and the first decision is which of the 3-6 lanes out of
   * it you take.
   */
  readonly startId: string;
  readonly bossId: string;
}

/* ---------- run ---------- */

export interface ThreadState {
  readonly threadId: ThreadId;
  readonly resolved: boolean;
  /** Nodes entered since it was set. The trigger reads this. */
  readonly progress: number;
  /** How many times it has come due this run. Only `repeatable` ones exceed 1. */
  readonly completed: number;
}

/** The ronin themself: health, deck, and the two kinds of permanent upgrade. */
export interface PilotState {
  readonly health: number;
  readonly maxHealth: number;
  readonly deck: readonly CardInstance[];
  readonly masteries: readonly MasteryId[];
  /** Passive items, found. */
  readonly relics: readonly RelicId[];
  /**
   * Passive items, bought. Repeats are meaningful — this is a list, not a set,
   * because two of the same implant stack up to its .
   */
  readonly implants: readonly ImplantId[];
}

export type RunOutcome = 'won' | 'died' | 'abandoned';

/**
 * The collapse front, chasing you up the act.
 *
 * `time` is spent per node entered — more at a Station or a Safe Planet, which
 * is the whole point. The front sits at `time - grace` rows, so every detour
 * literally costs you a row of lead, and reaching a fight with the front on top
 * of you starts that fight already in trouble.
 *
 * From Act 2 only. At an hour a run the midgame sags without it; in Act 1 it
 * would just be noise on top of a player still learning the stance layer.
 */
export interface WavefrontState {
  readonly time: number;
  /** The row it has reached. Behind you is negative distance, not zero. */
  readonly row: number;
  /** Set when you enter a fight with the front on you. Spent by that fight. */
  readonly hazardPending: boolean;
}

/**
 * A reward screen. Card choices plus Skip, and Skip is always real — a reward
 * you must take is not a decision, and a bloated deck is its own punishment.
 */
export interface RewardOffer {
  readonly cardIds: readonly CardId[];
  /**
   * Relics on offer, from a boss. Three of them, and you take one — an act
   * finale should hand you a decision about what the rest of the run is, not a
   * thing that happened to you.
   */
  readonly relicIds: readonly RelicId[];
  readonly takenRelic: RelicId | null;
  /**
   * Implants on offer, from a boss only. Three, and you take one — alongside
   * the three relics rather than instead of them.
   *
   * An act finale is the one place the run's shape is allowed to change twice.
   * Relics are what a turn can do; implants are what a card is worth, and
   * asking both questions at once is what makes a boss feel like a chapter
   * ending rather than a bigger enemy.
   */
  readonly implantIds: readonly ImplantId[];
  readonly takenImplant: ImplantId | null;
  readonly alloy: number;
  /** Cards already taken from this screen. One pick, but the shape allows more. */
  readonly taken: readonly CardId[];
  readonly alloyClaimed: boolean;
}

/**
 * An Anomaly in progress. Two beats: read the situation and choose, then read
 * what it cost you and move on. The second beat is why the choice is kept in
 * state rather than resolved and discarded — an outcome you scroll past in the
 * log is an outcome the player never connects to the decision.
 */
export interface LandingState {
  readonly nodeId: string;
  /**
   * The SECOND screen, shown after the node has already happened rather than
   * before it.
   *
   * A `?` that turns out to be a derelict used to pay its Alloy and drop you
   * back on the chart in the same frame, so the one outcome with nothing to
   * decide was also the one that never got said out loud — it read as the node
   * doing nothing at all. Leaving this one goes back to the map instead of
   * resolving the node again, which it would otherwise do, and re-rolling a `?`
   * you have already opened is a different node every time you look at it.
   */
  readonly outcome?: boolean;
  /** The place, by name. */
  readonly title: string;
  /** One or two sentences. Generated — see `describeLanding`. */
  readonly body: string;
  /**
   * Anything that resolved on the way in — a Thread coming due, mostly.
   *
   * Threads always worked; you just could not tell. The payoff landed as log
   * lines while the map was re-rendering, so a promise made five nodes ago paid
   * out into a scrollback nobody was reading and the whole system felt inert.
   * The arrival beat is where "what just happened" belongs.
   */
  /**
   * Threads that came due on the way in, and what each one did.
   *
   * Structured rather than a flat list of sentences, because the point is the
   * *causal link*: a promise you made five nodes ago, named, with the thing you
   * agreed to and the thing it just cost or gave. A player who cannot connect
   * the payout to the choice cannot learn from either.
   */
  readonly resolved: readonly ResolvedThread[];
}

export interface ResolvedThread {
  readonly threadId: ThreadId;
  readonly name: string;
  /**
   * Set only when this completion also paid the Thread's mastery.
   *
   * Kept separate from `lines` rather than appended to them: the ordinary
   * payoff and the once-a-run payoff are different sizes of event, and merging
   * them is what made the artifact read as a footnote to a heal.
   */
  readonly mastered?: {
    readonly times: number;
    readonly lines: readonly OutcomeLine[];
    /**
     * What it granted, by id, read off the mastery's own effects.
     *
     * Carried rather than left for the screen to find: an `OutcomeLine` names a
     * relic only inside its prose, and a UI that recovers "which artifact was
     * that" by reading a sentence is a UI that breaks when the sentence is
     * reworded.
     */
    readonly relicIds: readonly RelicId[];
    readonly head: string;
    readonly body: readonly string[];
    readonly because: string;
  };
  /** What you took on, in the words the Manifest has been showing all along. */
  readonly promise: string;
  /**
   * What it actually did, generated from the payoff effects.
   *
   * The same shape as an Anomaly's outcome, so a Thread coming due can name the
   * card it just handed you or took away and have that name open — the arrival
   * screen is the one place a payoff is read, and a card named there is one you
   * may never have seen.
   */
  readonly lines: readonly OutcomeLine[];
  readonly tone: ThreadTone;
}

/**
 * Something a line named, and where in the line it named it.
 *
 * `text` is the exact substring to make into a handle. A list rather than a
 * single reference because "Sever is upgraded to Sever+" names two different
 * cards in one sentence, and the whole point of the line is comparing them.
 */
export interface OutcomeRef {
  readonly text: string;
  readonly cardId?: CardId;
  /** Show the forged face of `cardId` rather than the printed one. */
  readonly upgraded?: boolean;
  readonly threadId?: ThreadId;
}

/** One line of an Anomaly's outcome, with whatever it named. */
export interface OutcomeLine {
  readonly text: string;
  readonly refs?: readonly OutcomeRef[];
}

export interface PendingEvent {
  readonly eventId: EventId;
  readonly chosenOptionId: string | null;
  /**
   * What happened, in order, once an option is taken.
   *
   * A line rather than a string, because the ones that name a card or a Thread
   * carry its id — "Sever leaves the deck" is the game telling you about a card
   * you may never have read, at the one moment it stops being available to
   * read. The UI turns the reference into something you can look at.
   */
  readonly outcome: readonly OutcomeLine[];
}

export interface ShopCardStock {
  readonly cardId: CardId;
  readonly price: number;
  readonly sold: boolean;
}

/**
 * A Station's stock. Rolled once on arrival and kept in state, so prices and
 * inventory cannot shuffle under the player between two clicks.
 */
export interface ShopState {
  readonly nodeId: string;
  readonly cards: readonly ShopCardStock[];
  /** Every Station stocks exactly one removal. The price rises per purchase. */
  readonly removalPrice: number;
  /**
   * Which of the three services this Station has already given, if any.
   *
   * One per Station, not one of each. With three independent flags a visit was
   * "strip, upgrade AND repair" — a shopping list rather than a decision, and
   * the Alloy was never the real constraint because the services barely
   * competed. Making them exclusive is what turns arriving at a Station into a
   * question about what the run needs most.
   *
   * The shelves are not affected: cards and implants are bought with Alloy, and
   * Alloy is its own limit.
   */
  readonly serviceUsed: 'strip' | 'forge' | 'repair' | null;
  /**
   * A Stance Mastery, sometimes. It moved here from the boss drop: rewriting a
   * stance should be a thing you decide you want and pay for out of the same
   * Alloy as everything else, not something an act finale hands you.
   */
  readonly masteryId: MasteryId | null;
  readonly masteryPrice: number;
  readonly masterySold: boolean;
  /**
   * The forge: Alloy for a card upgrade, one per Station.
   *
   * The Safe Planet was the only place a card could be improved, and it made
   * you choose between that and healing — so in practice nobody ever forged and
   * the deck only ever got bigger. A bigger deck is not progression. This is the
   * second source, and it costs the Alloy you were going to spend elsewhere.
   */
  readonly forgePrice: number;
  /**
   * Alloy per point of health, one patch-up per Station.
   *
   * The rate rather than a price, because what you pay depends on how hurt you
   * are and how much Alloy you have — both of which move while you shop. Held
   * from arrival like the rest of the stock, so the act's rate cannot change
   * under you mid-visit.
   */
  readonly repairRate: number;
  /** The implant shelf. What Alloy is actually for. */
  readonly implants: readonly ShopImplantStock[];
}

export interface ShopImplantStock {
  readonly implantId: ImplantId;
  readonly price: number;
  readonly sold: boolean;
}

/** What the player is looking at between fights. */
export type RunScreen =
  | 'map'
  /** The moment of arrival, before the node resolves into whatever it is. */
  | 'landing'
  | 'combat'
  | 'reward'
  | 'safe'
  | 'station'
  | 'event';

export interface RunState {
  /** Copyable, re-enterable. Not persistence — a number you can write down. */
  readonly seed: string;
  readonly depth: number;
  readonly rng: RngState;
  readonly act: 1 | 2 | 3;
  readonly map: RunMap | null;
  /** Node id the player is standing on, or `null` before the first move. */
  readonly position: string | null;
  readonly visited: readonly string[];
  readonly screen: RunScreen;
  /** The reward on offer, if a screen is showing one. */
  readonly pendingReward: RewardOffer | null;
  readonly alloy: number;
  readonly pilot: PilotState;
  readonly threads: readonly ThreadState[];
  /** The Anomaly on screen, if one is. */
  readonly pendingEvent: PendingEvent | null;
  /**
   * What you are looking at as you set down.
   *
   * A node used to resolve the instant it was clicked, so arriving somewhere
   * barren was indistinguishable from a misclick — nothing happened and the map
   * came back. This is the beat in between: the chart goes dark, the place says
   * what it is, and then it becomes a fight or a shop or nothing at all.
   */
  readonly landing: LandingState | null;
  /** Anomalies already spent this run. An event you see twice is not a story. */
  readonly seenEvents: readonly EventId[];
  /** The Station's stock, kept from arrival so it cannot reshuffle mid-visit. */
  readonly shop: ShopState | null;
  /**
   * Set when a Thread throws a fight at you. The reward screen reads it instead
   * of the node's type, so a reprisal pays what a reprisal is worth. Cleared
   * the moment it is spent.
   */
  readonly forcedTier: 'combat' | 'elite' | 'boss' | null;
  /**
   * A node whose own content is still owed, after an ambush took its turn.
   *
   * A Thread's reprisal used to REPLACE the node it landed on: you routed for a
   * Station, the reprisal arrived, you fought an Elite, and the Station was
   * simply gone. That is a second punishment nobody agreed to — the Thread was
   * supposed to cost you a fight, not a fight and the thing you were walking
   * towards — and it was at its worst exactly when the player had planned
   * carefully, because a careful plan is what makes losing the node hurt.
   *
   * So the reprisal INTERRUPTS instead. The fight happens, its reward is taken,
   * and then the node opens as though you had just arrived. Held as an id
   * rather than a flag because the reward screen sits between the two and the
   * node has to survive it.
   */
  readonly ambushOwes: string | null;
  /** The collapse front. `null` in Act 1, where it would only be noise. */
  readonly wavefront: WavefrontState | null;
  readonly combat: CombatState | null;
  readonly outcome: RunOutcome | null;
  /** Monotonic source of instance uids. See `combat/instances.ts`. */
  readonly uidCounter: number;
  /** Consecutive reward screens with nothing matching the deck's lean. */
  /** Card removals bought so far. The price rises with each one. */
  readonly removalsPurchased: number;
  /**
   * The introduction, not a run.
   *
   * One fight, a fixed deck, no map and no rewards. It is a real run through
   * the real engine — that is the whole point of teaching with it — so it needs
   * exactly one flag to say where it ends: winning finishes it instead of
   * opening a reward screen onto a chart that does not exist.
   */
  readonly tutorial: boolean;
}

/* ---------- rng ---------- */

/** Named independent streams. Adding a combat roll never moves the map stream. */
export type StreamName = 'map' | 'combat' | 'rewards' | 'events' | 'shop';

export type RngState = { readonly [K in StreamName]: number };

/* ---------- the root ---------- */

export type Phase = 'title' | 'run' | 'over';

/** Pre-run draft. What the title screen is editing before `beginRun`. */
export interface TitleState {
  readonly seed: string;
  readonly depth: number;
}

export interface GameState {
  /** Bumped when the shape changes, so a pasted state dump identifies itself. */
  readonly schema: number;
  readonly phase: Phase;
  readonly title: TitleState;
  readonly run: RunState | null;
  readonly log: readonly LogEntry[];
}
