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

import type { CombatState, GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireCombat, requireRun } from '../../engine/state.ts';
import {
  canPlay,
  definitionOf,
  enemiesPending,
  needsTarget,
  roundOwed,
} from '../../engine/combat/combat.ts';
import { intentOf, intentVisible } from '../../engine/combat/intents.ts';
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
import { renderLog, scrollLogToNewest } from '../components/log.ts';
import { bindCombatKeys } from '../input.ts';
import {
  cardDealAfterPlay,
  cardExitDuration,
  cardStagger,
  clearEffects,
  dealCardIn,
  flyCardOut,
  fadeExpiredPips,
  playLogFx,
  prefersReducedMotion,
  setBarFill,
  type CardPile,
} from '../anim.ts';
import { combatInfo, renderInfoPanel } from '../components/info.ts';
import { renderCarried } from '../components/carried.ts';
import { renderGains } from '../components/gains.ts';
import { getSettings, setSetting } from '../settings.ts';
import { play, stopAll } from '../sound.ts';

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

/* These went back up after the M7 cut. The cut was measured against a fight
   you already understand — and against a screen that did not yet hold the
   shield number, so the thing it was hiding was invisible.
  
   What was actually wrong: the enemy turn ended, the numbers were still in the
   air, and your turn started underneath them. Block dropped to 3 in GUARD or to
   nothing in IAI while the blow it had just absorbed was still on screen, which
   reads as the armour giving up early rather than as the armour working. */

/** Beat before an enemy acts, so it reads as its own event and not as yours. */
const ENEMY_LEAD_MS = 560;
/** Extra time per additional blow, so `2 x 4` reads as two blows and not one. */
const ENEMY_HIT_MS = 340;
/**
 * A last beat once the numbers have settled, before anything else moves.
 *
 * This one carries the shield: the round close waits `fxRunning + SETTLE_MS`,
 * so it is the gap between the last number landing and the armour dropping.
 */
const SETTLE_MS = 420;

interface Selection {
  /** The card the player has picked up, if any. */
  cardUid: string | null;
  /** Hover preview on desktop. Never the only route to the information. */
  hoverUid: string | null;
  /** Which enemy the keyboard is cycling through. */
  focusUid: string | null;
  /**
   * Whether the keyboard is the thing doing the aiming.
   *
   * `focusUid` has to exist the moment a card is picked up, so a keyboard
   * player never has to reach for the mouse — but drawing a ring around it
   * unconditionally meant that with two enemies up, one of them was outlined
   * for the entire turn and looked selected when nothing was. The cursor is
   * still tracked; it is only *shown* once a key has moved it.
   */
  keyboardTargeting: boolean;
  logOpen: boolean;
  /** The rules panel. Never in `GameState` — it changes nothing about the world. */
  infoOpen: boolean;
  /**
   * The card the player just chose to play, if any.
   *
   * Known rather than inferred: whoever dispatched the action knows exactly
   * which uid left by choice. Working it out afterwards from the log, or from
   * how many cards vanished, would be guessing at something we were told — and
   * "played" has to look different from "discarded", or choosing a card means
   * nothing on screen. Cleared by the render that animates it.
   */
  playedUid: string | null;
}

export function renderCombat(store: Store): HTMLElement {
  const selection: Selection = {
    cardUid: null,
    hoverUid: null,
    focusUid: null,
    keyboardTargeting: false,
    /* Closed. It opened itself on every fight, which put a panel over the
       board before the player had asked a question — and the log is an answer
       to a question. `L` and the corner button both still open it, and the
       introduction says so. */
    logOpen: false,
    infoOpen: false,
    playedUid: null,
  };
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
   * The hand as it stood before the render about to happen.
   *
   * A card is not a thing that moves in this UI — the hand is rebuilt from
   * scratch every render, so a card leaving is a node that stops existing. The
   * node is captured here first, while it is still on screen and still has a
   * position, and re-adopted as its own ghost afterwards. See `flyCardOut`.
   */
  let handBefore = new Map<string, { node: HTMLElement; rect: DOMRect }>();

  /*
   * The last fight this screen drew.
   *
   * Kept only so the final frame of a won fight can be reconstructed — see the
   * branch in `rerender`. It is a snapshot for drawing, never read for a
   * decision, and it dies with the screen.
   */
  let lastCombat: CombatState | null = null;


  /*
   * The shield used to be held here, at display level, because the engine
   * dropped Block in the same dispatch as the last enemy's blow. It does not
   * any more — `closeRound` is its own action and this schedules it once the
   * blow has been drawn — so the number on screen is simply the number in
   * state, which is the only arrangement that cannot drift.
   *
   * Block still falls live while it absorbs a hit. That is the shield working,
   * and watching it go is the point of having it.
   */

  const scheduleEnemy = (): void => {
    if (enemyTimer !== 0) return;
    const state = store.getState();

    /* Every enemy has swung and the round is still open, waiting on us. Hold it
       for as long as the numbers still in the air need, then start the turn —
       which is the moment Block drops to what the stance retains. */
    if (roundOwed(state)) {
      const wait = fxRunning + SETTLE_MS;
      fxRunning = 0;
      enemyTimer = window.setTimeout(() => {
        enemyTimer = 0;
        store.dispatch({ kind: 'closeRound' });
      }, wait);
      return;
    }

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

    // The rolling log window can shrink; never slice from a stale index.
    if (state.log.length < logCursor) logCursor = state.log.length;
    const fresh = state.log.slice(logCursor);
    logCursor = state.log.length;

    /*
     * The last frame of a won fight.
     *
     * A win clears `combat` in the same dispatch as the blow that caused it, so
     * the board's final state — everything dead — is a state that never reaches
     * this listener. Returning here left the killing blow undrawn; rendering
     * nothing but the floaters left the enemy sitting at 6/18 with a `-6`
     * rising off it and then a cut to salvage, which is worse, because now the
     * number is visibly wrong rather than merely missing.
     *
     * So the frame is reconstructed from the last combat this screen actually
     * rendered, with every enemy at zero. That is not the UI deciding anything:
     * a won fight means an empty board, and it is the engine that decided the
     * fight was won. The bar animates down, the dead styling lands, and the
     * numbers from `fresh` rise off it.
     *
     * `fxRemainingMs()` is what the app shell reads to know how long to hold
     * before the swap.
     */
    if (state.run === null || state.run.combat === null) {
      const finished =
        lastCombat === null || state.run === null
          ? null
          : {
              ...state,
              run: {
                ...state.run,
                combat: {
                  ...lastCombat,
                  outcome: 'won' as const,
                  actingUid: null,
                  pendingEnemies: [],
                  enemies: lastCombat.enemies.map((enemy) => ({ ...enemy, hp: 0, block: 0 })),
                },
              },
            };

      if (finished !== null) {
        rendering = true;
        try {
          host.replaceChildren(build(store, finished, selection, rerender));
        } finally {
          rendering = false;
        }
      }

      playLogFx(
        fresh,
        (target) =>
          target === 'player'
            ? host.querySelector('.stat--hull')
            : host.querySelector(`.enemy[data-uid="${CSS.escape(target)}"]`),
        {
          stage: host.querySelector('.combat-inner'),
          playerMaxHealth: state.run?.pilot.maxHealth ?? 0,
          heat: finished?.run?.combat?.heat ?? null,
        },
      );
      return;
    }

    // Positions first: after `replaceChildren` these nodes are detached and
    // `getBoundingClientRect` on them reads zero.
    const leaving = handBefore;
    handBefore = captureHand(host);

    /* The hand is a horizontal scroller on a phone, and every render builds a
       brand new one — so without this, any rerender snapped the row back to the
       first card. Combined with a touch re-rendering the screen on finger-down
       (see `onHoverOrFocus`), swiping the hand worked about half the time and
       looked like the scroll itself was broken. It was not; the element it
       belonged to kept being replaced. */
    const handScroll = host.querySelector('.hand')?.scrollLeft ?? 0;

    rendering = true;
    try {
      host.replaceChildren(build(store, state, selection, rerender));
    } finally {
      rendering = false;
    }

    /* Restored only when the row still scrolls that far. Playing a card can
       shorten the hand, and holding a scroll offset past the new end would
       leave the player looking at blank space where their cards used to be. */
    const scroller = host.querySelector('.hand');
    if (scroller !== null && handScroll > 0) {
      scroller.scrollLeft = Math.min(handScroll, scroller.scrollWidth - scroller.clientWidth);
    }

    // Anything that expired this render gets a beat of leaving. After the DOM
    // exists, because it works by comparing what is drawn to what was.
    fadeExpiredPips(host);

    const moved = animateHand(host, state, leaving, selection.playedUid);
    selection.playedUid = null;
    handBefore = captureHand(host);

    /* The stage reads the fight. The background is CSS keyed off these two
       attributes rather than a second canvas — the asteroid scene already owns
       a loop, and a second one running behind every fight for the length of a
       run is a battery bug wearing an atmosphere costume. */
    lastCombat = state.run.combat;
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
        heat: state.run?.combat?.heat ?? null,
        // The content column shakes, not the screen root — the root owns the
        // stage background, and a background that moves with the hit shows the
        // page edge behind it, which reads as the browser hiccuping rather
        // than as the ship being hit.
        stage: host.querySelector('.combat-inner'),
        playerMaxHealth: state.run.pilot.maxHealth,
      },
    );
    if (played > 0) fxRunning = played + SETTLE_MS;
    /* Cards in flight hold the enemy turn too. A hand discarding into the pile
       while the first enemy is already swinging reads as two things happening
       to two different games. */
    if (moved > 0) fxRunning = Math.max(fxRunning, moved);

    const log = host.querySelector('.log');
    if (log !== null) scrollLogToNewest(log);

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
      selection.playedUid = cardUid;
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
    // A number still rising — or a card still flying — over a fight that has
    // ended is just litter.
    clearEffects();
  });

  rerender();
  return host;
}

function build(
  store: Store,
  state: GameState,
  selection: Selection,
  rerender: () => void,
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
  /* The shield reads the real number, with no display-level lag any more. The
     round no longer closes until the blow has been drawn, so the state and the
     label agree at every moment they are both on screen. */
  const shownBlock = combat.block;

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
            { class: 'pips pips--player', 'data-owner': 'player', 'aria-label': 'Statuses on you' },
            combat.statuses.map((held) => {
              const def = statusTable.find(held.status);
              return el(
                'span',
                {
                  class: `pip pip--${def?.kind ?? 'debuff'}`,
                  tabindex: '0',
                  title: def?.text ?? held.status,
                  'data-status': held.status,
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
        focused: selection.keyboardTargeting && selection.focusUid === enemy.uid,
        acting: combat.actingUid === enemy.uid,
        onPick: () => {
          // A click is the mouse taking over. The keyboard ring goes away.
          selection.keyboardTargeting = false;
          if (selection.cardUid === null) {
            selection.focusUid = enemy.uid;
            rerender();
            return;
          }
          const cardUid = selection.cardUid;
          selection.cardUid = null;
          selection.hoverUid = null;
          selection.playedUid = cardUid;
          store.dispatch({ kind: 'playCard', cardUid, targetUid: enemy.uid });
        },
      });
    }),
  );

  // Under Sensor Fog the total would hand back exactly what the fog took, so
  // the readout says how many contacts it cannot account for instead of
  // quietly reporting a number that is missing some of them.
  const unread = intentVisible(state)
    ? 0
    : combat.enemies.filter((enemy) => enemy.hp > 0).length;
  /* Only the thing that cannot be read off the board.
   *
   * The running total went away because every number in it was already on
   * screen twice: each enemy telegraphs its own intent above its own name, and
   * Block sits beside your health. A line that restates the board teaches
   * players to read the line instead of the board, and then a fight with a
   * status the total does not model reads wrong.
   *
   * Sensor Fog is the exception and the reason this element still exists. When
   * intents are hidden the count of contacts you cannot account for is not
   * derivable from anything on screen — and it stays an `aria-live` region so
   * the warning is announced rather than merely drawn. */
  const threat = el('p', { class: 'threat', role: 'status', 'aria-live': 'polite' }, [
    unread > 0
      ? `${unread} contact${unread === 1 ? '' : 's'} you cannot read. Block for the worst of it.`
      : null,
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
            selection.playedUid = card.uid;
            store.dispatch({ kind: 'playCard', cardUid: card.uid, targetUid: null });
            return;
          }
          selection.cardUid = card.uid;
          selection.keyboardTargeting = false;
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

  /* Nothing at rest. The idle line was a permanent instruction card under a
     hand of cards, which is a tutorial that never leaves — and the
     introduction already teaches all three of those bindings once, in a real
     fight, which is where they stick.
  
     What survives is the line that answers a question the player is holding
     right now: they have picked a card up and the game has to say what the
     next click does. */
  /* "Click" and "Esc" are both wrong on a phone, and this is the one line in
     the game whose whole job is telling you what to do next. Read off the
     pointer rather than the width: a touch laptop at 1400px still wants "tap",
     and a narrow desktop window does not. */
  const touch =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const putDown = touch ? '' : ' Esc to put it down.';
  const verb = touch ? 'Tap' : 'Click';

  const prompt = el('p', { class: 'hand-prompt' }, [
    selection.cardUid === null
      ? null
      : wantsTarget
        ? `${verb} a target to play it.${putDown}`
        : `${verb} the card again to play it.${putDown}`,
  ]);

  /* ---- tray ---- */

  const tray = el('div', { class: 'tray' }, [
    el('div', { class: 'piles' }, [
      pile('Deck', combat.draw.length, 'draw'),
      pile('Discard', combat.discard.length, 'discard'),
      pile('Exhaust', combat.exhaust.length, 'exhaust'),
    ]),
    el('div', { class: 'tray-actions' }, [
      button('End turn', { class: 'btn btn-primary', 'aria-keyshortcuts': 'E', 'data-sound': 'own' }, () => {
        play('endTurn');
        selection.cardUid = null;
        selection.hoverUid = null;
        store.dispatch({ kind: 'endTurn' });
      }),
    ]),
  ]);

  /* ---- the corner rail ----
     The log and the reference panel are things you reach for *between*
     decisions, and they were sitting next to End turn — the one button you
     press without looking. Out of the tray, into the corner, where a misclick
     costs nothing. */
  const corner = el('div', { class: 'combat-corner' }, [
    el('div', { class: 'combat-corner-buttons' }, [
      button(
        selection.logOpen ? 'Hide log' : 'Show log',
        { class: 'btn btn-quiet btn-corner btn-corner--log', 'aria-keyshortcuts': 'L' },
        () => {
          selection.logOpen = !selection.logOpen;
          rerender();
        },
      ),
      /* Everything the fight assumes you already know, one click from the
         fight. An hour-long run cannot afford a tutorial and cannot afford a
         player still guessing what Rust does in Act 3. */
      button('Info', { class: 'btn btn-quiet btn-corner', 'aria-label': 'How combat works' }, () => {
        selection.infoOpen = true;
        rerender();
      }),
      /* Volume, next to the two other things you reach for between decisions
         rather than during one.
         *
         * A slider rather than a switch: these are recordings at different
         * levels sitting under a fight that already has numbers flying off it,
         * and "too loud" and "silent" are not the only two opinions a person
         * can have about that. Zero IS the mute, so there is one control rather
         * than two that can disagree.
         *
         * `input`, not `change` — the level should follow the thumb rather than
         * arriving when it is let go, or setting it is guesswork. */
      renderVolume(rerender),
    ]),
    /* The log hangs off its own button. It used to sit at the bottom of the
       stage while the control that opened it was in the corner, so pressing
       the button appeared to do nothing until you looked somewhere else. */
    selection.logOpen ? renderLog(state, true) : null,
  ]);

  /* One fixed column, totals first.
   *
   * The two used to be separate fixed boxes — the rail pinned to the top of the
   * left margin and the totals pinned to the BOTTOM of it, which put the answer
   * to "what does all this add up to" at the far corner of the screen from the
   * health bar it qualifies. Nesting them makes the order a layout fact rather
   * than two independent guesses at a `top`, and puts the total where it is
   * read: at the top, against the bar. */
  const rail = el('div', { class: 'rail' }, [
    // The total of what the rail lists, so the sums are not done in the
    // player's head every turn. See `gains.ts`.
    renderGains(state),
    renderCarried(state),
  ]);

  return el('div', { class: 'combat-inner' }, [
    corner,
    rail,
    topBar,
    renderEnvironmentBadge(state),
    enemyRow,
    threat,
    playerPanel,
    hand,
    prompt,
    tray,
    selection.infoOpen
      ? renderInfoPanel('How the fight works', combatInfo(), () => {
          selection.infoOpen = false;
          rerender();
        })
      : null,
  ]);
}

/* ---------- cards in motion ----------
   The two halves of "a card moved", both of which have to work around the fact
   that the hand is rebuilt from scratch on every render. See `anim.ts`. */

interface HeldCard {
  readonly node: HTMLElement;
  readonly rect: DOMRect;
}

/**
 * Run `fn` once the host is in the document and has a size.
 *
 * Screens here build detached and are appended afterwards, so anything that
 * needs a real rect cannot simply read one at render time — it gets zeros and
 * fails silently. Bounded, so a screen that never attaches cannot spin.
 */
function whenMeasurable(host: HTMLElement, fn: () => void): void {
  const ready = (): boolean => host.isConnected && host.getBoundingClientRect().width > 0;

  /* Tried synchronously first, which is the case for every render EXCEPT the
     one that mounts the screen — so in a fight this costs nothing and waits for
     nothing. Only the mount falls through to the frame loop. */
  if (ready()) {
    fn();
    return;
  }

  let attempts = 0;
  const tick = (): void => {
    attempts += 1;
    if (ready()) {
      fn();
      return;
    }
    if (attempts < 8) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * The hand as it currently stands on screen, with positions.
 *
 * Called BEFORE the render that will destroy it. Rects have to be read here:
 * a detached node measures zero, and by the time we know a card is gone it is
 * already detached.
 */
function captureHand(host: HTMLElement): Map<string, HeldCard> {
  const held = new Map<string, HeldCard>();
  if (prefersReducedMotion()) return held;

  for (const node of host.querySelectorAll<HTMLElement>('.hand .card[data-uid]')) {
    const uid = node.dataset['uid'];
    if (uid === undefined) continue;
    held.set(uid, { node, rect: node.getBoundingClientRect() });
  }
  return held;
}

/** Which pile a card that left the hand actually landed in. */
/**
 * The volume control in the corner rail.
 *
 * The glyph is drawn rather than lettered: a speaker with waves that go away as
 * the level drops, so the state is readable without reading. It is also the
 * mute — clicking it drops to zero and clicking again restores what was there,
 * which is the gesture people already have for this control.
 */
function renderVolume(rerender: () => void): HTMLElement {
  const level = getSettings().volume;
  const pct = Math.round(level * 100);

  const glyph = el(
    'span',
    { class: 'vol-glyph', 'aria-hidden': 'true' },
    [level <= 0 ? '🔇' : level < 0.34 ? '🔈' : level < 0.7 ? '🔉' : '🔊'],
  );

  const slider = el('input', {
    class: 'vol-range',
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(pct),
    'aria-label': `Volume, ${pct} percent`,
  }) as HTMLInputElement;

  slider.addEventListener('input', () => {
    const next = Number(slider.value) / 100;
    setSetting('volume', next);
    /* Silence takes effect on everything already scheduled, not just on the
       next sound — a mute that lets half a second of an already-resolved turn
       play out reads as the control not working. */
    if (next <= 0) stopAll();
    glyph.textContent = next <= 0 ? '🔇' : next < 0.34 ? '🔈' : next < 0.7 ? '🔉' : '🔊';
    slider.setAttribute('aria-label', `Volume, ${Math.round(next * 100)} percent`);
  });

  /* The glyph is the mute, and it remembers. Dropping to zero and back to a
     level you did not choose is worse than not having the shortcut. */
  let restore = level > 0 ? level : 0.7;
  const toggle = button('', { class: 'btn btn-quiet btn-corner vol-mute', 'data-sound': 'own' }, () => {
    const now = getSettings().volume;
    if (now > 0) restore = now;
    setSetting('volume', now > 0 ? 0 : restore);
    if (now > 0) stopAll();
    rerender();
  });
  toggle.append(glyph);
  toggle.setAttribute('aria-label', level > 0 ? 'Mute' : 'Unmute');

  return el('div', { class: 'vol' }, [toggle, slider]);
}

function pileFor(state: GameState, uid: string): CardPile | null {
  const combat = state.run?.combat ?? null;
  if (combat === null) return null;
  if (combat.exhaust.some((card) => card.uid === uid)) return 'exhaust';
  if (combat.discard.some((card) => card.uid === uid)) return 'discard';
  // Back in the draw pile — a shuffle, not a journey. Nothing to show.
  return null;
}

/**
 * Play the difference between the hand that was and the hand that is.
 *
 * Returns how long the motion occupies, so the caller can keep the enemy turn
 * from starting on top of it.
 */
function animateHand(
  host: HTMLElement,
  state: GameState,
  before: Map<string, HeldCard>,
  playedUid: string | null,
): number {
  if (prefersReducedMotion()) return 0;

  const now = new Set<string>();
  const arrived: HTMLElement[] = [];
  for (const node of host.querySelectorAll<HTMLElement>('.hand .card[data-uid]')) {
    const uid = node.dataset['uid'];
    if (uid === undefined) continue;
    now.add(uid);
    if (!before.has(uid)) arrived.push(node);
  }

  const pileRect = (key: string): DOMRect | null =>
    host.querySelector<HTMLElement>(`.pile[data-pile="${key}"]`)?.getBoundingClientRect() ?? null;

  /* ---- leaving ---- */
  const discard = pileRect('discard');
  const exhaust = pileRect('exhaust');

  let index = 0;
  let held = false;
  for (const [uid, card] of before) {
    if (now.has(uid)) continue;

    const pile = pileFor(state, uid);
    if (pile === null) {
      card.node.remove();
      continue;
    }

    const target = pile === 'exhaust' ? exhaust : discard;
    if (target === null) {
      card.node.remove();
      continue;
    }

    /* Where it went and why it went are separate: Second Wind is played AND
       exhausts, and it should still read as the card you chose. */
    const played = uid === playedUid;
    // The played card goes first and alone; a discarded hand staggers.
    const delay = played ? 0 : cardStagger(index);
    if (played) held = true;
    else index += 1;

    flyCardOut(card.node, card.rect, target, { pile, played }, delay);
  }

  /* ---- arriving ----

     Deferred until the screen can actually be measured.

     On the render that MOUNTS this screen the host is still detached — every
     screen in this app builds its tree and is appended afterwards — so every
     rect reads zero and the opening hand would silently never deal in. That is
     the same detached-render trap as the map scroll and the info panel's
     focus, and it only shows up on the first render of a fight, which is
     exactly the deal you most want to see.

     Leaving cards do not need this: their rects were measured before the
     render, while they were still on screen. */
  const dealFrom = held ? cardDealAfterPlay() : 0;
  whenMeasurable(host, () => {
    const pile = host.querySelector<HTMLElement>('.pile[data-pile="draw"]')?.getBoundingClientRect();
    if (pile === undefined) return;
    arrived.forEach((node, slot) => dealCardIn(node, pile, dealFrom + cardStagger(slot)));
  });

  const exits = index + (held ? 1 : 0);
  const dealing = arrived.length === 0 ? 0 : dealFrom + cardStagger(arrived.length - 1);
  return Math.max(cardExitDuration(exits, held), dealing);
}

/** `data-pile` is how a card in flight finds where it is going. */
function pile(label: string, count: number, key: string): HTMLElement {
  return el('span', { class: 'pile', 'data-pile': key }, [
    el('span', { class: 'pile-label' }, [label]),
    el('span', { class: 'pile-count' }, [String(count)]),
  ]);
}
