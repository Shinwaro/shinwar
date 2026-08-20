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
  | { readonly kind: 'hullBelowPct'; readonly value: number };

export type ScaleSource = 'currentHeat' | 'focus' | 'blockGainedThisTurn' | 'cardsPlayedThisTurn';

export type EffectOp =
  | { readonly op: 'damage'; readonly amount: number; readonly target: Target; readonly times?: number }
  | { readonly op: 'block'; readonly amount: number }
  | { readonly op: 'applyStatus'; readonly status: StatusId; readonly stacks: number; readonly target: Target }
  | { readonly op: 'gainHeat'; readonly amount: number }
  | { readonly op: 'ventHeat'; readonly amount: number }
  | { readonly op: 'gainFocus'; readonly amount: number }
  | { readonly op: 'setStance'; readonly stance: StanceId }
  | { readonly op: 'cycleStance'; readonly direction: 1 | -1 }
  | { readonly op: 'draw'; readonly amount: number }
  | { readonly op: 'discard'; readonly amount: number; readonly random?: boolean }
  | { readonly op: 'gainEnergy'; readonly amount: number }
  | { readonly op: 'exhaustSelf' }
  | { readonly op: 'addCardToHand'; readonly cardId: CardId; readonly upgraded?: boolean }
  | { readonly op: 'heal'; readonly amount: number }
  | { readonly op: 'conditional'; readonly when: Condition; readonly then: readonly EffectOp[]; readonly else?: readonly EffectOp[] }
  | { readonly op: 'scaleWith'; readonly source: ScaleSource; readonly per: number; readonly then: readonly EffectOp[] };

/* ---------- content definitions ----------
   Not state. Optionals are fine here. */

export type CardType = 'attack' | 'skill' | 'power' | 'status' | 'curse';

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
export type Rarity = 'basic' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'artifact';

/** Offerable tiers, weakest first. The order drives sorting and display. */
export const RARITY_ORDER: readonly Rarity[] = [
  'basic',
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
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
  readonly upgrade: Partial<Pick<CardDef, 'cost' | 'effects' | 'stanceRider' | 'name'>>;
  readonly exhaust?: boolean;
  readonly innate?: boolean;
  /**
   * Handed out by one specific event or thread and never rolled. Keeps a card
   * that is the whole point of a choice from also turning up in a shop.
   */
  readonly exclusive?: boolean;
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
  /** Stellar Corona: every Heat gain is this much larger. */
  readonly heatGainBonus?: number;
  /** Stellar Corona: every vent is multiplied by this. */
  readonly ventMultiplier?: number;
  /** Deep Void: Heat falls on its own at the end of each turn. */
  readonly heatDecayPerTurn?: number;
  /** Deep Void: fewer cards on turn 1 only. */
  readonly firstTurnDrawPenalty?: number;
  /** Gravity Well: attacks at or above this threshold are multiplied. */
  readonly bigHitThreshold?: number;
  readonly bigHitMultiplier?: number;
  /** Gravity Well: how many stance changes a turn allows. */
  readonly stanceChangesPerTurn?: number;
  /** Sensor Fog: intents are hidden, full stop. */
  readonly hideIntents?: boolean;
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
  /** Flat damage added per stack, on attacks the holder makes. Strength-likes. */
  readonly damageDealtFlat?: number;
  /** Multiplier on damage the holder deals. Weak is 0.75. */
  readonly damageDealtMult?: number;
  /** Multiplier on damage the holder takes. Vulnerable is 1.5. */
  readonly damageTakenMult?: number;
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
  | { readonly op: 'setThread'; readonly threadId: ThreadId }
  | { readonly op: 'resolveThread'; readonly threadId: ThreadId }
  /** A fight that arrives instead of whatever the node was going to be. */
  | { readonly op: 'ambush'; readonly tier: 'combat' | 'elite' };

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
  readonly energyPerTurn?: number;
  readonly drawPerTurn?: number;
  readonly blockPerTurn?: number;
  readonly focusPerTurn?: number;
  readonly ventPerTurn?: number;
  /** Added to every attack you make. */
  readonly damageFlat?: number;
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
  /** Cursor into a `sequence` script. */
  readonly moveIndex: number;
  readonly lastMoveId: string | null;
  /** Consecutive plays of `lastMoveId`, so a `weighted` script can cap repeats. */
  readonly repeats: number;
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
export interface PendingEvent {
  readonly eventId: EventId;
  readonly chosenOptionId: string | null;
  /** What happened, in order, once an option is taken. */
  readonly outcome: readonly string[];
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
  readonly removalUsed: boolean;
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
  readonly forgeUsed: boolean;
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
  /** The collapse front. `null` in Act 1, where it would only be noise. */
  readonly wavefront: WavefrontState | null;
  readonly combat: CombatState | null;
  readonly outcome: RunOutcome | null;
  /** Monotonic source of instance uids. See `combat/instances.ts`. */
  readonly uidCounter: number;
  /** Consecutive reward screens with nothing matching the deck's lean. */
  readonly rewardDrought: number;
  /** Card removals bought so far. The price rises with each one. */
  readonly removalsPurchased: number;
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
