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
    default:
      return '';
  }
}

function describeCondition(when: Extract<EffectOp, { op: 'conditional' }>['when']): string {
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
    case 'hullBelowPct':
      return `hull is below ${when.value}%`;
    default: {
      const unreachable: never = when;
      return unreachable;
    }
  }
}

function describeScaleSource(source: Extract<EffectOp, { op: 'scaleWith' }>['source']): string {
  switch (source) {
    case 'currentHeat':
      return 'Heat';
    case 'focus':
      return 'Focus';
    case 'blockGainedThisTurn':
      return 'Block gained this turn';
    case 'cardsPlayedThisTurn':
      return 'card played this turn';
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

function describeOp(op: EffectOp, state: GameState | null, afterDamage = false): string {
  switch (op.op) {
    case 'damage': {
      const times = op.times ?? 1;
      const hits = times > 1 ? ` ${times} times` : '';
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
       */
      return `Deal ${op.amount} damage${hits}${targetSuffix(op.target)}.`;
    }
    case 'block':
      return `Gain ${op.amount} Block.`;
    case 'applyStatus':
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
      return `Discard ${op.amount}${op.random === true ? ' at random' : ''}.`;
    case 'gainEnergy':
      return `Gain ${op.amount} Energy.`;
    case 'exhaustSelf':
      return 'Exhaust.';
    case 'addCardToHand':
      return `Add ${cardTable.find(op.cardId)?.name ?? op.cardId}${op.upgraded === true ? '+' : ''} to your hand.`;
    case 'heal':
      return `Repair ${op.amount} hull.`;
    case 'conditional': {
      const then = describeOps(op.then, state);
      const otherwise = op.else === undefined ? '' : ` Otherwise ${lowerFirst(describeOps(op.else, state))}`;
      return `If ${describeCondition(op.when)}, ${lowerFirst(then)}${otherwise}`;
    }
    case 'scaleWith': {
      const per = op.per === 1 ? '' : `${op.per} `;
      const body = lowerFirst(describeOps(op.then, state));
      const combat = state === null ? null : activeCombat(state);
      const live =
        combat === null ? '' : ` (${Math.floor(currentScale(combat, op.source) / Math.max(1, op.per))}x now)`;
      /*
       * "deal 3 extra", not "deal 3 damage".
       *
       * A scaling term almost always sits behind a base hit, and reading two
       * "deal N damage" sentences in a row invites the player to think the
       * second one replaces the first. `extra` says it is additional without
       * needing a second sentence to explain that it is.
       */
      const additive = afterDamage ? body.replace(/^deal (\d+) damage/, 'deal $1 extra') : body;
      return `For every ${per}${describeScaleSource(op.source)}, ${additive}${live}`;
    }
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

/** The card's base rules text. The rider is described separately so the UI can grey it. */
export function describeCard(def: CardDef, state: GameState | null = null): string {
  const parts = [describeOps(def.effects, state)];
  if (def.exhaust === true && !def.effects.some((op) => op.op === 'exhaustSelf')) parts.push('Exhaust.');
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
