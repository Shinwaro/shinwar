/* The Safe Planet, and the Station.
 *
 * The Safe Planet is a menu and never a bare heal button — "heal or upgrade"
 * is one of the best decisions Slay the Spire makes and it costs nothing to
 * implement. You get exactly one of the four.
 *
 * Forge and Strip are two-step: pick a card, see exactly what you are about to
 * do to it, then confirm. Hover would have been cheaper, but a hover-only
 * preview is no preview at all on a phone, and the two-step matches how cards
 * are played in combat. On desktop, hover previews as well.
 *
 * The Station sells hull repair. Cards, modules and the card-removal counter
 * arrive at M4 with the shop proper.
 */

import type { CardDef, CardInstance, GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { describeCard, describeCost } from '../../engine/combat/describe.ts';
import { ECONOMY, RARITY_LABEL } from '../../content/balance.ts';
import { cards as cardTable } from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderCardFace } from '../components/card.ts';

type Picker = 'upgrade' | 'remove';

interface Local {
  picker: Picker | null;
  /** The card being considered, not yet committed. */
  chosen: string | null;
  /** Desktop hover, which previews without choosing. */
  hovered: string | null;
}

export function renderSafePlanet(store: Store): HTMLElement {
  // Which menu is open and which card is under consideration are UI state, not
  // decisions — they change nothing about the world, so they live here.
  const local: Local = { picker: null, chosen: null, hovered: null };
  let host: HTMLElement | null = null;

  const redraw = (): void => {
    const rebuilt = build(store, store.getState(), local, redraw);
    if (rebuilt !== null) host?.replaceChildren(rebuilt);
  };

  host = liveScreen(store, 'safe screen', (state) => {
    if (state.run === null || state.run.screen !== 'safe') return null;
    return build(store, state, local, redraw);
  });
  return host;
}

function build(store: Store, state: GameState, local: Local, redraw: () => void): HTMLElement | null {
  if (state.run === null || state.run.screen !== 'safe') return null;
  const run = requireRun(state);

  if (local.picker !== null) return buildPicker(store, state, local, redraw);

  const healAmount = Math.floor(run.pilot.maxHealth * ECONOMY.safePlanetHealPct);
  const missing = run.pilot.maxHealth - run.pilot.health;
  const allUpgraded = run.pilot.deck.every((card) => card.upgraded);

  const openPicker = (picker: Picker): void => {
    local.picker = picker;
    local.chosen = null;
    local.hovered = null;
    redraw();
  };

  return el('div', { class: 'safe-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, ['Safe Planet']),
    el('p', { class: 'safe-note' }, ['Choose one. The rest of the system will still be here.']),
    el('div', { class: 'safe-options' }, [
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
        allUpgraded ? 'Every card is already forged.' : 'You will see the result before you commit.',
        allUpgraded,
        () => openPicker('upgrade'),
      ),
      option(
        'Strip',
        'Remove one card from the deck.',
        'A smaller deck draws what it needs more often.',
        run.pilot.deck.length <= 1,
        () => openPicker('remove'),
      ),
      run.crash === null
        ? null
        : option(
            'Repair the drive',
            `${run.crash.repairCost} Alloy to fly again.`,
            run.alloy < run.crash.repairCost ? 'Not enough Alloy yet.' : 'Space nodes reopen.',
            run.alloy < run.crash.repairCost,
            () => store.dispatch({ kind: 'repairDrive' }),
          ),
      option(
        'Bleed',
        `Trade ${ECONOMY.refuelHullCost} health for ${ECONOMY.refuelAlloyGain} Alloy.`,
        run.pilot.health <= ECONOMY.refuelHullCost
          ? 'Not enough left to spare.'
          : 'Alloy buys both paths.',
        run.pilot.health <= ECONOMY.refuelHullCost,
        () => store.dispatch({ kind: 'safePlanetTrade' }),
      ),
    ]),
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

/* ---------- picking a card ---------- */

function buildPicker(store: Store, state: GameState, local: Local, redraw: () => void): HTMLElement {
  const run = requireRun(state);
  const forging = local.picker === 'upgrade';

  const eligible = run.pilot.deck.filter((card) => (forging ? !card.upgraded : true));
  const previewUid = local.chosen ?? local.hovered;
  const preview = eligible.find((card) => card.uid === previewUid) ?? null;

  const list = el(
    'div',
    { class: 'deck-list' },
    run.pilot.deck.map((card) => renderPickable(card, local, forging, redraw)),
  );

  return el('div', { class: 'safe-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, [forging ? 'Forge a card' : 'Strip a card']),
    el('p', { class: 'safe-note' }, [
      forging
        ? 'Pick a card to see what it becomes. Nothing is spent until you confirm.'
        : 'Removal is the anti-bloat valve. One card, free, here.',
    ]),
    preview === null
      ? el('p', { class: 'forge-empty' }, [
          forging ? 'Pick a card to preview the forge.' : 'Pick a card to strip.',
        ])
      : renderPreview(state, preview, forging),
    el('div', { class: 'picker-actions' }, [
      button('Back', { class: 'btn' }, () => {
        local.picker = null;
        local.chosen = null;
        local.hovered = null;
        redraw();
      }),
      preview === null || local.chosen === null
        ? null
        : button(
            forging ? `Forge ${definitionOf(preview).name}` : `Strip ${definitionOf(preview).name}`,
            { class: 'btn btn-primary' },
            () => {
              const uid = preview.uid;
              local.picker = null;
              local.chosen = null;
              local.hovered = null;
              store.dispatch(
                forging
                  ? { kind: 'safePlanetUpgrade', cardUid: uid }
                  : { kind: 'safePlanetRemove', cardUid: uid },
              );
            },
          ),
    ]),
    list,
  ]);
}

function renderPickable(
  card: CardInstance,
  local: Local,
  forging: boolean,
  redraw: () => void,
): HTMLElement {
  const def = definitionOf(card);
  const disabled = forging && card.upgraded;
  const chosen = local.chosen === card.uid;

  const node = button(
    '',
    {
      class: `card card--pick card--${def.type}${disabled ? ' is-unplayable' : ''}${chosen ? ' is-selected' : ''}`,
      'data-rarity': def.rarity,
      disabled,
      'aria-pressed': chosen ? 'true' : 'false',
    },
    () => {
      local.chosen = chosen ? null : card.uid;
      redraw();
    },
  );

  node.replaceChildren(
    el('div', { class: 'card-head' }, [
      el('span', { class: 'card-cost' }, [describeCost(def)]),
      el('span', { class: 'card-name' }, [def.name]),
    ]),
    el('p', { class: 'card-text' }, [describeCard(def)]),
  );

  // Desktop gets a preview without committing; touch and keyboard get it from
  // the two-step, which is why the preview is never hover-only.
  const hover = (on: boolean): void => {
    const next = on ? card.uid : null;
    if (local.hovered === next || disabled) return;
    local.hovered = next;
    if (local.chosen === null) redraw();
  };
  node.addEventListener('pointerenter', () => hover(true));
  node.addEventListener('pointerleave', () => hover(false));
  node.addEventListener('focus', () => hover(true));
  node.addEventListener('blur', () => hover(false));

  return node;
}

/** Before and after, side by side, with everything that changed marked. */
function renderPreview(state: GameState, card: CardInstance, forging: boolean): HTMLElement {
  const base = definitionOf(card);

  if (!forging) {
    return el('div', { class: 'forge-preview forge-preview--strip' }, [
      renderCardFace(base, {
        state,
        badge: RARITY_LABEL[base.rarity],
        changedVs: null,
        extraClass: 'is-leaving',
      }),
      el('p', { class: 'forge-note' }, ['This leaves the deck for the rest of the run.']),
    ]);
  }

  const upgraded: CardDef = upgradedDef(card);

  return el('div', { class: 'forge-preview' }, [
    renderCardFace(base, { state, badge: 'NOW', changedVs: null, extraClass: null }),
    el('span', { class: 'forge-arrow', 'aria-hidden': 'true' }, ['→']),
    renderCardFace(upgraded, {
      state,
      badge: 'FORGED',
      changedVs: base,
      extraClass: 'is-upgraded',
    }),
  ]);
}

function upgradedDef(card: CardInstance): CardDef {
  const base = cardTable.get(card.defId);
  return { ...base, ...base.upgrade };
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
