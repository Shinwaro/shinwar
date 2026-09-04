/* An enemy: HP, statuses, and what it is about to do.
 *
 * The intent shows exact numbers, multi-hit as `3 x 5`, and buffs by name.
 * When a card is selected, the predicted damage appears inline on every enemy
 * — that is the whole reason the two-step selection model exists, and it works
 * identically on desktop and touch.
 */

import type { EnemyState, GameState } from '../../engine/types.ts';
import type { TargetHullInterest } from '../../engine/queries.ts';
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
  /**
   * What the card in hand wants to know about this target's hull, or null.
   *
   * Comes from `targetHullInterest` in the engine — the component does not read
   * effect ops itself. Present only while a card is actually picked up, because
   * these marks answer a question the card is asking and mean nothing without
   * one.
   */
  readonly hullInterest: TargetHullInterest | null;
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
        // Identity and count, so the animation layer can tell one that fell
        // off from one that only changed its count, and can say by how much.
        // See `fadeExpiredPips`.
        'data-status': held.status,
        'data-stacks': String(held.stacks),
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



  // Outlines the whole card, so "who is marked" is answerable without reading.
  if (marked) classes.push('is-marked');

  const hpPct = enemy.maxHp === 0 ? 0 : Math.max(0, (enemy.hp / enemy.maxHp) * 100);
  const hpFill = el('span', { class: 'bar-fill' });

  /*
   * The lines the selected card is asking about, drawn on the bar it asks
   * about.
   *
   * Execute pays below 30% and the board says `28/28`, so the player converts
   * hull into percent in their head, every turn, against a number that changes
   * every turn. A tick turns that into looking at where the fill sits relative
   * to a line — the question, drawn, rather than the question, computed.
   *
   * Positioned from the left with no width: it is a hairline at a percentage,
   * and the fill it is compared against is positioned the same way, so the two
   * cannot drift apart.
   */
  const interest = options.hullInterest;
  const ticks = (interest?.thresholds ?? []).map((line) =>
    el('span', {
      class: 'bar-line',
      style: `left:${line.pct}%`,
      'data-side': line.side,
      'aria-hidden': 'true',
      title: `This card reads ${line.side} ${line.pct}% hull`,
    }),
  );

  const hpBar = el('div', { class: 'bar bar--hp' }, [hpFill, ...ticks]);
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
        /* The percentage, and only while a card that speaks in percentages is
           in hand. It is the same fact as the numbers beside it, in the units
           the card used — worth its space exactly when something is asking,
           and noise the rest of the time. */
        interest === null
          ? null
          : el(
              'span',
              {
                class: 'enemy-hp-pct',
                title: 'This card reads the target’s hull as a percentage.',
              },
              [`${Math.round(hpPct)}%`],
            ),
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
      intentNode,
      /* The mark, in the card's own bottom-right corner.
       *
       * Its own right-aligned row at the bottom of the card grid — see the CSS
       * for why it is not simply overlaid on the corner: the intent row is
       * centred and spans the card, so an overlay collided with the telegraph
       * on every normal-tier enemy.
       *
       * It rode inside the intent row for a moment. That put it in the right
       * place conceptually and the wrong place visually: on a normal-tier card
       * it competed with the telegraph for a line barely wide enough for the
       * telegraph. Its own row is the only version where nothing moves and
       * nothing overlaps. */
      marked ? debrisChip() : null,
    ],
  );

  node.addEventListener('click', options.onPick);
  return node;
}

const DEBRIS_WORDS = 'A rock hits this one at the end of the round. Block stops it.';

/**
 * The Debris Field’s mark, for whoever the rock is coming for.
 *
 * One chip, no direction, on the marked combatant’s own panel — beside the
 * intent on an enemy card, beside Energy in the stance window for the player.
 * Both of those are places the player is already reading to find out what
 * happens at the end of this round, which is exactly what the mark says.
 *
 * It has been four things now and the arrow is the one worth remembering: a
 * single fixed label with a left/right/down arrow held still, which was the
 * point, but it put a direction between the reader and the answer — and
 * sitting between two cards on a three-wide board, "left" is a guess. Words on
 * the thing they are about need no resolving step. The red outline on the card
 * or panel is what makes it findable from across the board; this is what makes
 * it readable once found.
 */
export function debrisChip(): HTMLElement {
  return el(
    'div',
    { class: 'debris-mark', role: 'status', title: DEBRIS_WORDS },
    [
      el('span', { class: 'debris-word' }, ['Marked']),
      el('span', { class: 'visually-hidden' }, [' — ' + DEBRIS_WORDS]),
    ],
  );
}
