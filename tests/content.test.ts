/* Content validation.
 *
 * The registry is what makes "adding a card is one file edit" true, so this
 * suite is the thing that catches a card that references a card that does not
 * exist, an event with no way out, or a thread pool that has quietly drifted
 * punitive. It is nearly empty of content at M0 and grows with the pools.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { CardDef, EventDef, EventOption, ThreadDef } from '../src/engine/types.ts';
import {
  cards,
  clearAllContent,
  contentCounts,
  events,
  threads,
  validateContent,
} from '../src/content/registry.ts';
import { loadContent, reloadContent } from '../src/content/index.ts';
import { CLEAR_SPACE_ID, ENVIRONMENTS } from '../src/content/environments.ts';
import { DEPTH_RULES, MAX_DEPTH, STANCES, THREADS } from '../src/content/balance.ts';

function card(id: string, overrides: Partial<CardDef> = {}): CardDef {
  return {
    id,
    name: id,
    type: 'attack',
    rarity: 'common',
    archetype: 'neutral',
    cost: 1,
    effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
    upgrade: { effects: [{ op: 'damage', amount: 9, target: 'enemy' }] },
    ...overrides,
  };
}

function event(id: string, options: EventDef['options']): EventDef {
  return { id, name: id, body: 'A specific, named situation.', options };
}

function option(id: string, overrides: Partial<EventOption> = {}): EventOption {
  return {
    id,
    label: id,
    detail: 'What it looks like from here.',
    effects: [{ op: 'alloy', amount: 10 }],
    risk: 'Economic',
    payoff: 'Immediate',
    ...overrides,
  };
}

const REAL_OPTIONS: EventDef['options'] = [
  // One of the three defers into a Thread — the validator insists on it.
  option('power', { effects: [{ op: 'setThread', threadId: 'p1' }] }),
  option('money'),
  option('safety'),
];

const LEAVE: EventOption = option('leave', { label: 'Leave them', effects: [], isLeave: true });

beforeEach(() => {
  clearAllContent();
});

describe('the shipped pools', () => {
  it('validate clean', () => {
    reloadContent();
    expect(validateContent()).toEqual([]);
  });

  it('load once and stay loaded', () => {
    reloadContent();
    const before = contentCounts();
    loadContent();
    expect(contentCounts()).toEqual(before);
  });

  it('include Clear Space, because Act 1 node 1 is always a normal fight in it', () => {
    reloadContent();
    expect(ENVIRONMENTS.some((environment) => environment.id === CLEAR_SPACE_ID)).toBe(true);
  });
});

describe('the registry', () => {
  it('hands definitions back sorted by id, never in registration order', () => {
    cards.register([card('zeta'), card('alpha'), card('mu')]);
    expect(cards.all().map((entry) => entry.id)).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('refuses a duplicate id', () => {
    cards.register([card('twin')]);
    expect(() => cards.register([card('twin')])).toThrow(/duplicate card id/);
  });

  it('throws on an unknown id rather than handing back undefined', () => {
    expect(() => cards.get('ghost')).toThrow(/no card with id/);
    expect(cards.find('ghost')).toBeUndefined();
  });
});

describe('card validation', () => {
  it('demands an upgrade that changes something', () => {
    cards.register([card('flat', { upgrade: {} })]);
    expect(validateContent()).toContainEqual({
      where: "card 'flat'",
      problem: '`upgrade` is empty — it must change something',
    });
  });

  it('rejects a card that does nothing', () => {
    cards.register([card('inert', { effects: [] })]);
    expect(validateContent().map((issue) => issue.problem)).toContain(
      'no effects and no stance rider — the card does nothing',
    );
  });

  it('catches a reference to a card that does not exist', () => {
    cards.register([
      card('summoner', { effects: [{ op: 'addCardToHand', cardId: 'not_a_card' }] }),
    ]);
    expect(validateContent()).toContainEqual({
      where: "card 'summoner'",
      problem: "references unknown card 'not_a_card'",
    });
  });

  it('walks into conditionals and scaling to find those references', () => {
    cards.register([
      card('nested', {
        effects: [
          {
            op: 'conditional',
            when: { kind: 'stanceIs', stance: 'iai' },
            then: [{ op: 'scaleWith', source: 'currentHeat', per: 1, then: [{ op: 'addCardToHand', cardId: 'ghost' }] }],
            else: [{ op: 'addCardToHand', cardId: 'phantom' }],
          },
        ],
      }),
    ]);
    const problems = validateContent().map((issue) => issue.problem);
    expect(problems).toContain("references unknown card 'ghost'");
    expect(problems).toContain("references unknown card 'phantom'");
  });

  it('rejects a rider on a stance that is not in rotation', () => {
    cards.register([
      card('dormant', { stanceRider: { stance: 'flow', effects: [{ op: 'block', amount: 3 }] } }),
    ]);
    expect(validateContent()).toContainEqual({
      where: "card 'dormant'",
      problem: "rider needs stance 'flow', which is not in rotation",
    });
  });

  it('rejects a card that sets or tests a retired stance', () => {
    cards.register([
      card('setter', { effects: [{ op: 'setStance', stance: 'flow' }] }),
      card('tester', {
        effects: [
          {
            op: 'conditional',
            when: { kind: 'stanceIs', stance: 'flow' },
            then: [{ op: 'block', amount: 4 }],
          },
        ],
      }),
    ]);
    const problems = validateContent().map((issue) => issue.problem);
    expect(problems).toContain("sets stance 'flow', which is not in rotation");
    expect(problems).toContain("tests for stance 'flow', which is not in rotation");
  });

  it('accepts a reference that resolves', () => {
    cards.register([card('wound'), card('summoner', { effects: [{ op: 'addCardToHand', cardId: 'wound' }] })]);
    expect(validateContent()).toEqual([]);
  });
});

function thread(id: string, tone: ThreadDef['tone']): ThreadDef {
  return {
    id,
    name: id,
    description: 'It will matter later.',
    tone,
    omen: 'Something is coming.',
    trigger: { kind: 'nodes', count: 4 },
    payoff: [{ op: 'alloy', amount: 50 }],
  };
}

describe('event validation', () => {
  // The options below open Threads, so the pool has to exist and has to be in
  // tone balance or the thread checks drown out what these tests are asserting.
  beforeEach(() => {
    threads.register([thread('p1', 'positive'), thread('m1', 'mixed'), thread('c1', 'costly')]);
  });

  it('accepts three real options plus a leave', () => {
    events.register([event('good', [...REAL_OPTIONS, LEAVE])]);
    expect(validateContent()).toEqual([]);
  });

  it('rejects too few real options', () => {
    events.register([event('thin', [REAL_OPTIONS[0]!, REAL_OPTIONS[1]!, LEAVE])]);
    expect(validateContent()).toContainEqual({
      where: "event 'thin'",
      problem: '2 real options, needs at least 3',
    });
  });

  it('demands exactly one always-available leave', () => {
    events.register([event('trapped', REAL_OPTIONS)]);
    expect(validateContent()).toContainEqual({
      where: "event 'trapped'",
      problem: '0 "leave" options, needs exactly 1',
    });
  });

  it('refuses to let "leave" pay anything', () => {
    const paid = option('leave', { effects: [{ op: 'alloy', amount: 5 }], isLeave: true });
    events.register([event('bribed', [...REAL_OPTIONS, paid])]);
    expect(validateContent()).toContainEqual({
      where: "event 'bribed'",
      problem: '"leave" has effects — it must be genuinely worthless',
    });
  });

  it('demands that something on the screen defers its consequence', () => {
    events.register([event('flat', [option('a'), option('b'), option('c'), LEAVE])]);
    expect(validateContent()).toContainEqual({
      where: "event 'flat'",
      problem: 'no option opens a Thread',
    });
  });

  it('catches a run effect naming a card that does not exist', () => {
    events.register([
      event('ghostly', [
        ...REAL_OPTIONS,
        option('gift', { effects: [{ op: 'card', cardId: 'not_a_card' }] }),
        LEAVE,
      ]),
    ]);
    expect(validateContent()).toContainEqual({
      where: "event 'ghostly' option 'gift'",
      problem: "references unknown card 'not_a_card'",
    });
  });
});

describe('thread validation', () => {

  it('accepts a pool near the target mix', () => {
    // 3 positive / 4 mixed / 3 costly — exactly 30/40/30.
    threads.register([
      thread('p1', 'positive'),
      thread('p2', 'positive'),
      thread('p3', 'positive'),
      thread('m1', 'mixed'),
      thread('m2', 'mixed'),
      thread('m3', 'mixed'),
      thread('m4', 'mixed'),
      thread('c1', 'costly'),
      thread('c2', 'costly'),
      thread('c3', 'costly'),
    ]);
    expect(validateContent()).toEqual([]);
  });

  it('catches a pool drifting punitive', () => {
    threads.register([
      thread('c1', 'costly'),
      thread('c2', 'costly'),
      thread('c3', 'costly'),
      thread('c4', 'costly'),
      thread('m1', 'mixed'),
    ]);
    const problems = validateContent().filter((issue) => issue.where === 'thread pool');
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((issue) => issue.problem.startsWith('costly'))).toBe(true);
  });

  it('demands a description, because the Manifest shows it', () => {
    threads.register([thread('silent', 'mixed'), { ...thread('quiet', 'mixed'), description: '  ' }]);
    expect(validateContent()).toContainEqual({
      where: "thread 'quiet'",
      problem: 'blank description — the Manifest shows this',
    });
  });

  it('demands an omen, because the category is the part the player is owed', () => {
    threads.register([{ ...thread('blind', 'mixed'), omen: '' }]);
    expect(validateContent()).toContainEqual({
      where: "thread 'blind'",
      problem: 'blank omen — the player is owed the category',
    });
  });

  it('rejects a payoff that resolves into nothing', () => {
    threads.register([{ ...thread('hollow', 'mixed'), payoff: [] }]);
    expect(validateContent()).toContainEqual({
      where: "thread 'hollow'",
      problem: 'no payoff — a Thread that resolves into nothing is a lie',
    });
  });

  it('targets a mix that sums to 1', () => {
    const sum = THREADS.toneMix.positive + THREADS.toneMix.mixed + THREADS.toneMix.costly;
    expect(sum).toBeCloseTo(1);
  });
});

describe('balance data', () => {
  it('names all three stances with plain-words text', () => {
    for (const stance of ['iai', 'guard', 'flow'] as const) {
      expect(STANCES[stance].id).toBe(stance);
      expect(STANCES[stance].text.trim()).not.toBe('');
    }
  });

  it('has one depth rule slot per rung of the ladder', () => {
    expect(DEPTH_RULES).toHaveLength(MAX_DEPTH);
    expect(DEPTH_RULES.map((rule) => rule.depth)).toEqual(
      Array.from({ length: MAX_DEPTH }, (_, i) => i + 1),
    );
  });
});
