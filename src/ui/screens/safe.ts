/* The Safe Planet, and the Station.
 *
 * The Safe Planet is a menu and never a bare heal button — "heal or upgrade"
 * is one of the best decisions Slay the Spire makes and it costs nothing to
 * implement. You get exactly one of the four.
 *
 * The Station sells hull repair. Cards, modules and the card-removal counter
 * arrive at M4 with the shop proper.
 */

import type { CardInstance, GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { describeCard, describeCost } from '../../engine/combat/describe.ts';
import { ECONOMY } from '../../content/balance.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';

type Picker = 'upgrade' | 'remove' | null;

export function renderSafePlanet(store: Store): HTMLElement {
  // Which sub-menu is open is UI state, not a decision — it changes nothing
  // about the world, so it lives here rather than in `GameState`.
  let picking: Picker = null;
  let host: HTMLElement | null = null;

  const rebuild = (state: GameState): Node | null => {
    if (state.run === null || state.run.screen !== 'safe') return null;
    return build(store, state, picking, (next) => {
      picking = next;
      const rebuilt = rebuild(store.getState());
      if (rebuilt !== null) host?.replaceChildren(rebuilt);
    });
  };

  host = liveScreen(store, 'safe screen', rebuild);
  return host;
}

function build(
  store: Store,
  state: GameState,
  picking: Picker,
  setPicking: (next: Picker) => void,
): HTMLElement {
  const run = requireRun(state);
  const healAmount = Math.floor(run.pilot.maxHealth * ECONOMY.safePlanetHealPct);
  const missing = run.pilot.maxHealth - run.pilot.health;

  if (picking !== null) {
    return el('div', { class: 'safe-inner' }, [
      renderRunBar(store, state),
      el('h1', { class: 'screen-title' }, [picking === 'upgrade' ? 'Forge a card' : 'Strip a card']),
      el('p', { class: 'safe-note' }, [
        picking === 'upgrade'
          ? 'Upgrading is permanent for the run. One card.'
          : 'Removal is the anti-bloat valve. One card, free, here.',
      ]),
      el(
        'div',
        { class: 'deck-list' },
        run.pilot.deck.map((card) => renderDeckCard(store, card, picking)),
      ),
      button('Back', { class: 'btn' }, () => setPicking(null)),
    ]);
  }

  const options = [
    option(
      'Rest',
      `Recover ${healAmount} health.`,
      missing === 0 ? 'Already at full health.' : `You are down ${missing}.`,
      missing === 0,
      () => store.dispatch({ kind: 'safePlanetHeal' }),
    ),
    option(
      'Forge',
      'Upgrade one card, permanently.',
      'Every copy of that card is a different card afterwards.',
      run.pilot.deck.every((card) => card.upgraded),
      () => setPicking('upgrade'),
    ),
    option(
      'Strip',
      'Remove one card from the deck.',
      'A smaller deck draws what it needs more often.',
      run.pilot.deck.length <= 1,
      () => setPicking('remove'),
    ),
    option(
      'Bleed',
      `Trade ${ECONOMY.refuelHullCost} health for ${ECONOMY.refuelAlloyGain} Alloy.`,
      run.pilot.health <= ECONOMY.refuelHullCost ? 'Not enough left to spare.' : 'Alloy buys both paths.',
      run.pilot.health <= ECONOMY.refuelHullCost,
      () => store.dispatch({ kind: 'safePlanetTrade' }),
    ),
  ];

  return el('div', { class: 'safe-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Safe Planet']),
    el('p', { class: 'safe-note' }, ['Choose one. The rest of the system will still be here.']),
    el('div', { class: 'safe-options' }, options),
  ]);
}

function option(
  title: string,
  effect: string,
  hint: string,
  disabled: boolean,
  onPick: () => void,
): HTMLElement {
  const node = button('', { class: `safe-option${disabled ? ' is-disabled' : ''}`, disabled }, onPick);
  node.replaceChildren(
    el('span', { class: 'safe-option-title' }, [title]),
    el('span', { class: 'safe-option-effect' }, [effect]),
    el('span', { class: 'safe-option-hint' }, [hint]),
  );
  return node;
}

function renderDeckCard(store: Store, card: CardInstance, picking: 'upgrade' | 'remove'): HTMLElement {
  const def = definitionOf(card);
  const disabled = picking === 'upgrade' && card.upgraded;

  const node = button(
    '',
    { class: `card card--${def.type}${disabled ? ' is-unplayable' : ''}`, disabled },
    () => {
      store.dispatch(
        picking === 'upgrade'
          ? { kind: 'safePlanetUpgrade', cardUid: card.uid }
          : { kind: 'safePlanetRemove', cardUid: card.uid },
      );
    },
  );

  node.replaceChildren(
    el('div', { class: 'card-head' }, [
      el('span', { class: 'card-cost' }, [describeCost(def)]),
      el('span', { class: 'card-name' }, [def.name]),
    ]),
    el('p', { class: 'card-text' }, [describeCard(def)]),
  );
  return node;
}

/* ---------- the Station ---------- */

export function renderStation(store: Store): HTMLElement {
  return liveScreen(store, 'safe screen', (state) => {
    if (state.run === null || state.run.screen !== 'station') return null;
    const run = requireRun(state);
    const missing = run.pilot.maxHealth - run.pilot.health;
    const affordable = Math.min(missing, Math.floor(run.alloy / ECONOMY.hullRepairPerPoint));

    return el('div', { class: 'safe-inner' }, [
        renderRunBar(store, state),
        el('h1', { class: 'screen-title' }, ['Station']),
        el('p', { class: 'safe-note' }, [
          `Patch-up at ${ECONOMY.hullRepairPerPoint} Alloy per point. ` +
            'Cards, modules and card removal arrive with the shop at M4.',
        ]),
        el('div', { class: 'safe-options' }, [
          option(
            'Patch up',
            affordable === 0
              ? missing === 0
                ? 'Nothing to repair.'
                : 'Not enough Alloy.'
              : `Repair ${affordable} for ${affordable * ECONOMY.hullRepairPerPoint} Alloy.`,
            `You are down ${missing}.`,
            affordable === 0,
            () => store.dispatch({ kind: 'stationRepair', amount: affordable }),
          ),
        ]),
      button('Leave', { class: 'btn btn-primary' }, () => store.dispatch({ kind: 'leaveNode' })),
    ]);
  });
}
