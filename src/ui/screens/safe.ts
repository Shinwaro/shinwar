/* The Safe Planet.
 *
 * A menu, never a bare heal button — "heal or upgrade" is one of the best
 * decisions Slay the Spire makes and it costs nothing to implement. You get
 * exactly one of the four.
 *
 * Forge and Strip are two-step: pick a card, see exactly what you are about to
 * do to it, then confirm. Hover would have been cheaper, but a hover-only
 * preview is no preview at all on a phone, and the two-step matches how cards
 * are played in combat. On desktop, hover previews as well.
 *
 * The Station is its own screen — see `station.ts`.
 */

import type { CardDef, CardInstance, GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { describeCard, describeCost } from '../../engine/combat/describe.ts';
import { ECONOMY, RARITY_LABEL } from '../../content/balance.ts';
import { cards as cardTable } from '../../content/registry.ts';
import { button, el, onHoverOrFocus } from '../dom.ts';
import { play } from '../sound.ts';
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
        allUpgraded ? 'Every card is already upgraded.' : 'You will see the result before you commit.',
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
      option(
        'Bleed',
        `Trade ${ECONOMY.refuelHullCost} health for ${ECONOMY.refuelAlloyGain} Alloy.`,
        run.pilot.health <= ECONOMY.refuelHullCost
          ? 'Not enough left to spare.'
          : 'Alloy buys cards and Masteries.',
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
    el('h1', { class: 'screen-title' }, [forging ? 'Upgrade a card' : 'Strip a card']),
    el('p', { class: 'safe-note' }, [
      forging
        ? 'Pick a card to see what it becomes. Nothing is spent until you confirm.'
        : 'Removal is the anti-bloat valve. One card, free, here.',
    ]),
    /* Same frame whether or not a card is picked — see the note in
       `station.ts`. An empty state that is a bare paragraph is a different
       height from the preview it is standing in for, and the list below moves
       every time you change your mind. */
    preview === null
      ? el('div', { class: 'forge-preview forge-preview--empty' }, [
          el('p', { class: 'forge-empty' }, [
            forging ? 'Pick a card to see what it upgrades into.' : 'Pick a card to strip.',
          ]),
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
            forging ? `Upgrade ${definitionOf(preview).name}` : `Strip ${definitionOf(preview).name}`,
            { class: 'btn btn-primary', 'data-sound': 'own' },
            () => {
              const uid = preview.uid;
              local.picker = null;
              local.chosen = null;
              local.hovered = null;
              if (forging) play('upgrade');
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
      // Same gesture as aiming a card in a fight: something picked up, the game
      // waiting on you. Confirming has its own sound.
      if (!chosen) play('target');
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
  // Mouse only. A finger's `pointerenter` lands on finger-DOWN, and this hover
  // redraws — which destroys the node before the tap can become a click.
  onHoverOrFocus(node, hover);

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

