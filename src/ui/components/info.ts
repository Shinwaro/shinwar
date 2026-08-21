/* The reference panels. What the game means, on demand.
 *
 * An hour-long run with no saves cannot afford a tutorial, and it cannot
 * afford a player who is three acts in and still guessing what a violet star
 * is. These are the compromise: nothing is explained at you, and everything is
 * one click away from the screen it applies to.
 *
 * A side panel rather than a modal, because the point is to read it *against*
 * the thing it describes. A modal that covers the chart while explaining the
 * chart is a worse manual than the chart was a puzzle.
 *
 * Everything numeric in here is read from `balance.ts` rather than typed out.
 * A reference page that drifts from the game is worse than no reference page,
 * because the player now has a wrong thing they trust.
 */

import { HEAT, FOCUS_MAX, PLAYER, STANCES } from '../../content/balance.ts';
import { statuses as statusTable } from '../../content/registry.ts';
import { button, el } from '../dom.ts';

export interface InfoEntry {
  /** A colour swatch, when the thing being named is a colour. */
  readonly swatch?: string;
  readonly term: string;
  readonly text: string;
}

export interface InfoSection {
  readonly heading: string;
  readonly entries: readonly InfoEntry[];
}

/**
 * The panel itself. `onClose` is wired to the backdrop, the button and Esc by
 * the screen that owns it — this only draws.
 */
export function renderInfoPanel(
  title: string,
  sections: readonly InfoSection[],
  onClose: () => void,
): HTMLElement {
  const host = el('div', {
    class: 'info-backdrop',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
  });

  host.addEventListener('click', (event) => {
    if (event.target === host) onClose();
  });

  /* Esc closes, and the key never reaches the shell's pause handler — without
     the stop, dismissing the panel would open the pause screen behind it. */
  host.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    onClose();
  });

  const close = button('Close', { class: 'btn btn-quiet info-close' }, onClose);

  host.append(
    el('aside', { class: 'info-panel', tabindex: '-1' }, [
      el('header', { class: 'info-head' }, [
        el('h2', { class: 'info-title' }, [title]),
        close,
      ]),
      el(
        'div',
        { class: 'info-body' },
        sections.map((section) =>
          el('section', { class: 'info-section' }, [
            el('h3', { class: 'info-heading' }, [section.heading]),
            el(
              'dl',
              { class: 'info-list' },
              section.entries.flatMap((entry) => [
                el('dt', { class: 'info-term' }, [
                  entry.swatch === undefined
                    ? null
                    : el('span', {
                        class: 'info-swatch',
                        style: `background:${entry.swatch}`,
                        'aria-hidden': 'true',
                      }),
                  entry.term,
                ]),
                el('dd', { class: 'info-text' }, [entry.text]),
              ]),
            ),
          ]),
        ),
      ),
    ]),
  );

  /* Focus lands inside the dialog, so the keyboard is where the reader is and
     Esc has something to fire on.

     Retried rather than done once next frame: every screen in this app builds
     its tree DETACHED and appends it afterwards, so a single rAF fires while
     the panel is still out of the document and a bare `isConnected` guard just
     drops the focus on the floor silently. That is the same detached-render
     trap that cost a day on the map scroll — bounded here so it cannot spin. */
  let attempts = 0;
  const land = (): void => {
    attempts += 1;
    if (host.isConnected) close.focus({ preventScroll: true });
    // Retry until focus is actually INSIDE the panel, not merely until the
    // node is connected. Two other things move focus around this moment — the
    // screen re-render destroys the button that was clicked, and the shell
    // focuses the screen root — so "I called focus once" is not the same as
    // "the reader's keyboard is in the dialog". Bounded so it cannot spin.
    if (attempts < 8 && !host.contains(document.activeElement)) {
      requestAnimationFrame(land);
    }
  };
  requestAnimationFrame(land);

  return host;
}

/* ---------- the chart ----------
   Swatches match `.star--*` in game.css. They are duplicated here rather than
   read from the stylesheet because a legend that cannot be read without a
   layout pass is a legend that flickers. If a star colour changes, this is the
   second place to change it — and the only one. */

export const MAP_INFO: readonly InfoSection[] = [
  {
    heading: 'What the stars are',
    entries: [
      { swatch: '#dfe7f5', term: 'Combat', text: 'A fight. The badge names the enemies and the environment before you commit.' },
      { swatch: '#e0564d', term: 'Elite', text: 'A harder fight that drops a relic. The only early source of one, and worth routing for.' },
      { swatch: '#f0a13c', term: 'Boss', text: 'The end of the act. Every route funnels into it. It pays a relic and raises your maximum health.' },
      { swatch: '#6ba8e8', term: 'Station', text: 'Cards, a card removal, one forge, one repair, and the implant shelf. What Alloy is for.' },
      { swatch: '#8fd6a8', term: 'Safe Planet', text: 'Heal, forge a card, or remove one — you pick one. Nothing here wants anything from you.' },
      { swatch: '#b79ae0', term: 'Anomaly', text: 'A situation with three or four answers and a way to walk off. Some of them defer their consequence into a Thread.' },
      { swatch: '#e8c87c', term: 'Unknown', text: 'The scan is inconclusive. It resolves into one of the others when you set down.' },
    ],
  },
  {
    heading: 'Reading the route',
    entries: [
      { term: 'You choose forward, never back', text: 'A route is a commitment. Lines only run up the chart, so what you skip is skipped for the act.' },
      { term: 'The Wavefront', text: 'From Act 2, the collapse front follows you up the chart. A Station or a Safe Planet costs two rows of lead instead of one — the detour is priced.' },
      { term: 'The Reliquary', text: 'Halfway through Act 2, a full row of your own order’s vault. Every route crosses it, and it is the only place a legendary card comes from.' },
      { term: 'Carrying', text: 'The Manifest under the chart lists the Threads you are holding. Each one comes due later in the same run, always.' },
    ],
  },
];

/* ---------- the fight ---------- */

function statusEntries(): readonly InfoEntry[] {
  // Generated, so a retuned status cannot leave a stale sentence behind here.
  return statusTable.all().map((def) => ({ term: def.name, text: def.text }));
}

export function combatInfo(): readonly InfoSection[] {
  const iai = STANCES.iai;
  const guard = STANCES.guard;
  const flow = STANCES.flow;

  return [
    {
      heading: 'The turn',
      entries: [
        {
          term: 'Energy',
          text: `You get ${PLAYER.energyPerTurn} a turn and it does not carry over. Every card costs some, and the whole game is what you spend it on.`,
        },
        {
          term: 'Block',
          text: 'Absorbs damage before it reaches your health, and is gone at the start of your turn — except what GUARD retains. Block you did not need was wasted; block you needed and skipped is health.',
        },
        {
          term: 'Intents',
          text: 'What each enemy will do next, committed before you act and never re-rolled. The numbers update if you change something, so what is shown is always what will land.',
        },
        {
          term: 'Draw and discard',
          text: `You draw ${PLAYER.drawPerTurn} at the start of each turn. When the draw pile empties, the discard is shuffled back in. Exhausted cards do not come back this fight.`,
        },
      ],
    },
    {
      heading: 'Heat',
      entries: [
        {
          term: 'The gauge',
          text: `Runs 0 to ${HEAT.max}. Cards that hit hardest add to it, and venting takes it back down.`,
        },
        {
          term: `Overheat at ${HEAT.overheatAt}`,
          text: `End your turn at ${HEAT.overheatAt} or above and the reactor bites: damage, and one less Energy next turn.`,
        },
        {
          term: `${HEAT.criticalAt} ends the turn`,
          text: `Reaching ${HEAT.criticalAt} does not wait for you to finish — the turn ends immediately, the reactor takes the next one, and a card burns away. The gauge blows back to zero with it.`,
        },
      ],
    },
    {
      heading: 'Stance',
      entries: [
        { term: iai.name, text: iai.text },
        { term: guard.name, text: guard.text },
        { term: flow.name, text: flow.text },
        {
          term: 'Focus',
          text: `Up to ${FOCUS_MAX} stacks. One is spent per card, and the stance decides what it becomes — damage in ${iai.name}, Block in ${guard.name}.`,
        },
      ],
    },
    {
      heading: 'Statuses',
      entries: statusEntries(),
    },
  ];
}
