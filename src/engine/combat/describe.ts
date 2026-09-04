/* Rules text, generated from the effect ops.
 *
 * Hand-written rules text drifts from behaviour the instant a number is tuned,
 * and drifted text is the most common cause of a game feeling unfair. So the
 * text is derived, always. Flavor is separate and hand-written — that is the
 * only string on a card an author writes by hand.
 *
 * Pass `state` and the numbers become the live ones: `scaleWith` resolves
 * against current Heat, and a conditional says what it is doing right now.
 */

import { KEYWORDS } from '../../content/keywords.ts';
import type { CardDef, EffectOp, GameState, StanceId, Target } from '../types.ts';
import { STANCES } from '../../content/balance.ts';
import { cards as cardTable, statuses as statusTable } from '../../content/registry.ts';
import { liveStance } from './rules.ts';
import { activeCombat } from '../state.ts';

function statusName(id: string): string {
  return statusTable.find(id)?.name ?? id;
}

function stanceName(id: StanceId): string {
  return STANCES[id].name;
}

function targetSuffix(target: Target): string {
  switch (target) {
    case 'allEnemies':
      return ' to all enemies';
    case 'randomEnemy':
      return ' to a random enemy';
    /* The player has no allies, so their own side is only ever themselves — and
       "gain 2 Block to yourself" is worse English than "gain 2 Block". Enemy
       moves never reach here; their telegraphs are hand-written labels. */
    case 'allAllies':
      return '';
    default:
      return '';
  }
}

/**
 * The health a percentage actually means, right now.
 *
 * "Health is below 25%" is a rule; "below 25% (17 health)" is a decision you
 * can make at a glance, and max health moves during a run so the number cannot
 * be written into the card. Absent when there is no run to read — the reference
 * pages and the tests describe cards with no pilot behind them.
 */
function atPct(state: GameState | null, pct: number): string {
  const max = state?.run?.pilot.maxHealth ?? 0;
  if (max <= 0) return '';
  return ` (${Math.floor((max * pct) / 100)} health)`;
}

function describeCondition(
  when: Extract<EffectOp, { op: 'conditional' }>['when'],
  state: GameState | null,
): string {
  switch (when.kind) {
    case 'stanceIs':
      return `in ${stanceName(when.stance)}`;
    case 'heatAtLeast':
      return `Heat is ${when.value} or more`;
    case 'heatAtMost':
      return `Heat is ${when.value} or less`;
    case 'targetHasStatus':
      return `the target has ${statusName(when.status)}`;
    case 'handSizeAtLeast':
      return `your hand has ${when.value} or more cards`;
    case 'cardsPlayedThisTurnAtLeast':
      return `you have played ${when.value} cards this turn`;
    case 'targetHullBelowPct':
      return `the target is below ${when.value}% health`;
    case 'targetHullAbovePct':
      return `the target is above ${when.value}% health`;
    case 'hullBelowPct':
      // "your health", to match the bar and the heal op — and YOURS, because
      // a card that reads "If health is below 25%" beside an enemy with a
      // health bar of its own is a genuine question the player should not have
      // to ask. The condition is still named hullBelowPct in the data because
      // renaming a shipped condition kind would churn every card that uses it
      // for a word.
      return `your health is below ${when.value}%${atPct(state, when.value)}`;
    case 'hullAbovePct':
      return `your health is above ${when.value}%${atPct(state, when.value)}`;
    case 'killedThisPlay':
      return 'this kills an enemy';
    default: {
      const unreachable: never = when;
      return unreachable;
    }
  }
}

/**
 * The noun after "For every", in the right number.
 *
 * `per` decides it, because "For every 2 card discarded" is what you get
 * otherwise — and the countable sources are the only ones that inflect. Heat
 * and Focus are already mass nouns and read correctly either way.
 */
function describeScaleSource(
  source: Extract<EffectOp, { op: 'scaleWith' }>['source'],
  per: number,
): string {
  const many = per !== 1;
  switch (source) {
    case 'currentHeat':
      return 'Heat';
    case 'focus':
      return 'Focus';
    case 'blockGainedThisTurn':
      return 'Block gained this turn';
    case 'cardsPlayedThisTurn':
      return many ? 'cards played this turn' : 'card played this turn';
    case 'discardedThisPlay':
      return many ? 'cards discarded' : 'card discarded';
    case 'targetHullMissingPct':
      /* Reads as "For every 10% of health the target is missing, ...". The `%`
         has to live in the noun rather than in the count, because `per` is
         printed bare and "For every 10 percent of health" is not how anybody
         says it. */
      return '% of health the target is missing';
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

/**
 * A damage op, split where the UI needs to put a styled number in.
 *
 * ONE implementation, because there are two describers and they had already
 * drifted. `describeCard` builds a string; `describeCardSegments` builds the
 * same sentence with the figure broken out so the hand can colour it. The
 * segment version carried its own copy of this prose, and the day `plusPer`
 * arrived the copy did not learn about it — so Widening Gyre read "Deal 4
 * damage" in hand while dealing four plus two a step, and the only hint was a
 * Focus chip that belonged to something else entirely.
 *
 * The comment above `describeCardSegments` had already predicted this in as
 * many words. Splitting the sentence rather than duplicating it is the fix that
 * makes the prediction unnecessary.
 */
function damageParts(
  op: Extract<EffectOp, { readonly op: 'damage' }>,
  state: GameState | null,
): { readonly lead: string; readonly amount: number; readonly tail: string } {
  const times = op.times ?? 1;
  const hits = times > 1 ? ` ${times} times` : '';
  const plus = op.plusPer;
  if (plus === undefined) {
    return { lead: 'Deal ', amount: op.amount, tail: ` damage${hits}${targetSuffix(op.target)}.` };
  }

  const source = describeScaleSource(plus.source, plus.per);
  /* No space before a source that opens with a symbol — "per 10% of health"
     rather than "per 10 % of health". Same rule `scaleWith` uses. */
  const per = plus.per === 1 ? '' : `${plus.per}${source.startsWith('%') ? '' : ' '}`;
  const combat =
    state === null || plus.source === 'discardedThisPlay' ? null : activeCombat(state);
  const live =
    combat === null
      ? ''
      : ` (${Math.floor(currentScale(combat, plus.source) / Math.max(1, plus.per))}x now)`;

  /* A card with no flat damage of its own says so in one clause instead of
     opening with "Deal 0 damage, plus ...". The figure the UI styles is then
     the per-step amount, because that is the number on the card. */
  if (op.amount === 0) {
    return {
      lead: 'Deal ',
      amount: plus.amount,
      tail: ` damage per ${per}${source}${hits}${targetSuffix(op.target)}.${live}`,
    };
  }
  /* The comma before "N times" matters: "plus 2 per Focus 3 times" reads as
     three Focus, which is a different card. */
  return {
    lead: 'Deal ',
    amount: op.amount,
    tail: ` damage, plus ${plus.amount} per ${per}${source}${hits === '' ? '' : ','}${hits}${targetSuffix(op.target)}.${live}`,
  };
}

function describeOp(op: EffectOp, state: GameState | null, afterDamage = false): string {
  switch (op.op) {
    case 'damage': {
      /*
       * The printed number is the card's own number, always.
       *
       * Focus used to be folded in here, so a 6-damage card read "Deal 14" at
       * four Focus. That was defensible -- the number on the card was the number
       * that landed -- but it made the card itself unstable: the same card in
       * the same hand read differently from one turn to the next, and Strength
       * (which is never folded in) made it inconsistent on top of that. A static
       * face and a modifier applied at the moment of the hit is easier to learn
       * and easier to trust, because what changes is visibly the situation
       * rather than the card.
       *
       * The projected damage on the enemy still shows the true total, so nothing
       * is hidden -- it has just moved to the place that is about to be hit.
       *
       * The sentence itself comes from `damageParts`, which the segment
       * describer also uses. See the note there for why it is shared.
       */
      const parts = damageParts(op, state);
      return `${parts.lead}${parts.amount}${parts.tail}`;
    }

    case 'block':
      return `Gain ${op.amount} Block.`;
    case 'applyStatus':
      /* "Gain 2 Tempered", not "Apply 2 Tempered".
       *
       * A bare "Apply N X" means the chosen enemy — that is the convention the
       * whole pool reads by, since `targetSuffix` only speaks up for the plural
       * targets. So a self-buff rendered bare said the opposite of what it did,
       * and it only became visible once buffs other than Strength existed.
       * "Gain" is also the verb the card already uses for Block and Focus.
       *
       * "TAKE 2 Weak" for a debuff you put on yourself, though. `Gain` was
       * built for buffs and reads as upside, which is exactly backwards once
       * cards start pricing themselves in Vulnerable and Weak — "Gain 2
       * Vulnerable" is a sentence that tells the player they are being given
       * something. The status table already knows which kind each one is, so
       * the verb can come from the status rather than from the target alone.
       * Cost and benefit are the two things a card must never confuse. */
      if (op.target === 'self') {
        const verb = statusTable.find(op.status)?.kind === 'debuff' ? 'Take' : 'Gain';
        return `${verb} ${op.stacks} ${statusName(op.status)}.`;
      }
      return `Apply ${op.stacks} ${statusName(op.status)}${targetSuffix(op.target)}.`;
    case 'gainHeat':
      return `Gain ${op.amount} Heat.`;
    case 'ventHeat':
      return `Vent ${op.amount} Heat.`;
    case 'gainFocus':
      return `Gain ${op.amount} Focus.`;
    case 'setStance':
      return `Enter ${stanceName(op.stance)}.`;
    case 'cycleStance':
      return op.direction === 1 ? 'Change stance.' : 'Change stance backwards.';
    case 'draw':
      return `Draw ${op.amount} card${op.amount === 1 ? '' : 's'}.`;
    case 'discard':
      return op.all === true
        ? 'Discard your hand.'
        : `Discard ${op.amount}${op.random === true ? ' at random' : ''}.`;
    case 'gainEnergy':
      return `Gain ${op.amount} Energy.`;
    case 'exhaustSelf':
      return 'Burn.';
    case 'addCardToHand':
      return `Add ${cardTable.find(op.cardId)?.name ?? op.cardId}${op.upgraded === true ? '+' : ''} to your hand.`;
    case 'heal':
      /* "Health", never "hull". The bar on the combat screen says HEALTH and
         the Station calls it a repair, and a card that used a third word for
         the same number made the player check whether it was a third thing. */
      return op.amount < 0 ? `Lose ${-op.amount} health.` : `Regain ${op.amount} health.`;
    case 'conditional': {
      const then = joinClause(describeOps(op.then, state));
      const otherwise =
        op.else === undefined
          ? ''
          : ` Otherwise ${lowerFirst(joinClause(describeOps(op.else, state)))}`;

      /*
       * "deal 13 additional damage", not "deal 13 damage".
       *
       * A conditional with no `else` stacks on top of whatever the card already
       * did — but read cold, "Deal 8 damage to all enemies. If Heat is 8 or
       * more, deal 13 damage to all enemies" looks like the 13 *replaces* the 8.
       * A conditional WITH an else really is a choice between two outcomes, so
       * it keeps the plain wording. The distinction is exactly whether there is
       * an alternative branch.
       */
      const stacking = op.else === undefined && afterDamage;
      const body = stacking
        ? lowerFirst(then).replace(/^deal (\d+) damage/, 'deal $1 additional damage')
        : lowerFirst(then);

      return `If ${describeCondition(op.when, state)}, ${body}${otherwise}`;
    }
    case 'scaleWith': {
      /* No space before a source that opens with a symbol. "For every 10% of
         health" rather than "For every 10 % of health". */
      const tight = describeScaleSource(op.source, op.per).startsWith('%');
      const per = op.per === 1 ? '' : `${op.per}${tight ? '' : ' '}`;
      const body = lowerFirst(describeOps(op.then, state));
      /* No live count for a per-play source. It is zero until the card is
         played and the whole of it happens inside that play, so "(0x now)" on
         the face would be true, useless and read as a promise of nothing. */
      const combat = state === null || op.source === 'discardedThisPlay' ? null : activeCombat(state);
      const live =
        combat === null ? '' : ` (${Math.floor(currentScale(combat, op.source) / Math.max(1, op.per))}x now)`;
      /*
       * "hit for 4", not "deal 4 extra damage" — and this is the whole reason
       * the wording was rewritten rather than the numbers retuned.
       *
       * `scaleWith` produces SEPARATE HITS: one instance of its body per step.
       * That is what the op is for and these cards want it. But it used to
       * describe itself as "deal 4 extra", which reads as one bigger swing —
       * so the cards that hit nine times told the player they hit once, and the
       * two things a player needs that number for are exactly the two things
       * that count hits. Strength is flat per hit. An every-hit relic is flat
       * per hit. A card claiming to be one swing while landing nine made both
       * of them silently worth nine times their printed value.
       *
       * So the damage case gets its own clause with the word HIT in it, and the
       * card's mark and sound already agree: `cardVoice` reads a scaleWith over
       * damage as multi-hit, and `plusPer` — which really is one bigger swing —
       * deliberately does not. Three places now say the same thing about the
       * same card, in three different channels.
       */
      const single = op.then.length === 1 ? op.then[0] : undefined;
      if (single !== undefined && single.op === 'damage') {
        const repeats = (single.times ?? 1) > 1 ? ` ${single.times} times` : '';
        const who = single.target === 'allEnemies' ? ' all enemies' : '';
        /* "for 4 damage", not "for 4". Every other number on a card face names
           its unit — Block, Heat, Focus — and a bare figure in the one sentence
           that is about repeated hits reads as a count of hits rather than as
           the size of each. */
        return `For every ${per}${describeScaleSource(op.source, op.per)}, hit${who} for ${single.amount} damage${repeats}.${live}`;
      }

      /*
       * Everything that is not damage keeps "extra", which is still right for
       * it: Jettison scales draw and Ablative Layer scales Block, and neither
       * has a per-instance bonus for the count to multiply. Repeating a Block
       * op is arithmetic; repeating a damage op is a fight.
       */
      const additive = afterDamage ? body.replace(/^deal (\d+) damage/, 'deal $1 extra') : body;
      return `For every ${per}${describeScaleSource(op.source, op.per)}, ${additive}${live}`;
    }
    case 'gainAlloy':
      /* The full stop matters. Every branch here returns a finished sentence
         and `describeOps` joins them with a bare space, so the one that did
         not ran straight into whatever came after it: Bounty Cut read "gain 40
         Alloy Burn." `joinClause` strips and re-adds terminators, so nothing
         downstream doubles it up. */
      return `${op.amount > 0 ? 'Gain' : 'Lose'} ${Math.abs(op.amount)} Alloy.`;

    default: {
      const unreachable: never = op;
      return unreachable;
    }
  }
}

function currentScale(
  combat: NonNullable<ReturnType<typeof activeCombat>>,
  source: Extract<EffectOp, { op: 'scaleWith' }>['source'],
): number {
  switch (source) {
    case 'currentHeat':
      return combat.heat;
    case 'focus':
      return combat.focus;
    case 'blockGainedThisTurn':
      return combat.blockGainedThisTurn;
    case 'cardsPlayedThisTurn':
      return combat.cardsPlayedThisTurn;
    default:
      return 0;
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Fold several sentences into one clause.
 *
 * A conditional's branch is a single promise however many ops are in it, and
 * `describeOps` returns them full-stopped: "If this kills an enemy, gain 3
 * Energy. Draw 2 cards." reads as though the draw happens either way. The card
 * was lying about itself, and only a branch with two ops in it could show that
 * — every conditional in the pool until now had exactly one.
 */
function joinClause(text: string): string {
  const sentences = text
    .split('. ')
    .map((part) => part.trim().replace(/\.$/, ''))
    .filter((part) => part !== '');
  if (sentences.length <= 1) return text;
  const last = sentences[sentences.length - 1] as string;
  return `${sentences.slice(0, -1).join(', ')} and ${lowerFirst(last)}.`;
}

export function describeOps(ops: readonly EffectOp[], state: GameState | null = null): string {
  /*
   * A scaling term reads as "extra" only when something came before it to be
   * extra TO. Momentum is pure scaling with no base hit — "for every card
   * played, deal 3 extra" invites the reader to ask "extra to what?" and there
   * is no answer. After a base hit, "extra" is the word that stops the second
   * sentence looking like it replaces the first.
   */
  let afterDamage = false;
  const parts = ops.map((op) => {
    const text = describeOp(op, state, afterDamage);
    if (op.op === 'damage') afterDamage = true;
    return text;
  });
  return parts.join(' ');
}

/* ---------- live damage figures ----------

   The printed number used to be the card's own number, always — and there is a
   comment in the damage case above explaining why folding Focus in was tried
   and rejected. That reasoning still stands for Focus and is why Focus is shown
   as a SEPARATE `+N` here rather than absorbed: the card's own number stays put
   and the modifier is visibly the situation.

   The stance's hot bonus is different. It is not a stacking resource you spend;
   it is a flat rule that is either on or off, and while it is on it applies to
   every attack you make. Folding that one in and colouring it says "this is
   not the card's number right now" in a way a reader cannot miss.

   Both figures are read off `liveStance`, which is the same source the damage
   pipeline reads. Computing them a second way here is exactly how a card starts
   lying about what it will do. */

export interface DamageFigures {
  /** What to print: the card's number plus the stance bonus, if it is live. */
  readonly shown: number;
  /** The stance's hot bonus, 0 when it is not applying. Non-zero prints red. */
  readonly hot: number;
  /** What one stack of Focus would add. 0 when Focus is dark for this card. */
  readonly focus: number;
}

export function damageFigures(
  amount: number,
  def: CardDef,
  state: GameState | null,
): DamageFigures {
  const combat = state === null ? null : activeCombat(state);
  if (state === null || combat === null) return { shown: amount, hot: 0, focus: 0 };

  const stance = liveStance(state);

  // Mirrors step 3 of the pipeline: flat, while the gauge is over the line.
  const hot =
    stance.hotDamageAtHeat !== undefined && combat.heat >= stance.hotDamageAtHeat
      ? (stance.hotDamage ?? 0)
      : 0;

  /* Mirrors the Focus step: one stack, only in a stance that spends Focus on
     damage, only while there is a stack to spend, and never on a card that
     declares it keeps its Focus. */
  const focus =
    stance.focusMode === 'damage' && combat.focus > 0 && def.keepsFocus !== true
      ? stance.focusPerStack
      : 0;

  return { shown: amount + hot, hot, focus };
}

/**
 * The same, for Block.
 *
 * GUARD spends Focus on Block exactly as IAI spends it on damage, and the card
 * face was only saying so on one of the two. A player in GUARD holding Focus
 * had no way to know their 6-Block card was about to be an 8 except by playing
 * it, which is the sort of thing that makes a stance feel like it does nothing.
 *
 * There is no hot bonus on this side — no stance adds flat Block over a Heat
 * line — so `shown` is always the card's own number and only the Focus term
 * moves.
 */
export function blockFigures(
  amount: number,
  def: CardDef,
  state: GameState | null,
): DamageFigures {
  const combat = state === null ? null : activeCombat(state);
  if (state === null || combat === null) return { shown: amount, hot: 0, focus: 0 };

  const stance = liveStance(state);
  const focus =
    stance.focusMode === 'block' && combat.focus > 0 && def.keepsFocus !== true
      ? stance.focusPerStack
      : 0;

  return { shown: amount, hot: 0, focus };
}

export type CardSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'damage'; readonly figures: DamageFigures }
  | { readonly kind: 'block'; readonly figures: DamageFigures };

/**
 * Whether the Focus bonus has been spoken for yet.
 *
 * ONE stack is spent per card play — see `context.focusSpent` in `effects.ts`,
 * which both the damage and the Block side check. So exactly one figure on a
 * card may wear the `+2`, and which one is settled by resolution order: the
 * base effects run first and the rider runs after with the same context, so the
 * base claims it and the rider gets nothing.
 *
 * A mutable token rather than a return value because the claim has to survive
 * from the card's own text into its rider, which the UI renders as a separate
 * paragraph. IAI Slash is the case that made this necessary: base "Deal 6" and
 * an IAI rider "Deal 2" both printed "+2", promising four points of Focus on a
 * card that spends one stack.
 */
interface FocusClaim {
  claimed: boolean;
}

/**
 * Hand the bonus to this figure, if nothing has taken it yet.
 *
 * A figure with no bonus to show never claims — that matters for the
 * cross-stance cards, where GUARD's Focus has to reach past a damage op it does
 * not apply to and land on the Block in the rider (Sweeping Guard), or IAI's
 * has to reach past a Block (Riposte Plate).
 */
function claimFocus(figures: DamageFigures, claim: FocusClaim): DamageFigures {
  if (figures.focus <= 0) return figures;
  if (claim.claimed) return { ...figures, focus: 0 };
  claim.claimed = true;
  return figures;
}

/**
 * One op list, split where the UI puts a styled number in.
 *
 * Only the top-level `damage` and `block` ops are broken out; everything else
 * is handed straight to the string generator above. That keeps prose in one
 * place — a second walk of the op tree here would drift from `describeCard`
 * the first time either changed. What the nested ones get instead is
 * `focusNote`.
 *
 * Shared by the card's own effects and by its stance rider, which used to be
 * rendered as a flat string — so a GUARD rider granting Block showed no Focus
 * bonus at all, on exactly the cards whose Block only lives in the rider.
 */
function segmentsOfOps(
  ops: readonly EffectOp[],
  def: CardDef,
  state: GameState | null,
  claim: FocusClaim,
): CardSegment[] {
  const out: CardSegment[] = [];
  let afterDamage = false;

  for (const op of ops) {
    if (op.op === 'damage') {
      /* Same sentence as `describeOp`, cut where the styled figure goes — see
         `damageParts`. Splitting one implementation rather than keeping two is
         what stopped Widening Gyre from printing "Deal 4 damage" in hand while
         scaling two a step. */
      const parts = damageParts(op, state);
      out.push({ kind: 'text', text: parts.lead });
      out.push({ kind: 'damage', figures: claimFocus(damageFigures(parts.amount, def, state), claim) });
      out.push({ kind: 'text', text: `${parts.tail} ` });
      afterDamage = true;
      continue;
    }

    if (op.op === 'block') {
      out.push({ kind: 'text', text: 'Gain ' });
      out.push({ kind: 'block', figures: claimFocus(blockFigures(op.amount, def, state), claim) });
      out.push({ kind: 'text', text: ' Block. ' });
      continue;
    }
    out.push({ kind: 'text', text: `${describeOp(op, state, afterDamage)} ` });
  }

  return out;
}

export interface CardParts {
  /** The card's own text. */
  readonly text: readonly CardSegment[];
  /** The stance rider's text, or `null` when it has no rider. */
  readonly rider: readonly CardSegment[] | null;
  /** The Focus bonus in words, when no figure above could carry it. */
  readonly note: string | null;
}

/**
 * Everything printed on one card, built together.
 *
 * Together rather than by three separate calls, because the Focus bonus is a
 * fact about the CARD and the three pieces have to agree on who wears it. Built
 * in resolution order — own effects, then rider, then whatever is left over
 * for the note — so the piece that claims the `+2` is the piece the engine
 * actually spends it on.
 */
export function describeCardParts(def: CardDef, state: GameState | null = null): CardParts {
  /* A Voided card has no ops, so walking them produces an empty paragraph —
     and a card in your hand with nothing written on it reads as a rendering
     fault rather than as the curse it is. `describeCard` already says the right
     words and has no figure to style, so this hands the whole sentence over
     rather than repeating it. Found by the test that asserts these two agree,
     which is the second thing that test caught. */
  if (def.type === 'voided') {
    return { text: [{ kind: 'text', text: describeCard(def, state) }], rider: null, note: null };
  }

  const claim: FocusClaim = { claimed: false };
  const text = segmentsOfOps(def.effects, def, state, claim);

  const tail: string[] = [];
  if (def.exhaust === true && !def.effects.some((op) => op.op === 'exhaustSelf')) tail.push('Burn.');
  if (def.innate === true) tail.push('Innate.');
  if (def.keepsFocus === true) tail.push('Does not consume Focus.');
  if (tail.length > 0) text.push({ kind: 'text', text: tail.join(' ') });

  /* The rider second, because it resolves second. Built even when the player is
     out of its stance: the paragraph is still on the card, greyed, and a number
     that appears only once you are already in the stance is no use for deciding
     whether to enter it. */
  const rider =
    def.stanceRider === undefined
      ? null
      : segmentsOfOps(def.stanceRider.effects, def, state, claim);

  return { text, rider, note: claim.claimed ? null : focusNoteFor(def, state) };
}

/**
 * The stance rider, as segments, so its figures carry the same live bonuses the
 * card's own text does. `null` when the card has no rider.
 *
 * The `STANCE:` label is still the UI's, so it can highlight when live.
 */
export function describeRiderSegments(
  def: CardDef,
  state: GameState | null = null,
): readonly CardSegment[] | null {
  return describeCardParts(def, state).rider;
}

export function describeCardSegments(
  def: CardDef,
  state: GameState | null = null,
): readonly CardSegment[] {
  return describeCardParts(def, state).text;
}

/** Does an op of this kind appear anywhere in the tree, however deeply nested? */
function hasOpKind(ops: readonly EffectOp[], kind: 'damage' | 'block'): boolean {
  for (const op of ops) {
    if (op.op === kind) return true;
    if (op.op === 'conditional') {
      if (hasOpKind(op.then, kind)) return true;
      if (op.else !== undefined && hasOpKind(op.else, kind)) return true;
    }
    if (op.op === 'scaleWith' && hasOpKind(op.then, kind)) return true;
  }
  return false;
}

/**
 * The Focus bonus this card will get, said in words, for the cards where no
 * printed figure can carry it.
 *
 * The `+2` chip hangs off a damage or Block *segment*, and only a TOP-LEVEL
 * `damage` or `block` op becomes one — anything nested inside a `conditional`
 * or a `scaleWith` is handed to the string generator whole, with no figure to
 * hang anything on. So fifteen cards spent the whole game never mentioning
 * their Focus bonus: Momentum, Execute and Criticality deal all their damage
 * from inside a `scaleWith`, and Unhurried, The Last Plate and Shed Weight
 * gain all their Block from inside a `conditional`. Reliably the long cards,
 * which is the worst place to lose a number — they are the ones a player is
 * already working to read.
 *
 * Recursing the whole tree into segments is the other fix, and it is the wrong
 * one: `conditional` and `scaleWith` build their prose by rewriting the
 * flattened body ("deal 8 damage" → "deal 8 additional damage"), so segments
 * there would need a second copy of that wording — which is the exact drift
 * this file keeps warning about. A sentence costs nothing and cannot drift,
 * because the numbers in it come from the same `damageFigures`/`blockFigures`
 * the chip does.
 *
 * Only ever reached when the claim went unspent — see `describeCardParts` —
 * so no card can say it twice. This used to decide that for itself by looking
 * for a top-level op of the right kind, which was the same question asked a
 * second way and would have drifted the moment either answer changed.
 */
export function focusNote(def: CardDef, state: GameState | null): string | null {
  return describeCardParts(def, state).note;
}

function focusNoteFor(def: CardDef, state: GameState | null): string | null {
  if (state === null) return null;
  const combat = activeCombat(state);
  if (combat === null) return null;

  const stance = liveStance(state);
  const kind = stance.focusMode === 'damage' ? 'damage' : 'block';

  /* The same three conditions `damageFigures` and `blockFigures` check. Asking
     them directly would be better still, but they answer about one op and the
     question here is about the card. */
  const figures =
    kind === 'damage'
      ? damageFigures(0, def, state)
      : blockFigures(0, def, state);
  if (figures.focus <= 0) return null;

  const rider = def.stanceRider?.effects ?? [];
  // Nothing of this kind on the card at all, so the bonus has nothing to land
  // on and saying otherwise would promise damage the card never deals.
  if (!hasOpKind(def.effects, kind) && !hasOpKind(rider, kind)) return null;

  return `Focus: +${figures.focus} ${kind === 'damage' ? 'damage' : 'Block'}`;
}

/** The card's base rules text. The rider is described separately so the UI can grey it. */
export function describeCard(def: CardDef, state: GameState | null = null): string {
  /* Voided cards have no ops, so the generated text would be empty — and an
     empty card reads as a bug rather than as a curse. The words come from the
     type, which keeps the rule that no card text is hand-written: change what
     `voided` means and every one of them says the new thing. */
  if (def.type === 'voided') {
    const stuck = def.innate === true ? ' It is in your opening hand every fight.' : '';
    return `Unplayable.${stuck} Remove it at a Safe Planet or a Station.`;
  }

  const parts = [describeOps(def.effects, state)];
  if (def.exhaust === true && !def.effects.some((op) => op.op === 'exhaustSelf')) parts.push('Burn.');
  if (def.innate === true) parts.push('Innate.');
  if (def.keepsFocus === true) parts.push('Does not consume Focus.');
  return parts.filter((part) => part.trim() !== '').join(' ');
}

/**
 * The stance rider, without its `STANCE:` prefix — the UI renders that as a
 * label so it can highlight when live and grey when not. A player who cannot
 * see at a glance which half of a card is active cannot plan, which makes this
 * the single most important readability requirement in the game.
 */
export function describeRider(def: CardDef, state: GameState | null = null): string | null {
  if (def.stanceRider === undefined) return null;
  return describeOps(def.stanceRider.effects, state);
}

export function riderIsLive(def: CardDef, state: GameState | null): boolean {
  if (def.stanceRider === undefined || state === null) return false;
  return activeCombat(state)?.stance === def.stanceRider.stance;
}

/** Cost, with `X` spelled out rather than shown as a letter nobody has met yet. */
export function describeCost(def: CardDef): string {
  return def.cost === 'X' ? 'X' : String(def.cost);
}

/* ---------- the glossary ----------
   Which terms a card actually uses, so the fine print under it explains this
   card rather than reciting the rulebook. */

export interface GlossaryLine {
  readonly name: string;
  readonly text: string;
}

/**
 * Every keyword that appears in this card's generated text, with what it means.
 *
 * Driven off the generated text rather than off the ops, deliberately: what the
 * player needs explained is what they can *see*. If a word is not printed on the
 * card, explaining it here would be answering a question nobody asked.
 *
 * Status definitions come from the status table rather than being restated, so
 * "Vulnerable takes 50% more damage" exists once. Two copies is how one of them
 * ends up wrong after a tuning pass.
 */
export function glossaryFor(def: CardDef, state?: GameState): readonly GlossaryLine[] {
  const printed = `${describeCard(def, state)} ${describeRider(def) ?? ''}`;
  const lines: GlossaryLine[] = [];
  const seen = new Set<string>();

  for (const keyword of KEYWORDS) {
    if (!printed.includes(keyword.name)) continue;
    if (seen.has(keyword.id)) continue;
    seen.add(keyword.id);
    lines.push({ name: keyword.name, text: keyword.text });
  }

  for (const status of statusTable.all()) {
    if (!printed.includes(status.name)) continue;
    if (seen.has(status.id)) continue;
    seen.add(status.id);
    lines.push({ name: status.name, text: status.text });
  }

  return lines;
}
