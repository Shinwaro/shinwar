/* Generated rules text, and the starting deck.
 *
 * The point of `describeCard` is that text cannot drift from behaviour, so
 * these tests assert the text is derived — change a number in the card data
 * and the string changes with it, with nobody editing a second place.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { CardDef, EffectOp } from '../src/engine/types.ts';
import { describeCard, describeRider, riderIsLive } from '../src/engine/combat/describe.ts';
import { definitionOf, playCard, startPlayerTurn } from '../src/engine/combat/combat.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import { makeFight, combatOf, firstEnemy } from './helpers.ts';
import type { GameState } from '../src/engine/types.ts';
import { JETTISON } from '../src/content/cards/discard.ts';
import { STILLWATER_GUARD } from '../src/content/cards/focus.ts';
import { SCALD, STRENGTH } from '../src/content/statuses.ts';
import { cardVoice } from '../src/ui/card-voice.ts';
import { statuses as statusTable } from '../src/content/registry.ts';
import {
  FANNED_CUT,
  IAI_SLASH,
  SEVER,
  SOLAR_PARRY,
  STARTING_DECK,
  VECTOR_STEP,
} from '../src/content/cards/basic.ts';
import { PLAYER, RARITY_WEIGHTS } from '../src/content/balance.ts';
import type { Rarity } from '../src/engine/types.ts';
import { RARITY_ORDER } from '../src/engine/types.ts';
import { offerableCards, rollCardChoices } from '../src/engine/run/rewards.ts';

beforeEach(() => {
  reloadContent();
});

function def(id: string): CardDef {
  return cardTable.get(id);
}

describe('the starting deck', () => {
  it('is twelve cards, and two of them are not attacks or blocks', () => {
    expect(STARTING_DECK).toHaveLength(PLAYER.startingDeckSize);
    const counts = STARTING_DECK.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts[IAI_SLASH]).toBe(3);
    expect(counts[SOLAR_PARRY]).toBe(3);
    expect(counts[VECTOR_STEP]).toBe(2);
    expect(counts[SEVER]).toBe(1);
    // One AoE from the start: the opening deck had no answer to two enemies at
    // all, so the first pack fight was five single-target swings at two health
    // bars and "hit the same one twice" is not a decision.
    expect(counts[FANNED_CUT]).toBe(1);

    /* The two that answer a different question. A deck where eleven of twelve
       cards do damage or absorb it can deal a hand of five that are four ways
       to do the thing you had already decided not to do. */
    expect(counts[JETTISON], 'a way out of a dead hand').toBe(1);
    expect(counts[STILLWATER_GUARD], 'a way off the gauge').toBe(1);
  });

  it('carries its own answer to Scald before the player meets Scald', () => {
    /* Stillwater Guard vents 2, which is exactly the threshold that sheds a
       stack. It is not a coincidence worth relying on silently — if either
       number moves, the opening deck quietly stops having a reply to a status
       that never decays. */
    const guard = cardTable.get(STILLWATER_GUARD);
    const vent = guard.effects.reduce(
      (sum, op) => sum + (op.op === 'ventHeat' ? op.amount : 0),
      0,
    );
    const sheds = statusTable.get(SCALD).shedOnVent ?? Number.POSITIVE_INFINITY;
    expect(vent).toBeGreaterThanOrEqual(sheds);
  });

  it('names only cards that exist', () => {
    for (const id of STARTING_DECK) expect(cardTable.has(id)).toBe(true);
  });

  it('has no engine in it — nothing draws more than one card', () => {
    // Act 1's "weak" beat is manufactured here. If this starts failing, the
    // opening deck has quietly grown a motor.
    for (const id of new Set(STARTING_DECK)) {
      const draws = def(id).effects.filter((op) => op.op === 'draw');
      for (const op of draws) expect(op.op === 'draw' && op.amount).toBeLessThanOrEqual(1);
    }
  });
});

describe('generated rules text', () => {
  it('derives the base text from the ops', () => {
    expect(describeCard(def(IAI_SLASH))).toBe('Deal 6 damage.');
    expect(describeCard(def(SOLAR_PARRY))).toBe('Gain 6 Block.');
    expect(describeCard(def(VECTOR_STEP))).toBe('Change stance. Draw 1 card.');
    expect(describeCard(def(SEVER))).toBe('Deal 14 damage. Gain 3 Heat.');
  });

  it('derives the rider separately, so the UI can grey it', () => {
    expect(describeRider(def(IAI_SLASH))).toBe('Deal 2 damage.');
    // Solar Shield's GUARD rider is the debuff alone — stacking Block on Block
    // made the stance the only place the card was worth playing.
    expect(describeRider(def(SOLAR_PARRY))).toBe('Apply 1 Weak.');
    expect(describeRider(def(VECTOR_STEP))).toBeNull();
  });

  it('follows the numbers when the card is upgraded', () => {
    // 8 and 4: the upgrade leans on the stance rather than the base number.
    const upgraded = definitionOf({ uid: 'x', defId: IAI_SLASH, upgraded: true });
    expect(describeCard(upgraded)).toBe('Deal 8 damage.');
    expect(describeRider(upgraded)).toBe('Deal 4 damage.');
  });

  it('knows whether the rider is live in the current stance', () => {
    const iai = makeFight({ stance: 'iai' });
    const guard = makeFight({ stance: 'guard' });
    expect(riderIsLive(def(IAI_SLASH), iai)).toBe(true);
    expect(riderIsLive(def(IAI_SLASH), guard)).toBe(false);
    expect(riderIsLive(def(SOLAR_PARRY), guard)).toBe(true);
  });

  it('spells out multi-hit and status names', () => {
    expect(
      describeCard({
        ...def(IAI_SLASH),
        effects: [
          { op: 'damage', amount: 5, target: 'enemy', times: 3 },
          { op: 'applyStatus', status: 'vulnerable', stacks: 2, target: 'allEnemies' },
        ],
      }),
    ).toBe('Deal 5 damage 3 times. Apply 2 Vulnerable to all enemies.');
  });

  it('renders a conditional as a sentence', () => {
    expect(
      describeCard({
        ...def(IAI_SLASH),
        effects: [
          {
            op: 'conditional',
            when: { kind: 'heatAtLeast', value: 6 },
            then: [{ op: 'damage', amount: 12, target: 'enemy' }],
            else: [{ op: 'damage', amount: 6, target: 'enemy' }],
          },
        ],
      }),
    ).toBe('If Heat is 6 or more, deal 12 damage. Otherwise deal 6 damage.');
  });

  it('resolves scaling against live state when given it', () => {
    const hot = makeFight({ heat: 6 });
    const text = describeCard(
      {
        ...def(IAI_SLASH),
        effects: [{ op: 'scaleWith', source: 'currentHeat', per: 2, then: [{ op: 'damage', amount: 3, target: 'enemy' }] }],
      },
      hot,
    );
    /* "hit for 3", not "deal 3 damage" and not "deal 3 extra".
 
       `scaleWith` over damage lands SEPARATE hits, and the word has to say so:
       Strength and every-hit relics are both flat per hit, so a card that
       described nine blows as one number made both of them silently worth nine
       times their face. "extra" was the older wording and was wrong in the
       other direction — it read as one bigger swing. */
    expect(text).toBe('For every 2 Heat, hit for 3. (3x now)');
  });

  it('appends Burn and Innate', () => {
    // The field is still `exhaust` — the WORD on the card is "Burn", which is
    // what the pile, the reactor and the keyword glossary all call it.
    expect(describeCard({ ...def(SEVER), exhaust: true })).toContain('Burn.');
    expect(describeCard({ ...def(SEVER), innate: true })).toContain('Innate.');
  });
});

describe('cards that read the enemy health bar', () => {
  /* The family added with `targetHullBelowPct`, `targetHullAbovePct` and the
     `targetHullMissingPct` scale source. Measured through the real resolver
     rather than by reading the ops, because the whole point of the family is
     that the SAME card does different things depending on the bar in front of
     it — and the bar moves while the card is resolving. */
  function play(cardId: string, hp: number, maxHp: number): { dealt: number; block: number } {
    const state = makeFight({ hand: [cardId], energy: 5, enemyHp: maxHp });
    if (state.run === null || state.run.combat === null) throw new Error('test: no fight');
    const enemy = state.run.combat.enemies[0];
    const card = state.run.combat.hand[0];
    if (enemy === undefined || card === undefined) throw new Error('test: nothing to play');

    const staged: GameState = {
      ...state,
      run: {
        ...state.run,
        combat: { ...state.run.combat, enemies: [{ ...enemy, hp, maxHp }] },
      },
    };
    const after = playCard(staged, card.uid, enemy.uid);
    const left = after.run?.combat?.enemies[0]?.hp ?? 0;
    return { dealt: hp - left, block: after.run?.combat?.block ?? 0 };
  }

  it('pays a threshold card only under its line', () => {
    /* Execute, since Finishing Line came out. Same shape, harder cliff: this
       one is nearly worthless above the line and enormous below it, which is
       the whole reason the family survived down to one of these. */
    expect(play('execute', 100, 100).dealt, 'whole').toBe(5);
    expect(play('execute', 60, 100).dealt, 'above the line').toBe(5);
    expect(play('execute', 20, 100).dealt, 'under it').toBe(16);
  });

  it('reads the line from the other side too', () => {
    /* The reason the family is not just executions. Against a pack this says
       "hit the one nobody has touched", which is the opposite instruction to
       everything else here. */
    expect(play('first_blood', 100, 100).dealt, 'whole').toBe(12);
    expect(play('first_blood', 50, 100).dealt, 'half').toBe(5);
  });

  it('slopes with how much the target has lost', () => {
    /* Four against something untouched. The floor is deliberately low for the
       cost — the slope is the reason to hold the card — but not so low that an
       opening draw is dead, which is what two at one Energy had become. */
    const whole = play('widening_gyre', 100, 100).dealt;
    const half = play('widening_gyre', 50, 100).dealt;
    expect(whole, 'nothing missing, nothing extra').toBe(4);
    expect(half).toBeGreaterThan(whole);
  });

  it('measures the percentage, not the health', () => {
    /* One card, two enemies, the same fraction. This is why the source is in
       percentage points rather than raw health: "for every 10% missing" has to
       mean the same thing against a 30-hull Shard and a 430-hull boss.
 
       It also pins the EFFECT ORDER, which is the less obvious half. The card
       measures the slope before its own base hit; with the hit first it was
       reading a bar it had just moved, and four damage off a 30-hull target is
       an extra step while off a 430-hull one it is nothing. This assertion is
       what catches that, and it only caught it once the base was big enough to
       cross a boundary — so leave both hull sizes far apart. */
    const small = play('widening_gyre', 15, 30).dealt;
    const large = play('widening_gyre', 215, 430).dealt;
    expect(small).toBe(large);
  });

  it('pays the defensive half for meeting something whole', () => {
    /* Read the OPENER's side, deliberately: a defensive card that pays out
       against something already nearly dead pays out on the turn you least
       need it. */
    expect(play('meet_the_charge', 100, 100).block, 'whole').toBe(12);
    expect(play('meet_the_charge', 50, 100).block, 'half gone').toBe(6);
  });

  it('makes Execute two different cards rather than one with a bonus', () => {
    /* `then`/`else`, not a base hit with a rider. The two halves are
       alternatives and not a sum, and the card face has to say so. */
    expect(play('execute', 200, 200).dealt, 'above the line').toBe(5);
    // 50 of 200 is 25% — under the line, and enough health left that the whole
    // 16 lands rather than being clipped by the kill.
    expect(play('execute', 50, 200).dealt, 'under it').toBe(16);
    expect(describeCard(cardTable.get('execute'))).toBe(
      'If the target is below 30% health, deal 16 damage. Otherwise deal 5 damage.',
    );
  });
});

describe('a card says how many times it hits, and means it', () => {
  /* The rule the whole family was rebuilt around, and it is about WORDS.
   *
   * `scaleWith` produces separate hits — one instance of its body per step —
   * and several cards want exactly that. What was wrong was never the hits, it
   * was that the generated text called them "deal 4 extra", which reads as one
   * bigger swing. So Flashpoint said it hit once and hit nine times, and the
   * two things that number is used for are the two things that count hits:
   * Strength is flat per hit, and an every-hit relic is flat per hit. The card
   * was the best carrier for both in the game and its own face denied it.
   *
   * There are now two spellings and they must not blur:
   *   `scaleWith` over damage  -> several hits  -> "hit for N"      -> multi mark
   *   `plusPer` on damage      -> one bigger    -> "plus N per X"   -> plain mark
   *
   * Asserted across all three channels together, because a card that is honest
   * in one and lying in another is the bug this replaced.
   */
  type AnyOp = {
    readonly op: string;
    readonly times?: number;
    readonly plusPer?: unknown;
    readonly then?: readonly AnyOp[];
    readonly else?: readonly AnyOp[];
  };

  const walk = (ops: readonly AnyOp[], hit: (op: AnyOp) => boolean): boolean =>
    ops.some(
      (op) => hit(op) || walk(op.then ?? [], hit) || walk(op.else ?? [], hit),
    );

  const repeats = (ops: readonly AnyOp[]): boolean =>
    walk(ops, (op) => op.op === 'scaleWith' && (op.then ?? []).some((t) => t.op === 'damage')) ||
    walk(ops, (op) => op.op === 'damage' && (op.times ?? 1) > 1);

  it('calls a repeated hit a hit, never "extra damage"', () => {
    const lying: string[] = [];
    for (const def of cardTable.all()) {
      if (!repeats(def.effects as readonly AnyOp[])) continue;
      const words = describeCard(def);
      if (!/\bhit\b/i.test(words) && !/\btimes\b/i.test(words)) {
        lying.push(`${def.name}: ${words}`);
      }
    }
    expect(lying, 'a card that swings more than once must say so').toEqual([]);
  });

  it('gives every repeating card the multi-hit mark and sound', () => {
    /* The mark is where a player learns which cards multiply Strength, so it
       has to track the behaviour rather than a hand-kept list. */
    const wrong: string[] = [];
    for (const def of cardTable.all()) {
      const many = repeats(def.effects as readonly AnyOp[]);
      const voice = cardVoice(def, null);
      const isMulti = voice === 'atkMultihit' || voice === 'atkAoeMultihit';
      if (many && !isMulti) wrong.push(`${def.name} repeats but sounds ${voice}`);
      if (!many && isMulti) wrong.push(`${def.name} sounds ${voice} but hits once`);
    }
    expect(wrong).toEqual([]);
  });

  it('keeps a plusPer card to exactly one blow', () => {
    /* The other spelling, measured rather than read: N Strength raises the
       total by N x hits, so a single swing answers 1. Widening Gyre against
       something nearly dead used to answer 9. */
    const hitsOf = (cardId: string, hp: number, stacks: number): number => {
      const play = (str: number): number => {
        const base = makeFight({
          hand: [cardId],
          energy: 9,
          enemyHp: 900,
          ...(str > 0 ? { playerStatuses: [{ status: STRENGTH, stacks: str, fresh: false }] } : {}),
        });
        const seated = startPlayerTurn(base);
        const enemy = firstEnemy(seated);
        const staged: GameState = {
          ...seated,
          run: {
            ...seated.run!,
            combat: { ...combatOf(seated), enemies: [{ ...enemy, hp, maxHp: 900 }] },
          },
        };
        const card = combatOf(staged).hand.find((entry) => entry.defId === cardId);
        if (card === undefined) throw new Error(`test: ${cardId} not in hand`);
        const after = playCard(staged, card.uid, enemy.uid);
        return hp - (combatOf(after).enemies[0]?.hp ?? 0);
      };
      return (play(stacks) - play(0)) / stacks;
    };

    expect(hitsOf('widening_gyre', 450, 5), 'Widening Gyre split into instances').toBe(1);
    expect(hitsOf('the_long_draw', 450, 5), 'The Long Draw split into instances').toBe(1);
  });

  it('still uses scaleWith for the things that are not damage', () => {
    /* Jettison scales draw, Ablative Layer scales Block. Those repeat too and
       are fine repeating: there is no per-instance bonus for the count to
       multiply, which is why this whole distinction is about damage. */
    const users = cardTable
      .all()
      .filter((def) => JSON.stringify(def.effects).includes('"scaleWith"'))
      .map((def) => def.id);
    expect(users.length, 'scaleWith went unused — did something over-convert?').toBeGreaterThan(0);
  });
});

describe('cards that count the cards you have played', () => {
  /* The counter increments AFTER effects resolve, so a card that scales on it
     never counts itself. Momentum is the one that made this visible: it used to
     be incremented next to the Energy at the top of `playCard`, which meant the
     face in your hand read the counter before the increment and the resolver
     read it after — the card showed one number and dealt another. */
  const played = (hand: readonly string[], target: string): number => {
    let state = startPlayerTurn(makeFight({ hand: [...hand], energy: 9, enemyHp: 999 }));
    const enemy = firstEnemy(state);
    const before = firstEnemy(state).hp;
    for (const id of hand) {
      const card = combatOf(state).hand.find((entry) => entry.defId === id);
      if (card === undefined) throw new Error(`test: ${id} not in hand`);
      state = playCard(state, card.uid, id === target ? enemy.uid : null);
    }
    return before - firstEnemy(state).hp;
  };

  it('does not count the card doing the counting', () => {
    /* Momentum alone is 3 x 0. Not 3 x 1 — "for every card played this turn"
       cannot include the one still resolving, or the number on the card in your
       hand is never the number you get. */
    expect(played(['momentum'], 'momentum'), 'counted itself').toBe(0);
  });

  it('counts the cards actually played before it', () => {
    /* Two cards first, because Momentum counts in twos: one hit of 6 per two
       cards played. One card is a real count of 1 and still floors to no hits,
       which is the same rule read from the other end — and worth asserting,
       since "played one card, got nothing" looks like the self-count bug this
       block exists to guard. */
    expect(played(['vector_step', 'momentum'], 'momentum'), 'one card is half a step').toBe(0);
    expect(played(['vector_step', 'vector_step', 'momentum'], 'momentum')).toBe(6);
  });

  it('still lets a relic that reads the counter see its own card', () => {
    /* The other side of the same move. The increment happens before
       `onCardPlayed` fires, which is what Long Form Ledger and Splitfire Core
       read — both count every third card and both have a comment saying they
       trust this field rather than counting separately. Third card played must
       therefore see 3, not 2. */
    let state = startPlayerTurn(
      makeFight({ hand: ['vector_step', 'vector_step', 'vector_step'], energy: 9 }),
    );
    for (let i = 0; i < 3; i += 1) {
      const card = combatOf(state).hand.find((entry) => entry.defId === 'vector_step');
      if (card === undefined) break;
      state = playCard(state, card.uid, null);
    }
    expect(combatOf(state).cardsPlayedThisTurn).toBe(3);
  });
});

describe('every shipped card', () => {
  it('produces non-empty text', () => {
    for (const card of cardTable.all()) {
      expect(describeCard(card).trim(), card.id).not.toBe('');
    }
  });

  it('has an upgrade that actually changes the text or the cost', () => {
    for (const card of cardTable.all()) {
      // Voided cards are the one exemption, and it is the definition of them:
      // a curse you could improve is a card you would eventually want.
      if (card.type === 'voided') continue;
      const upgraded = definitionOf({ uid: 'x', defId: card.id, upgraded: true });
      const changed =
        describeCard(upgraded) !== describeCard(card) ||
        describeRider(upgraded) !== describeRider(card) ||
        upgraded.cost !== card.cost;
      expect(changed, `${card.id} upgrades into something identical`).toBe(true);
    }
  });

  it('keeps the upgrade an upgrade — never a downgrade in name', () => {
    for (const card of cardTable.all()) {
      if (card.type === 'voided') continue;
      const upgraded = definitionOf({ uid: 'x', defId: card.id, upgraded: true });
      expect(upgraded.name, card.id).not.toBe('');
      expect(upgraded.rarity, `${card.id} changed rarity on upgrade`).toBe(card.rarity);
    }
  });
});

describe('the rarity ladder', () => {
  it('offers something at every tier above basic', () => {
    // A tier with nothing in it is a weight that silently rerolls, which makes
    // the reward distribution quietly different from the one in balance.ts.
    for (const rarity of RARITY_ORDER) {
      if (rarity === 'basic') continue;
      const count = cardTable.all().filter((card) => card.rarity === rarity).length;
      expect(count, `no cards at rarity '${rarity}'`).toBeGreaterThan(0);
    }
  });

  it('weights every tier the reward pool can actually produce', () => {
    /* Asserted against what `offerableCards` returns rather than against the
       whole ladder, because the ladder is deliberately wider than the roll:
       legendary and artifact exist and are unrollable, since the Reliquary is
       their only source. A weight for a tier with nothing in it would silently
       do nothing, and a tier with cards and no weight would silently never
       appear — this catches the second, which is the dangerous one. */
    // `basic` is filtered out by `offerableCards`, so this set only ever holds
    // rarities the weight table actually has a column for.
    const rollable = new Set(
      offerableCards().map((card) => card.rarity as Exclude<Rarity, 'basic'>),
    );
    expect(rollable.size).toBeGreaterThan(2);

    for (const act of [1, 2, 3] as const) {
      for (const rarity of rollable) {
        expect(
          RARITY_WEIGHTS[act][rarity],
          `act ${act} has no weight for '${rarity}'`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the top two tiers out of the roll entirely', () => {
    // Mythic and Artifact. The ladder was renamed a rung down the middle — what
    // was Rare is Epic, what was Epic is Legendary, what was Legendary is
    // Mythic — so the two the Reliquary owns are the top two by NAME as well as
    // by position, and this reads the names.
    for (const act of [1, 2, 3] as const) {
      expect(RARITY_WEIGHTS[act].mythic, `act ${act}`).toBe(0);
      expect(RARITY_WEIGHTS[act].artifact, `act ${act}`).toBe(0);
    }
    for (const card of offerableCards()) {
      expect(card.rarity, `${card.id} is offerable`).not.toBe('mythic');
      expect(card.rarity, `${card.id} is offerable`).not.toBe('artifact');
    }
  });

  it('tilts the ladder upward as the run goes on', () => {
    // Act 3 should feel different from Act 1, not just hit harder. Measured on
    // both rungs that actually move: Epic is the bulk of the tilt and Legendary
    // is the ceiling of the roll, now that the Reliquary owns the two above it.
    expect(RARITY_WEIGHTS[3].common).toBeLessThan(RARITY_WEIGHTS[1].common);
    expect(RARITY_WEIGHTS[3].epic).toBeGreaterThan(RARITY_WEIGHTS[1].epic);
    expect(RARITY_WEIGHTS[3].legendary).toBeGreaterThan(RARITY_WEIGHTS[1].legendary);
  });

  it('keeps the top tiers rare enough to stay special', () => {
    // DESIGN.md §9 names reward inflation as a trap. A legendary you see every
    // other screen is a common with a better border.
    for (const act of [1, 2, 3] as const) {
      const weights = RARITY_WEIGHTS[act];
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      const top = (weights.mythic + weights.artifact) / total;
      expect(top, `act ${act} top-tier share`).toBeLessThan(0.05);
    }
  });

  it('keeps basic cards out of the reward pool', () => {
    const state = makeFight();
    const run = state.run;
    expect(run).not.toBeNull();
    const rolled = rollCardChoices(run!.rng, 1);
    for (const id of rolled.cardIds) {
      expect(cardTable.get(id).rarity, `${id} is basic and was offered`).not.toBe('basic');
    }
  });

  it('never offers the same card twice on one screen', () => {
    const state = makeFight();
    const run = state.run!;
    let rng = run.rng;
    for (let i = 0; i < 200; i++) {
      const rolled = rollCardChoices(rng, 3);
      expect(new Set(rolled.cardIds).size).toBe(rolled.cardIds.length);
      rng = rolled.rng;
    }
  });
});

describe('what leaves the fight with you', () => {
  /* Health and Alloy survive the combat. Everything else a card can hand you —
     Block, Focus, Energy, a status — is gone when the fight ends, so playing it
     twice costs you the turns it took. A permanent resource has no such brake:
     a repeatable one is limited only by how long you are willing to make the
     fight, and the player who works that out is playing a different game from
     the one who does not.
  
     Salvage Rights shipped with a comment describing this exact failure mode
     and without the `exhaust` that prevents it. */

  function opsOf(effects: readonly EffectOp[]): EffectOp[] {
    // Both branches. The first version of this read a field called `otherwise`
    // that does not exist, so it walked `then` and silently skipped every
    // `else` — a guard with a hole in exactly the shape of the thing it guards.
    // It passed. `tsc` caught it; the tests could not have.
    return effects.flatMap((op) =>
      op.op === 'conditional' ? [op, ...opsOf(op.then), ...opsOf(op.else ?? [])] : [op],
    );
  }

  function grantsPermanent(def: CardDef): boolean {
    const all = [...opsOf(def.effects), ...opsOf(def.upgrade?.effects ?? [])];
    return all.some((op) => op.op === 'heal' || op.op === 'gainAlloy');
  }

  it('exhausts, every time', () => {
    const offenders = cardTable
      .all()
      .filter((def) => grantsPermanent(def) && def.exhaust !== true)
      .map((def) => def.id);
    expect(offenders, 'cards that print health or Alloy and can be played again').toEqual([]);
  });

  it('exhausts, if it throws the whole hand', () => {
    /* One reset a fight, not a loop. Without it the pattern is: play the
       hand-dump, draw a fresh hand, find the dump again a few turns later, and
       repeat — a deck that never has a bad hand because it never keeps one,
       which is a strictly better version of every deck rather than a different
       one. The turn it buys should cost the card that bought it.

       Partial discards are exempt and stay exempt: they pay a card for what
       they do every time they are played, so they are already self-limiting. */
    function throwsWholeHand(def: CardDef): boolean {
      const all = [...opsOf(def.effects), ...opsOf(def.upgrade?.effects ?? [])];
      return all.some((op) => op.op === 'discard' && op.all === true);
    }

    const offenders = cardTable
      .all()
      .filter((def) => throwsWholeHand(def) && def.exhaust !== true)
      .map((def) => def.id);
    expect(offenders, 'whole-hand discards that can be played twice').toEqual([]);

    // And the exemption is real rather than an empty set hiding a rename.
    const partial = cardTable
      .all()
      .filter((def) =>
        opsOf(def.effects).some((op) => op.op === 'discard' && op.all !== true),
      );
    expect(partial.length, 'no partial discards left to be exempt').toBeGreaterThan(0);
    expect(partial.some((def) => def.exhaust !== true), 'every partial discard exhausts too').toBe(
      true,
    );
  });

  it('is actually testing something', () => {
    // Guards the guard: if the ops are ever renamed this test would quietly
    // pass over an empty set and stop protecting anything.
    expect(cardTable.all().filter(grantsPermanent).length).toBeGreaterThan(0);
  });
});

describe('spending the hand', () => {
  /* The whole-hand cards scale on what THIS card threw away, so the ordering
     inside the card is load-bearing: discard first, then read the count. A
     version written the other way round scales on zero and always does nothing,
     which is the failure these tests exist to catch — it would look like a card
     that simply does not work rather than like a bug. */

  function withHand(cardId: string, others: readonly string[]): GameState {
    /* A real draw pile, because an empty one changes the answer. Drawing from
       nothing reshuffles the discard back in, and in a fight with no deck that
       discard is precisely the cards just thrown away — so Jettison hands them
       straight back and looks broken. In a real fight the pile holds the rest
       of the deck and the odds of that are negligible; here it has to be set
       up, or the test is measuring the fixture. */
    return makeFight({
      enemyIds: ['scrap_hound'],
      hand: [cardId, ...others],
      drawPile: ['solar_shield', 'solar_shield', 'half_draw', 'bulwark', 'iai_slash'],
      energy: 3,
    });
  }

  function play(state: GameState, targeted = true): GameState {
    const card = combatOf(state).hand[0];
    if (card === undefined) throw new Error('test: no card');
    return playCard(state, card.uid, targeted ? firstEnemy(state).uid : null);
  }

  it('turns a dead hand into damage, one card at a time', () => {
    const state = withHand('empty_the_rack', ['iai_slash', 'iai_slash', 'bulwark']);
    const before = firstEnemy(state).hp;
    const after = play(state);

    /* Three cards left in hand once the played one has gone, and the card hits
       once per TWO of them for 6 — so three discards buy one hit and leave a
       remainder. Half the instances at the same rate, which is the whole point
       of counting in twos: the odd card is the price of not handing Strength a
       seven-times multiplier. */
    expect(combatOf(after).hand).toHaveLength(0);
    expect(before - firstEnemy(after).hp).toBe(6);
  });

  it('does nothing on an empty hand rather than something strange', () => {
    const state = withHand('empty_the_rack', []);
    const before = firstEnemy(state).hp;
    expect(firstEnemy(play(state)).hp).toBe(before);
  });

  it('turns the same hand into Block on the other side', () => {
    const state = withHand('shed_weight', ['iai_slash', 'iai_slash']);
    const after = play(state, false);
    expect(combatOf(after).block).toBe(8);
  });

  it('deals the hand back, one for one', () => {
    const state = withHand('jettison', ['iai_slash', 'iai_slash', 'bulwark']);
    const thrown = new Set(combatOf(state).hand.slice(1).map((card) => card.uid));
    const after = play(state, false);

    // Three thrown, three drawn. Asserted on the uids rather than on the
    // discard pile, because a draw that empties the deck reshuffles the discard
    // straight back into it — the cards are gone from your hand, which is what
    // the card promised, and where they physically are afterwards is the draw
    // engine's business.
    expect(combatOf(after).hand).toHaveLength(3);
    for (const card of combatOf(after).hand) {
      expect(thrown.has(card.uid), 'drew back a card it had just thrown').toBe(false);
    }
  });

  it('counts only what this card discarded', () => {
    /* `discardedThisPlay` is scoped to the play like `killsThisPlay`. If it
       leaked across cards, an Overdraw earlier in the turn would silently make the
       next Empty the Rack hit harder. */
    let state = withHand('overdraw', ['iai_slash', 'iai_slash', 'bulwark', 'empty_the_rack']);
    state = play(state, false);

    const rack = combatOf(state).hand.find((card) => card.defId === 'empty_the_rack');
    if (rack === undefined) throw new Error('test: Overdraw discarded the card under test');

    const handAfterOverdraw = combatOf(state).hand.length;
    const before = firstEnemy(state).hp;
    const after = playCard(state, rack.uid, firstEnemy(state).uid);
    expect(before - firstEnemy(after).hp).toBe(Math.floor((handAfterOverdraw - 1) / 2) * 6);
  });

  it('says what it does, in generated words', () => {
    expect(describeCard(cardTable.get('empty_the_rack'))).toBe(
      'Discard your hand. For every 2 cards discarded, hit for 6. Burn.',
    );
    expect(describeCard(cardTable.get('overdraw'))).toBe('Draw 3 cards. Discard 1 at random.');
  });
});
