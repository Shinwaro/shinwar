/* An enemy: HP, statuses, and what it is about to do.
 *
 * The intent shows exact numbers, multi-hit as `3 x 5`, and buffs by name.
 * When a card is selected, the predicted damage appears inline on every enemy
 * — that is the whole reason the two-step selection model exists, and it works
 * identically on desktop and touch.
 */

import type { EnemyState, GameState } from '../../engine/types.ts';
import { describeIntent, intentOf } from '../../engine/combat/intents.ts';
import { describeStatus } from '../../engine/combat/keywords.ts';
import { enemies as enemyTable, statuses as statusTable } from '../../content/registry.ts';
import { el } from '../dom.ts';

export interface EnemyViewOptions {
  readonly targetable: boolean;
  readonly focused: boolean;
  /** Predicted HP loss from the selected card, or null when nothing is selected. */
  readonly predicted: number | null;
  readonly willDie: boolean;
  readonly onPick: () => void;
}

export function renderEnemy(
  state: GameState,
  enemy: EnemyState,
  options: EnemyViewOptions,
): HTMLElement {
  const def = enemyTable.get(enemy.defId);
  const dead = enemy.hp <= 0;
  const hits = intentOf(state, enemy);
  const attacking = hits.some((hit) => hit.kind === 'attack');

  const classes = ['enemy'];
  if (dead) classes.push('is-dead');
  if (options.targetable) classes.push('is-targetable');
  if (options.focused) classes.push('is-focused');

  const statusRow = enemy.statuses.map((held) =>
    el(
      'span',
      {
        class: `pip pip--${statusTable.find(held.status)?.kind ?? 'debuff'}`,
        title: statusTable.find(held.status)?.text ?? held.status,
      },
      [describeStatus(held.status, held.stacks)],
    ),
  );

  const intentNode = dead
    ? null
    : el('div', { class: `intent ${attacking ? 'intent--attack' : 'intent--other'}` }, [
        el('span', { class: 'intent-icon', 'aria-hidden': 'true' }, [attacking ? '⚔' : '◆']),
        el('span', { class: 'intent-text' }, [describeIntent(hits)]),
      ]);

  const predictionNode =
    options.predicted !== null && options.predicted > 0
      ? el('div', { class: `prediction ${options.willDie ? 'is-lethal' : ''}` }, [
          `-${options.predicted}`,
          options.willDie ? el('span', { class: 'prediction-kill' }, ['LETHAL']) : null,
        ])
      : null;

  const hpPct = enemy.maxHp === 0 ? 0 : Math.max(0, (enemy.hp / enemy.maxHp) * 100);

  const node = el(
    'button',
    {
      type: 'button',
      class: classes.join(' '),
      'data-uid': enemy.uid,
      disabled: dead || !options.targetable,
      'aria-label': `${def.name}, ${enemy.hp} of ${enemy.maxHp} hull`,
    },
    [
      el('div', { class: 'enemy-head' }, [
        el('span', { class: 'enemy-name' }, [def.name]),
        el('span', { class: 'enemy-hp' }, [`${enemy.hp}/${enemy.maxHp}`]),
      ]),
      el('div', { class: 'bar bar--hp' }, [
        el('span', { class: 'bar-fill', style: `width:${hpPct}%` }),
      ]),
      enemy.block > 0 ? el('span', { class: 'pip pip--block' }, [`Block ${enemy.block}`]) : null,
      statusRow.length > 0 ? el('div', { class: 'pips' }, statusRow) : null,
      intentNode,
      predictionNode,
    ],
  );

  node.addEventListener('click', options.onPick);
  return node;
}
