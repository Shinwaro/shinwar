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
import { canPlay, definitionOf, enemiesPending, needsTarget } from '../../engine/combat/combat.ts';
import { incomingDamage, intentOf, intentVisible } from '../../engine/combat/intents.ts';
import { livingEnemies } from '../../engine/combat/damage.ts';
import { describeStatus } from '../../engine/combat/keywords.ts';
import { currentSeed, healthFraction } from '../../engine/queries.ts';
import { environments, statuses as statusTable } from '../../content/registry.ts';
import { HEAT } from '../../content/balance.ts';
import { button, el } from '../dom.ts';
import { renderCard } from '../components/card.ts';
import { renderEnemy } from '../components/enemy.ts';
import {
  renderEnvironmentBadge,
  renderHeatGauge,
  renderResources,
  renderStanceStrip,
} from '../components/gauges.ts';
import { envGetString } from '../../engine/combat/rules.ts';
import { renderLog, scrollLogToEnd } from '../components/log.ts';
import { bindCombatKeys } from '../input.ts';
import { clearFloaters, playLogFx, setBarFill } from '../anim.ts';

/* ---------- pacing ----------
 *
 * These were measured, not guessed, and then cut roughly in half at M7.
 *
 * A two-enemy turn used to take 5.4 seconds of watching, two of them before
 * anything happened at all. At five turns a fight and twenty fights an act
 * that is minutes of pure waiting inside a run already aiming at 45–70, and
 * Act 2's three-enemy packs were worse.
 *
 * The pause was buying two things. **Reading order** — which blow landed on
 * whom, in what sequence — is bought by spacing the floaters, and that is
 * `BEAT_STEP`, which stays. **Attribution** — which enemy is swinging — is
 * what the lead was for, and as of M7 the struck thing and the swinging thing
 * both animate, so the picture says it better than a gap ever did. Cutting the
 * lead only became honest once the hit feedback existed to replace it.
 *
 * `ENEMY_HIT_MS` was the clearest double-count: it spaced extra blows within
 * one enemy's move, on top of the floaters already spacing themselves.
 */

/** Beat before an enemy acts, so it reads as its own event and not as yours. */
const ENEMY_LEAD_MS = 380;
/** Extra time per additional blow, so `2 x 4` reads as two blows and not one. */
const ENEMY_HIT_MS = 280;
/** A last beat once the numbers have settled, before anything else moves. */
const SETTLE_MS = 160;

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

  /*
   * How far through the log the animation layer has played. The log is the
   * event stream, so "what should animate" is exactly "what was appended since
   * last time". Starts at the current length so mounting mid-fight does not
   * replay the whole history at once.
   */
  let logCursor = store.getState().log.length;

  /*
   * The enemy turn is paced rather than resolved in one frame. The engine
   * still steps instantly — `advanceEnemies` is a normal action — but the UI
   * dispatches one step at a time so you can see who is swinging at you, and
   * spaces the step by how many blows the move lands.
   */
  let enemyTimer = 0;

  /** How long the floaters from the last render still need. */
  let fxRunning = 0;

  /*
   * Block, as displayed, lags Block as stored.
   *
   * The engine drops Block at the start of your turn — GUARD keeps 3 — and that
   * happens in the same dispatch as the last enemy's blow. So the shield used to
   * snap to 3 while the damage numbers from the hit it just absorbed were still
   * in the air, which reads as the armour giving up early. The number shown is
   * held at its old value until the floaters land, then released.
   *
   * Presentation only: the engine is already correct and is never consulted
   * about this. `null` means "show whatever state says".
   */
  let heldBlock: number | null = null;
  let blockTimer = 0;
  let lastBlockShown = 0;

  const scheduleEnemy = (): void => {
    if (enemyTimer !== 0) return;
    const state = store.getState();
    if (!enemiesPending(state)) return;

    const combat = state.run?.combat ?? null;
    const uid = combat?.pendingEnemies[0] ?? null;
    const enemy = combat?.enemies.find((entry) => entry.uid === uid);
    const hits =
      enemy === undefined
        ? 1
        : intentOf(state, enemy).reduce((total, hit) => total + Math.max(1, hit.times), 0);

    // Wait out whatever is still in the air before starting the next beat, or
    // the enemy's numbers land on top of the player's.
    const wait = ENEMY_LEAD_MS + Math.max(0, hits - 1) * ENEMY_HIT_MS + fxRunning;
    fxRunning = 0;

    enemyTimer = window.setTimeout(() => {
      enemyTimer = 0;
      store.dispatch({ kind: 'advanceEnemies' });
      // The next enemy is scheduled by the render this dispatch triggers.
    }, wait);
  };

  const rerender = (): void => {
    if (rendering) return;
    const state = store.getState();
    // A won fight clears `combat` before the app swaps the screen out, and the
    // listener fires on that state first. Render nothing rather than throw.
    if (state.run === null || state.run.combat === null) return;

    // The rolling log window can shrink; never slice from a stale index.
    if (state.log.length < logCursor) logCursor = state.log.length;
    const fresh = state.log.slice(logCursor);
    logCursor = state.log.length;

    rendering = true;
    try {
      host.replaceChildren(build(store, state, selection, rerender, heldBlock));
    } finally {
      rendering = false;
    }

    /* The stage reads the fight. The background is CSS keyed off these two
       attributes rather than a second canvas — the asteroid scene already owns
       a loop, and a second one running behind every fight for the length of a
       run is a battery bug wearing an atmosphere costume. */
    host.dataset['stance'] = state.run.combat.stance;
    host.dataset['heat'] = state.run.combat.heat >= HEAT.overheatAt ? 'hot' : 'cool';

    // After the DOM exists, so the floaters can find what they rise from.
    const played = playLogFx(
      fresh,
      (target) =>
        target === 'player'
          ? host.querySelector('.stat--hull')
          : host.querySelector(`.enemy[data-uid="${CSS.escape(target)}"]`),
      {
        // The content column shakes, not the screen root — the root owns the
        // stage background, and a background that moves with the hit shows the
        // page edge behind it, which reads as the browser hiccuping rather
        // than as the ship being hit.
        stage: host.querySelector('.combat-inner'),
        playerMaxHealth: state.run.pilot.maxHealth,
      },
    );
    if (played > 0) fxRunning = played + SETTLE_MS;

    /*
     * If Block fell while numbers are still flying, keep showing the old value
     * until they land. Only when it FELL — a gain should appear immediately,
     * because that is the player's own card doing something.
     */
    const shown = state.run.combat.block;
    if (played > 0 && lastBlockShown > shown && lastBlockShown > 0) {
      heldBlock = lastBlockShown;
      window.clearTimeout(blockTimer);
      blockTimer = window.setTimeout(() => {
        blockTimer = 0;
        heldBlock = null;
        rerender();
      }, played + SETTLE_MS);
    } else if (blockTimer === 0) {
      lastBlockShown = shown;
    }

    const log = host.querySelector('.log');
    if (log !== null) scrollLogToEnd(log);

    scheduleEnemy();
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
    window.clearTimeout(enemyTimer);
    window.clearTimeout(blockTimer);
    // A number still rising over a fight that has ended is just litter.
    clearFloaters();
  });

  rerender();
  return host;
}

function build(
  store: Store,
  state: GameState,
  selection: Selection,
  rerender: () => void,
  heldBlock: number | null = null,
): HTMLElement {
  const run = requireRun(state);
  const combat = requireCombat(state);

  /*
   * No damage predictions on the enemies. The card says what it does and the
   * stance strip says what the stance does — working out what that adds up to
   * is the game, not a chore to be automated away.
   *
   * `previewCard` still exists and is still tested against resolution: the
   * guarantee that a preview cannot disagree with the result is architectural,
   * and it will be needed the moment anything wants to ask. Nothing on this
   * screen asks.
   */
  /*
   * What the shield reads. `heldBlock` is set only while damage floaters from a
   * blow this Block already absorbed are still in the air — see the comment on
   * the declaration. Everything that computes with Block still uses the real
   * value; this is the label alone.
   */
  const shownBlock = heldBlock ?? combat.block;

  const alive = livingEnemies(combat);
  const selectedDef = selection.cardUid === null
    ? null
    : (combat.hand.find((card) => card.uid === selection.cardUid) ?? null);
  const wantsTarget =
    selectedDef === null ? false : needsTarget(definitionOf(selectedDef), combat.stance);

  /* ---- top bar ---- */

  const healthFill = el('span', { class: 'bar-fill' });
  const healthBar = el('div', { class: 'bar bar--hull' }, [healthFill]);
  setBarFill(healthFill, 'player', healthFraction(run) * 100, true);

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
            class: `shield ${shownBlock > 0 ? 'is-up' : 'is-down'}`,
            'aria-label': `${shownBlock} Block`,
            title: 'Block absorbs damage before it reaches your hull.',
          },
          [el('span', { class: 'shield-icon', 'aria-hidden': 'true' }, ['⛨']), String(shownBlock)],
        ),
      ]),
      healthBar,
      // What is on YOU. Enemies have shown their statuses since M1 and the
      // player's were rendered nowhere at all, so an enemy applying Weak was
      // indistinguishable from an enemy doing nothing.
      combat.statuses.length === 0
        ? null
        : el(
            'div',
            { class: 'pips pips--player', 'aria-label': 'Statuses on you' },
            combat.statuses.map((held) => {
              const def = statusTable.find(held.status);
              return el(
                'span',
                {
                  class: `pip pip--${def?.kind ?? 'debuff'}`,
                  tabindex: '0',
                  title: def?.text ?? held.status,
                },
                [describeStatus(held.status, held.stacks)],
              );
            }),
          ),
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
      return renderEnemy(state, enemy, {
        targetable: selection.cardUid !== null && enemy.hp > 0,
        focused: selection.focusUid === enemy.uid,
        acting: combat.actingUid === enemy.uid,
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
  // Under Sensor Fog the total would hand back exactly what the fog took, so
  // the readout says how many contacts it cannot account for instead of
  // quietly reporting a number that is missing some of them.
  const unread = intentVisible(state)
    ? 0
    : combat.enemies.filter((enemy) => enemy.hp > 0).length;
  const threat = el('p', { class: 'threat', role: 'status', 'aria-live': 'polite' }, [
    unread > 0
      ? `${unread} contact${unread === 1 ? '' : 's'} you cannot read. Block for the worst of it.`
      : incoming > 0
        ? `Incoming this turn: ${incoming}${combat.block > 0 ? ` · ${combat.block} Block absorbs first` : ''}`
        : 'Nothing incoming this turn.',
  ]);

  /* ---- the player's row ---- */

  // The Debris Field marks the highest-HP combatant, which early in a fight is
  // usually the player. A telegraph the player cannot see is not a telegraph.
  const marked = envGetString(combat, 'debrisTarget') === 'player';

  const playerPanel = el('section', { class: 'player-panel', 'aria-label': 'Your state' }, [
    marked
      ? el('div', { class: 'debris-mark', role: 'status' }, [
          el('span', { 'aria-hidden': 'true' }, ['◎']),
          'A rock is coming for you at the end of this round',
        ])
      : null,
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
      // Sensor Fog only, and free. Pick an enemy, then read it — the cost is
      // the ordering, never a resource.
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
    renderEnvironmentBadge(state),
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
