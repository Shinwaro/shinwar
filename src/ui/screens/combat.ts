/* The combat screen.
 *
 * Interaction model, identical on desktop and touch:
 *
 *   click/tap a card  -> it lifts and becomes selected. The stance rider
 *                        resolves, valid targets outline, and every enemy
 *                        shows its predicted damage inline.
 *   click/tap a target -> the card plays.
 *   click the card again, or Esc -> deselect.
 *
 * Desktop adds hover as an extra preview, never as the only way to see
 * something. Drag-to-play is deliberately absent: it is fiddly on touch,
 * fights page scroll, and gives nothing the two-step does not.
 *
 * Selection lives here, not in `GameState`. It changes nothing about the world
 * and undoing it costs nothing, so it is not a decision worth logging.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireCombat, requireRun } from '../../engine/state.ts';
import { canPlay, definitionOf, needsTarget } from '../../engine/combat/combat.ts';
import { previewCard } from '../../engine/combat/preview.ts';
import { incomingDamage } from '../../engine/combat/intents.ts';
import { livingEnemies } from '../../engine/combat/damage.ts';
import { currentSeed, healthFraction } from '../../engine/queries.ts';
import { environments } from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { renderCard } from '../components/card.ts';
import { renderEnemy } from '../components/enemy.ts';
import { renderHeatGauge, renderResources, renderStanceStrip } from '../components/gauges.ts';
import { renderLog, scrollLogToEnd } from '../components/log.ts';
import { bindCombatKeys } from '../input.ts';

interface Selection {
  /** The card the player has picked up, if any. */
  cardUid: string | null;
  /** Hover preview on desktop. Never the only route to the information. */
  hoverUid: string | null;
  /** Which enemy the keyboard is cycling through. */
  focusUid: string | null;
  logOpen: boolean;
}

export function renderCombat(store: Store): HTMLElement {
  const selection: Selection = { cardUid: null, hoverUid: null, focusUid: null, logOpen: true };
  const host = el('main', { class: 'combat screen' });

  /*
   * Re-entrancy guard. Swapping the hand removes the focused card, which fires
   * `blur` synchronously — and the hover handler on `blur` asks for another
   * render, landing back in here while the DOM is mid-mutation. That throws
   * `NotFoundError`, once per card, on every turn.
   */
  let rendering = false;

  const rerender = (): void => {
    if (rendering) return;
    const state = store.getState();
    // A won fight clears `combat` before the app swaps the screen out, and the
    // listener fires on that state first. Render nothing rather than throw.
    if (state.run === null || state.run.combat === null) return;
    rendering = true;
    try {
      host.replaceChildren(build(store, state, selection, rerender));
    } finally {
      rendering = false;
    }
    const log = host.querySelector('.log');
    if (log !== null) scrollLogToEnd(log);
  };

  const detachKeys = bindCombatKeys({
    getState: () => store.getState(),
    getSelection: () => selection,
    setSelection: (next) => {
      Object.assign(selection, next);
      rerender();
    },
    play: (cardUid, targetUid) => {
      store.dispatch({ kind: 'playCard', cardUid, targetUid });
      selection.cardUid = null;
      selection.hoverUid = null;
    },
    endTurn: () => {
      selection.cardUid = null;
      selection.hoverUid = null;
      store.dispatch({ kind: 'endTurn' });
    },
  });

  // Both listeners have to come down with the screen. Without the unsubscribe,
  // every combat ever fought keeps re-rendering into a detached node for the
  // rest of the run.
  const unsubscribe = store.subscribe(rerender);
  host.addEventListener('shinwar:unmount', () => {
    detachKeys();
    unsubscribe();
  });

  rerender();
  return host;
}

function build(store: Store, state: GameState, selection: Selection, rerender: () => void): HTMLElement {
  const run = requireRun(state);
  const combat = requireCombat(state);

  /* The card under consideration: the selected one, or whatever is hovered. */
  const previewUid = selection.cardUid ?? selection.hoverUid;
  const alive = livingEnemies(combat);

  /*
   * Every enemy shows what IT would take, which means previewing the card once
   * per candidate target rather than once against the focused one. That is the
   * whole point of the two-step model: the player compares before committing,
   * and comparing needs all the numbers on screen at the same time.
   *
   * Each of these is a dry run of the real `playCard`, so none of them can
   * disagree with what actually happens.
   */
  const predictions = new Map<string, { hpLoss: number; willDie: boolean }>();
  if (previewUid !== null) {
    for (const enemy of alive) {
      const preview = previewCard(state, previewUid, enemy.uid);
      const mine = preview.enemies.find((entry) => entry.uid === enemy.uid);
      if (mine !== undefined) predictions.set(enemy.uid, { hpLoss: mine.hpLoss, willDie: mine.willDie });
    }
  }
  const selectedDef = selection.cardUid === null
    ? null
    : (combat.hand.find((card) => card.uid === selection.cardUid) ?? null);
  const wantsTarget =
    selectedDef === null ? false : needsTarget(definitionOf(selectedDef), combat.stance);

  /* ---- top bar ---- */

  const environment = environments.find(combat.environmentId);
  const topBar = el('header', { class: 'combat-bar' }, [
    el('div', { class: 'stat stat--hull' }, [
      el('div', { class: 'hull-head' }, [
        // This is combat on foot, so it is the ronin's own health at stake —
        // not the cutter's hull, which only space combat can touch.
        el('span', { class: 'stat-label' }, ['HEALTH']),
        el('span', { class: 'stat-value' }, [`${run.pilot.health}/${run.pilot.maxHealth}`]),
        // Block belongs beside the hull it is protecting, not in a resource
        // list further down. It is the number you check before ending a turn.
        el(
          'span',
          {
            class: `shield ${combat.block > 0 ? 'is-up' : 'is-down'}`,
            'aria-label': `${combat.block} Block`,
            title: 'Block absorbs damage before it reaches your hull.',
          },
          [el('span', { class: 'shield-icon', 'aria-hidden': 'true' }, ['⛨']), String(combat.block)],
        ),
      ]),
      el('div', { class: 'bar bar--hull' }, [
        el('span', { class: 'bar-fill', style: `width:${healthFraction(run) * 100}%` }),
      ]),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label' }, ['ALLOY']),
      el('span', { class: 'stat-value' }, [String(run.alloy)]),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label' }, ['ENV']),
      el('span', { class: 'stat-value', title: environment?.text ?? '' }, [environment?.name ?? '—']),
    ]),
    el('div', { class: 'stat stat--seed' }, [
      el('span', { class: 'stat-label' }, ['SEED']),
      el('span', { class: 'stat-value stat-value--mono' }, [currentSeed(state)]),
    ]),
  ]);

  /* ---- enemies ---- */

  const enemyRow = el(
    'section',
    { class: 'enemy-row', 'aria-label': 'Enemies' },
    combat.enemies.map((enemy) => {
      const predicted = predictions.get(enemy.uid) ?? null;
      return renderEnemy(state, enemy, {
        targetable: selection.cardUid !== null && enemy.hp > 0,
        focused: selection.focusUid === enemy.uid,
        predicted: predicted === null ? null : predicted.hpLoss,
        willDie: predicted?.willDie ?? false,
        onPick: () => {
          if (selection.cardUid === null) {
            selection.focusUid = enemy.uid;
            rerender();
            return;
          }
          const cardUid = selection.cardUid;
          selection.cardUid = null;
          selection.hoverUid = null;
          store.dispatch({ kind: 'playCard', cardUid, targetUid: enemy.uid });
        },
      });
    }),
  );

  const incoming = incomingDamage(state);
  const threat = el('p', { class: 'threat', role: 'status', 'aria-live': 'polite' }, [
    incoming > 0
      ? `Incoming this turn: ${incoming}${combat.block > 0 ? ` · ${combat.block} Block absorbs first` : ''}`
      : 'Nothing incoming this turn.',
  ]);

  /* ---- the player's row ---- */

  const playerPanel = el('section', { class: 'player-panel', 'aria-label': 'Your state' }, [
    renderStanceStrip(state),
    renderHeatGauge(state),
    renderResources(state),
  ]);

  /* ---- hand ---- */

  const hand = el(
    'section',
    { class: 'hand', 'aria-label': 'Your hand' },
    combat.hand.map((card, index) => {
      const check = canPlay(state, card.uid);
      return renderCard(state, card, {
        index,
        selected: selection.cardUid === card.uid,
        playable: check.ok,
        reason: check.reason,
        onSelect: () => {
          if (!check.ok) return;
          if (selection.cardUid === card.uid) {
            selection.cardUid = null;
            rerender();
            return;
          }
          const def = definitionOf(card);
          if (!needsTarget(def, combat.stance)) {
            // Nothing to aim at — playing it immediately is the whole
            // interaction, and making the player click twice for a Block card
            // would be ceremony.
            selection.cardUid = null;
            store.dispatch({ kind: 'playCard', cardUid: card.uid, targetUid: null });
            return;
          }
          selection.cardUid = card.uid;
          if (selection.focusUid === null) selection.focusUid = alive[0]?.uid ?? null;
          rerender();
        },
        onHover: (hovering) => {
          const next = hovering ? card.uid : null;
          if (selection.hoverUid === next) return;
          selection.hoverUid = next;
          if (selection.cardUid === null) rerender();
        },
      });
    }),
  );

  const prompt = el('p', { class: 'hand-prompt' }, [
    selection.cardUid === null
      ? 'Click a card to pick it up. Number keys play, E ends the turn, L toggles the log.'
      : wantsTarget
        ? 'Click a target to play it. Esc to put it down.'
        : 'Click the card again to play it. Esc to put it down.',
  ]);

  /* ---- tray ---- */

  const tray = el('div', { class: 'tray' }, [
    el('div', { class: 'piles' }, [
      pile('Deck', combat.draw.length),
      pile('Discard', combat.discard.length),
      pile('Exhaust', combat.exhaust.length),
    ]),
    el('div', { class: 'tray-actions' }, [
      button(selection.logOpen ? 'Hide log' : 'Show log', { class: 'btn btn-quiet', 'aria-keyshortcuts': 'L' }, () => {
        selection.logOpen = !selection.logOpen;
        rerender();
      }),
      button('End turn', { class: 'btn btn-primary', 'aria-keyshortcuts': 'E' }, () => {
        selection.cardUid = null;
        selection.hoverUid = null;
        store.dispatch({ kind: 'endTurn' });
      }),
    ]),
  ]);

  return el('div', { class: 'combat-inner' }, [
    topBar,
    enemyRow,
    threat,
    playerPanel,
    hand,
    prompt,
    tray,
    selection.logOpen ? renderLog(state, true) : null,
  ]);
}

function pile(label: string, count: number): HTMLElement {
  return el('span', { class: 'pile' }, [
    el('span', { class: 'pile-label' }, [label]),
    el('span', { class: 'pile-count' }, [String(count)]),
  ]);
}
