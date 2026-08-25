/* The title screen.
 *
 * The wordmark over the asteroid, a seed you can read and type, and the Depth
 * selector. Both settings live in `GameState.title` and go through the reducer
 * — the screen holds no game state of its own.
 *
 * The seed field is not decoration. With no saves, a copyable, re-enterable
 * seed is one of the two mitigations that make that rule liveable: it is a
 * number you can write down, and it is how a bug gets reported.
 */

import type { Store } from '../store.ts';
import { formatSeed } from '../../engine/rng.ts';
import { currentDepth, depthRules, undefinedDepthRuleCount } from '../../engine/queries.ts';
import { MAX_DEPTH } from '../../content/balance.ts';
import { button, el } from '../dom.ts';
import { createWordmark } from '../wordmark.ts';
import { unlock } from '../sound.ts';

export function newSeed(): string {
  return formatSeed(Math.random);
}

function renderDepthRules(list: HTMLElement, depth: number): void {
  const rules = depthRules(depth);

  if (rules.length === 0) {
    list.replaceChildren(
      el('li', { class: 'depth-rule depth-rule--none' }, ['Depth 0 — the baseline. No extra rules.']),
    );
    return;
  }

  const pending = undefinedDepthRuleCount(depth);
  const items = rules
    .filter((rule) => rule.text !== null)
    .map((rule) =>
      el('li', { class: 'depth-rule' }, [
        el('span', { class: 'depth-rule-n' }, [String(rule.depth)]),
        el('span', {}, [rule.text ?? '']),
      ]),
    );

  if (pending > 0) {
    items.push(
      el('li', { class: 'depth-rule depth-rule--pending' }, [
        el('span', { class: 'depth-rule-n' }, ['—']),
        el('span', {}, [`${pending} deeper ${pending === 1 ? 'rule is' : 'rules are'} not written yet (M7).`]),
      ]),
    );
  }

  list.replaceChildren(...items);
}

export function renderTitle(store: Store): HTMLElement {
  const state = store.getState();

  /* -- wordmark -- */

  const heading = el('h1', { class: 'wordmark' }, [
    el('span', { class: 'visually-hidden' }, ['Shinwar']),
    createWordmark(),
  ]);

  const tagline = el('p', { class: 'title-tag' }, [
    'A ronin of a dead orbital sect, flying a salvaged cutter through a collapsing star frontier. ',
    'Nothing is saved. A run is one sitting.',
  ]);

  /* -- seed -- */

  const seedInput = el('input', {
    id: 'seed',
    class: 'seed-input',
    type: 'text',
    value: state.title.seed,
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'characters',
    'aria-describedby': 'seed-help',
  });
  seedInput.addEventListener('input', () => {
    store.dispatch({ kind: 'setSeed', seed: seedInput.value });
  });

  const seedStatus = el('span', { class: 'seed-status', role: 'status', 'aria-live': 'polite' });

  const copyButton = button('Copy', { class: 'btn btn-quiet' }, () => {
    const seed = store.getState().title.seed;
    const clipboard = navigator.clipboard;
    if (clipboard !== undefined) {
      void clipboard.writeText(seed).then(
        () => {
          seedStatus.textContent = 'Seed copied.';
        },
        () => {
          seedInput.select();
          seedStatus.textContent = 'Selected — press Ctrl/Cmd+C.';
        },
      );
      return;
    }
    seedInput.select();
    seedStatus.textContent = 'Selected — press Ctrl/Cmd+C.';
  });

  const rerollButton = button('Reroll', { class: 'btn btn-quiet' }, () => {
    const seed = newSeed();
    seedInput.value = seed;
    store.dispatch({ kind: 'setSeed', seed });
    seedStatus.textContent = '';
  });

  const seedField = el('div', { class: 'field' }, [
    el('label', { for: 'seed', class: 'field-label' }, ['Seed']),
    el('div', { class: 'field-row' }, [seedInput, copyButton, rerollButton]),
    el('p', { id: 'seed-help', class: 'field-help' }, [
      'Same seed, same run. Write it down — it is the only thing that survives the tab closing.',
    ]),
    seedStatus,
  ]);

  /* -- depth -- */

  const depth = currentDepth(state);

  const depthValue = el('output', { class: 'depth-value', for: 'depth' }, [String(depth)]);
  const depthList = el('ul', { class: 'depth-rules' });
  renderDepthRules(depthList, depth);

  const depthInput = el('input', {
    id: 'depth',
    class: 'depth-input',
    type: 'range',
    min: '0',
    max: String(MAX_DEPTH),
    step: '1',
    value: String(depth),
    'aria-describedby': 'depth-help',
  });
  depthInput.addEventListener('input', () => {
    const next = Number(depthInput.value);
    store.dispatch({ kind: 'setDepth', depth: next });
    const applied = currentDepth(store.getState());
    depthValue.textContent = String(applied);
    renderDepthRules(depthList, applied);
  });

  const depthField = el('div', { class: 'field' }, [
    el('div', { class: 'field-head' }, [
      el('label', { for: 'depth', class: 'field-label' }, ['Depth']),
      depthValue,
    ]),
    depthInput,
    el('p', { id: 'depth-help', class: 'field-help' }, [
      'Each Depth adds one rule, never just more enemy HP.',
    ]),
    depthList,
  ]);

  /* -- go -- */

  /* The two buttons that start something are also the first gesture the page
     gets, and a browser will not let an `AudioContext` make a sound before one.
     Building it here rather than at import time is the whole of the autoplay
     dance — see `sound.ts`. */
  const begin = button('Begin run', { class: 'btn btn-primary' }, () => {
    unlock();
    store.dispatch({ kind: 'beginRun' });
  });

  /* The introduction sits beside Begin run rather than in front of it. A run
     is an hour with no saves, which is a lot to ask of somebody who does not
     know what Heat is — but making everyone walk through a tutorial they did
     not ask for is the other way to lose them. */
  const learn = el('div', { class: 'title-learn' }, [
    button('How to play', { class: 'btn' }, () => {
      unlock();
      store.dispatch({ kind: 'beginTutorial' });
    }),
    el('span', { class: 'field-help' }, ['One fight, about two minutes. Nothing at stake.']),
  ]);

  const warning = el('p', { class: 'title-warning' }, [
    'No saves, no accounts, no scores. Close the tab and the run is gone.',
  ]);

  return el('main', { class: 'title screen' }, [
    el('div', { class: 'title-inner' }, [
      el('header', { class: 'title-head' }, [heading, tagline]),
      el('div', { class: 'title-controls' }, [seedField, depthField, begin, learn, warning]),
    ]),
  ]);
}
