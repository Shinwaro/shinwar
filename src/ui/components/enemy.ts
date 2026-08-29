/* An enemy: HP, statuses, and what it is about to do.
 *
 * The intent shows exact numbers, multi-hit as `3 x 5`, and buffs by name.
 * When a card is selected, the predicted damage appears inline on every enemy
 * — that is the whole reason the two-step selection model exists, and it works
 * identically on desktop and touch.
 */

import type { EnemyState, GameState } from '../../engine/types.ts';
import {
  describeIntentHit,
  describeIntentKind,
  intentOf,
  intentVisible,
  narrateIntent,
} from '../../engine/combat/intents.ts';
import { describeStatus } from '../../engine/combat/keywords.ts';
import { envGetString } from '../../engine/combat/rules.ts';
import { requireCombat } from '../../engine/state.ts';
import { enemies as enemyTable, statuses as statusTable } from '../../content/registry.ts';
import { el } from '../dom.ts';
import { setBarFill } from '../anim.ts';
import { renderGlyph } from './glyph.ts';

/**
 * The glyph on each kind of telegraph.
 *
 * The second channel. A player reading the board at speed goes by the colour;
 * a player who cannot separate violet from blue goes by the mark, and both are
 * always present.
 */
const INTENT_MARK: Record<'attack' | 'block' | 'buff' | 'debuff', string> = {
  attack: '⚔',
  block: '⛨',
  buff: '▲',
  debuff: '▼',
};

export interface EnemyViewOptions {
  readonly targetable: boolean;
  readonly focused: boolean;
  /** This enemy is taking its turn right now. */
  readonly acting: boolean;
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
  if (options.acting) classes.push('is-acting');

  const statusRow = enemy.statuses.map((held) =>
    el(
      'span',
      {
        class: `pip pip--${statusTable.find(held.status)?.kind ?? 'debuff'}`,
        title: statusTable.find(held.status)?.text ?? held.status,
        // Identity, so the animation layer can tell one that fell off from one
        // that only changed its count. See `fadeExpiredPips`.
        'data-status': held.status,
      },
      [describeStatus(held.status, held.stacks)],
    ),
  );

  // Sensor Fog hides the telegraph and offers nothing back. It is the one
  // environment that takes information away rather than adding a rule, and the
  // answer to it is defensive play, not a button.
  const visible = intentVisible(state);
  /* One mark per part of the telegraph, coloured by what that part DOES.
   *
   * It used to be a single line that went amber if anything in it was an
   * attack and blue otherwise — so a move that swung for 8 and left you
   * Vulnerable, and a move that swung for 8 and did nothing else, looked
   * identical. The two things a player most needs to see coming are the debuff
   * landing on them and the enemy making itself stronger, and both were the
   * quietest thing on the board.
   *
   * Colour is never the only channel: each mark carries its own glyph and its
   * own words in `title`, and the accessible name says the whole sentence. The
   * two reds — the swing and the thing aimed at you — also differ by depth and
   * by a dashed border, because they are close on purpose. */
  const intentNode = dead
    ? null
    : !visible
      ? el('div', { class: 'intent intent--hidden' }, [
          el('span', { class: 'intent-hit', 'data-kind': 'hidden' }, [
            el('span', { class: 'intent-icon', 'aria-hidden': 'true' }, ['?']),
            el('span', { class: 'intent-text' }, ['Sensors fogged']),
          ]),
        ])
      : el(
          'div',
          {
            class: `intent ${attacking ? 'intent--attack' : 'intent--other'}`,
            'aria-label': narrateIntent(hits),
          },
          hits.length === 0
            ? [
                el('span', { class: 'intent-hit', 'data-kind': 'wait' }, [
                  el('span', { class: 'intent-text' }, ['Waiting']),
                ]),
              ]
            : hits.map((hit) =>
                el(
                  'span',
                  {
                    class: 'intent-hit',
                    'data-kind': hit.kind,
                    title: `${describeIntentKind(hit.kind)} — ${describeIntentHit(hit)}`,
                  },
                  [
                    el('span', { class: 'intent-icon', 'aria-hidden': 'true' }, [
                      INTENT_MARK[hit.kind],
                    ]),
                    el('span', { class: 'intent-text' }, [describeIntentHit(hit)]),
                  ],
                ),
              ),
        );

  // The Debris Field marks its target a full turn ahead. The randomness is in
  // which rock comes, never in whether the player could have seen it.
  const marked = !dead && envGetString(requireCombat(state), 'debrisTarget') === enemy.uid;

  const hpPct = enemy.maxHp === 0 ? 0 : Math.max(0, (enemy.hp / enemy.maxHp) * 100);
  const hpFill = el('span', { class: 'bar-fill' });
  const hpBar = el('div', { class: 'bar bar--hp' }, [hpFill]);
  // Drains from wherever it was rather than snapping, so a hit reads as a hit.
  setBarFill(hpFill, `enemy:${enemy.uid}`, hpPct, true);

  const node = el(
    'button',
    {
      type: 'button',
      class: classes.join(' '),
      'data-uid': enemy.uid,
      // Elites and bosses accent their mark. The cheapest possible way to say
      // "this one is not like the others" on a board you are reading quickly.
      'data-tier': def.tier,
      disabled: dead || !options.targetable,
      'aria-label': `${def.name}, ${enemy.hp} of ${enemy.maxHp} hull`,
    },
    [
      el('div', { class: 'enemy-head' }, [
        /* The mark first, so the eye lands on the silhouette before the
           words. Two enemies used to be two identical boxes with different
           text in them, and "kill the small one first" only works if the small
           one looks like something. */
        renderGlyph(def.id, def.name),
        el('span', { class: 'enemy-name' }, [def.name]),
        el('span', { class: 'enemy-hp' }, [`${enemy.hp}/${enemy.maxHp}`]),
        // Same shield as the player's, on the same row as the health it
        // protects. Block is not a status and should not read as one.
        el(
          'span',
          {
            class: `shield ${enemy.block > 0 ? 'is-up' : 'is-down'}`,
            title: 'Block absorbs damage before it reaches hull.',
          },
          [el('span', { class: 'shield-icon', 'aria-hidden': 'true' }, ['⛨']), String(enemy.block)],
        ),
      ]),
      hpBar,
      // Always rendered, even empty: a pip that expires needs somewhere to fade
      // out, and a container that disappears with it takes the fade with it.
      el('div', { class: 'pips', 'data-owner': enemy.uid }, statusRow),
      marked
        ? el('div', { class: 'debris-mark', title: 'A rock is coming for this one at the end of the round.' }, [
            el('span', { 'aria-hidden': 'true' }, ['◎']),
            'Marked',
          ])
        : null,
      intentNode,
    ],
  );

  node.addEventListener('click', options.onPick);
  return node;
}
