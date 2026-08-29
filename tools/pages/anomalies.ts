/* The Anomaly Ledger — every event, every option, and what each one costs.
 *
 * The two economy tables at the bottom are the reason this page exists. An
 * event that sells health for alloy and one that buys it back are only fair
 * relative to each other, and that comparison is invisible while the events
 * live in thirty separate files. Here the rates sit in one column.
 */

import type { Pools } from '../dump.ts';
import { by, esc, fill } from './html.ts';

const TONE: Record<string, string> = { positive: 'pos', mixed: 'mix', costly: 'cost' };

type Trade = {
  event: string;
  label: string;
  alloy: number;
  health: number;
  rate: number;
};

export function buildAnomalies(pools: Pools, template: string): string {
  const threads = new Map(pools.threads.map((thread) => [thread.id, thread]));

  /* By NAME, which is the only order that helps someone scanning the index.
     The registry hands these over sorted by id — deliberately, because that is
     what makes a run reproducible — but an id-sorted list of display names
     reads as no order at all. The economy tables below inherit this order too,
     so ties in the rate column break the same way the page is laid out. */
  const all = [...pools.events].sort(by((event) => event.name));

  /* A trade in either direction. `sells` give alloy for health, `buys` give it
     back — the ratio between the two rates is the number to watch, because an
     event pair you can round-trip at a profit is an infinite alloy machine. */
  const sells: Trade[] = [];
  const buys: Trade[] = [];
  for (const event of all) {
    for (const option of event.options) {
      if (option.alloy > 0 && option.health < 0) {
        sells.push({
          event: event.name,
          label: option.label,
          alloy: option.alloy,
          health: -option.health,
          rate: option.alloy / -option.health,
        });
      }
      if (option.alloy < 0 && option.health > 0) {
        buys.push({
          event: event.name,
          label: option.label,
          alloy: -option.alloy,
          health: option.health,
          rate: -option.alloy / option.health,
        });
      }
    }
  }
  const mean = (trades: readonly Trade[]): number =>
    trades.length === 0 ? 0 : trades.reduce((sum, t) => sum + t.rate, 0) / trades.length;
  const sellRate = mean(sells);
  const buyRate = mean(buys);

  const used = new Map<string, number>();
  for (const event of all) {
    for (const option of event.options) {
      for (const id of option.threads) used.set(id, (used.get(id) ?? 0) + 1);
    }
  }

  const threadChip = (id: string): string => {
    const thread = threads.get(id);
    if (thread === undefined) return '';
    return (
      `<a class="chip chip--${TONE[thread.tone] ?? 'mix'}" href="#t-${id}">${esc(thread.name)}` +
      `<span class="chip-when">n+${thread.after}</span></a>` +
      `<div class="later"><span class="later-k">then</span> ${esc(thread.payoff)}</div>`
    );
  };

  const cardBlock = (card: { rarity: string; cost: string; name: string; text: string }): string =>
    `<div class="card-inline" data-rarity="${card.rarity}">` +
    `<span class="ci-cost">${esc(card.cost)}</span>` +
    `<span class="ci-name">${esc(card.name)}</span>` +
    `<span class="ci-rar">${esc(card.rarity)}</span>` +
    `<span class="ci-text">${esc(card.text)}</span></div>`;

  const events = all
    .map((event) => {
      const options = event.options
        .map((option) => {
          const cls = option.isLeave ? ' class="is-leave"' : '';
          const now =
            option.effects === '' ? '<span class="nothing">nothing</span>' : esc(option.effects);
          const later = option.threads.map(threadChip).join('');
          const cards = option.cards.map(cardBlock).join('');
          return (
            `<tr${cls}>` +
            `<td class="c-opt"><span class="opt-label">${esc(option.label)}</span>` +
            `<span class="opt-detail">${esc(option.detail)}</span></td>` +
            `<td class="c-now">${now}</td>` +
            `<td class="c-later">${later || "<span class='nothing'>—</span>"}</td>` +
            `<td class="c-card">${cards || "<span class='nothing'>—</span>"}</td>` +
            `<td class="c-tag"><span class="tag">${esc(option.risk)}</span>` +
            `<span class="tag tag--q">${esc(option.payoff)}</span></td>` +
            `</tr>`
          );
        })
        .join('');
      return (
        `<section class="ev" id="e-${event.id}">` +
        `<h3 class="ev-name">${esc(event.name)}</h3>` +
        `<p class="ev-body">${esc(event.body)}</p>` +
        `<div class="scroll"><table class="opts">` +
        `<thead><tr><th>Option</th><th>Now</th><th>Later</th><th>Card</th><th>Stated as</th></tr></thead>` +
        `<tbody>${options}</tbody></table></div>` +
        `</section>`
      );
    })
    .join('');

  const threadRows = pools.threads
    .map(
      (thread) =>
        `<tr id="t-${thread.id}">` +
        `<td><span class="chip chip--${TONE[thread.tone] ?? 'mix'}">${esc(thread.name)}</span></td>` +
        `<td class="mono">${thread.after}</td>` +
        `<td>${esc(thread.payoff)}</td>` +
        `<td class="mono">${used.get(thread.id) ?? 0}</td>` +
        `<td class="dim">${esc(thread.omen)}</td></tr>`,
    )
    .join('');

  const tradeRows = (trades: readonly Trade[]): string =>
    [...trades]
      .sort((a, b) => b.rate - a.rate)
      .map(
        (trade) =>
          `<tr><td>${esc(trade.event)}</td><td>${esc(trade.label)}</td>` +
          `<td class="mono">${trade.alloy}</td><td class="mono">${trade.health}</td>` +
          `<td class="mono strong">${trade.rate.toFixed(1)}</td></tr>`,
      )
      .join('');

  return fill(template, {
    INDEX: all.map((event) => `<a href="#e-${event.id}">${esc(event.name)}</a>`).join(''),
    EVENTS: events,
    THREADS: threadRows,
    SELLS: tradeRows(sells),
    BUYS: tradeRows(buys),
    SELLRATE: sellRate.toFixed(1),
    BUYRATE: buyRate.toFixed(1),
    RATIO: (sellRate / buyRate).toFixed(1),
    NEVENTS: pools.events.length,
    NOPTS: pools.events.reduce((sum, e) => sum + e.options.length, 0),
    NTHREADS: pools.threads.length,
  });
}
