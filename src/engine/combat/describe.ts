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

import type { CardDef, EffectOp, GameState, StanceId, Target } from '../types.ts';
import { STANCES } from '../../content/balance.ts';
import { cards as cardTable, statuses as statusTable } from '../../content/registry.ts';
import { activeCombat } from '../state.ts';
import { stanceRulesFor } from './rules.ts';

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

/**
 * What a stack of Focus is currently worth on the first hit of an attack.
 *
 * Folded into the printed damage rather than shown as a separate `+2`: the
 * number on the card should be the number that lands. A card that says 6 and
 * deals 12 is asking the player to do the arithmetic the game already did.
 */
function focusBonus(state: GameState | null): number {
  if (state === null) return 0;
  const combat = activeCombat(state);
  if (combat === null || combat.focus <= 0) return 0;
  const stance = stanceRulesFor(state, combat.stance);
  return stance.spendsFocus ? combat.focus * stance.focusPerStack : 0;
}

function describeOp(op: EffectOp, state: GameState | null): string {
  switch (op.op) {
    case 'damage': {
      const times = op.times ?? 1;
      const hits = times > 1 ? ` ${times} times` : '';
      // Only the first instance spends the stack, so only the first shows it.
      const withFocus = op.amount + focusBonus(state);
      return `Deal ${withFocus} damage${hits}${targetSuffix(op.target)}.`;
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
      return `For every ${per}${describeScaleSource(op.source)}, ${body}${live}`;
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
  return ops.map((op) => describeOp(op, state)).join(' ');
}

/** The card's base rules text. The rider is described separately so the UI can grey it. */
export function describeCard(def: CardDef, state: GameState | null = null): string {
  const parts = [describeOps(def.effects, state)];
  if (def.exhaust === true && !def.effects.some((op) => op.op === 'exhaustSelf')) parts.push('Exhaust.');
  if (def.innate === true) parts.push('Innate.');
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
