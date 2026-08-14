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
export type ModuleId = string;
export type EventId = string;
export type EncounterId = string;
export type EnvironmentId = string;
export type MasteryId = string;
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
export type Rarity = 'basic' | 'common' | 'uncommon' | 'rare';

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
  /** Hand-written. Rules text is NOT — `describeCard()` generates that. */
  readonly flavor?: string;
}

export type SlotId = 'reactor' | 'hull' | 'drive' | 'sensors' | 'weapons' | 'cargo';

export interface ModuleDef {
  readonly id: ModuleId;
  readonly name: string;
  readonly slot: SlotId;
  readonly rarity: Rarity;
  /** Power drawn. A reactor draws 0 and supplies via `power`. */
  readonly draw: number;
  /** Power supplied. Reactors only. */
  readonly supplies?: number;
  readonly text: string;
  readonly flavor?: string;
}

export interface EnvironmentDef {
  readonly id: EnvironmentId;
  readonly name: string;
  /** Shown on the map node badge before the player commits to the route. */
  readonly text: string;
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
}

export interface EventOption {
  readonly id: string;
  readonly label: string;
  /** `true` on the always-available, always-worthless "leave" option. */
  readonly isLeave?: boolean;
}

export interface EventDef {
  readonly id: EventId;
  readonly name: string;
  readonly body: string;
  readonly options: readonly EventOption[];
}

export type ThreadTone = 'positive' | 'mixed' | 'costly';

export interface ThreadDef {
  readonly id: ThreadId;
  readonly name: string;
  /** What the Manifest panel shows. The player must always be able to see this. */
  readonly description: string;
  readonly tone: ThreadTone;
}

export interface MasteryDef {
  readonly id: MasteryId;
  readonly name: string;
  readonly stance: StanceId;
  readonly text: string;
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
  /** Who caused it: a card id, enemy id, module id, `'player'`, `'system'`. */
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
  /** Unique per physical copy, so two Iai Slashes are distinguishable. */
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
  /**
   * Damage instances the player has dealt this turn, not cards played. The IAI
   * passive fires on instance 0 only, so a card whose rider adds a second hit
   * gets the bonus once — 6 base + 4 rider + 4 stance = 14, per DESIGN.md §1.
   */
  readonly attacksThisTurn: number;
  /** Energy lost next turn, from a critical overheat. */
  readonly energyPenaltyNextTurn: number;
  readonly outcome: 'ongoing' | 'won' | 'lost';
}

/* ---------- ship ---------- */

export interface InstalledModule {
  readonly moduleId: ModuleId;
  readonly slot: SlotId;
}

export interface ShipState {
  /** The cutter's own health. Spent in space combat, repaired with Alloy. */
  readonly hull: number;
  readonly maxHull: number;
  /** Power supplied by the reactor plus any capacity bought. */
  readonly powerCapacity: number;
  readonly installed: readonly InstalledModule[];
}

/* ---------- run ---------- */

export interface ThreadState {
  readonly threadId: ThreadId;
  readonly resolved: boolean;
}

/**
 * The ronin themself. Separate from the ship on purpose: Alloy repairs the
 * cutter but not a body, so the two attrition tracks price differently and a
 * surface fight costs something a space fight cannot.
 */
export interface PilotState {
  readonly health: number;
  readonly maxHealth: number;
  readonly deck: readonly CardInstance[];
  readonly masteries: readonly MasteryId[];
}

export type RunOutcome = 'won' | 'died' | 'abandoned';

export interface RunState {
  /** Copyable, re-enterable. Not persistence — a number you can write down. */
  readonly seed: string;
  readonly depth: number;
  readonly rng: RngState;
  readonly act: 1 | 2 | 3;
  readonly alloy: number;
  readonly pilot: PilotState;
  readonly ship: ShipState;
  readonly threads: readonly ThreadState[];
  readonly combat: CombatState | null;
  readonly outcome: RunOutcome | null;
  /** Monotonic source of instance uids. See `combat/instances.ts`. */
  readonly uidCounter: number;
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
