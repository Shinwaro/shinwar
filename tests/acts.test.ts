/* Environments, Masteries, the act ladder, and the Wavefront.
 *
 * The thing every one of these has in common: they rewrite a rule the player
 * has already learned. So the tests care most about the seams — that a Mastery
 * reaches the damage pipeline rather than being special-cased beside it, that a
 * hidden intent is hidden from the *preview* and not just from the label, and
 * that an act boundary carries everything the player built across it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../src/engine/types.ts';
import { createInitialState, requireCombat } from '../src/engine/state.ts';
import { createRng } from '../src/engine/rng.ts';
import { applyAction } from '../src/engine/reducer.ts';
import { advanceAct } from '../src/engine/run/run.ts';
import { rollMastery } from '../src/engine/run/rewards.ts';
import {
  applyDirectDamage,
  computeDamage,
  previewDamage,
  PLAYER,
  enemyTarget,
} from '../src/engine/combat/damage.ts';
import { fireHook } from '../src/engine/hooks.ts';
import { endTurnImmediately, startPlayerTurn } from '../src/engine/combat/combat.ts';
import { setStance } from '../src/engine/combat/stance.ts';
import { intentVisible } from '../src/engine/combat/intents.ts';
import { environmentRules, liveStance, stanceChangeLimit } from '../src/engine/combat/rules.ts';
import { gainHeat, ventHeat } from '../src/engine/combat/heat.ts';
import { ACTIVE_STANCES, ACT_CLEAR_HEAL_PCT, BOSS_MAX_HEALTH, MASTERY, WAVEFRONT } from '../src/content/balance.ts';
import {
  CHRONAL_SHEAR_ID,
  DEBRIS_FIELD_ID,
  DEEP_VOID_ID,
  ENVIRONMENTS,
  GRAVITY_WELL_ID,
  RADIATION_BELT_ID,
  SENSOR_FOG_ID,
  STELLAR_CORONA_ID,
} from '../src/content/environments.ts';
import { IRON_TIDE, UNSHEATHED_MIND } from '../src/content/masteries.ts';
import { CHIRALITY_WARDEN } from '../src/content/enemies/act3.ts';
import { ENCOUNTERS } from '../src/content/encounters.ts';
import { reloadContent } from '../src/content/index.ts';
import {
  enemies as enemyTable,
  masteries as masteryTable,
} from '../src/content/registry.ts';
import { makeFight, combatOf, firstEnemy, hullOf } from './helpers.ts';

/** A fight in a named environment. */
function inEnvironment(environmentId: string, options: Parameters<typeof makeFight>[0] = {}): GameState {
  const state = makeFight(options);
  if (state.run === null || state.run.combat === null) throw new Error('test: no fight');
  return {
    ...state,
    run: { ...state.run, combat: { ...state.run.combat, environmentId } },
  };
}

function withMastery(state: GameState, masteryId: string): GameState {
  if (state.run === null) throw new Error('test: no run');
  return {
    ...state,
    run: { ...state.run, pilot: { ...state.run.pilot, masteries: [masteryId] } },
  };
}

beforeEach(() => {
  reloadContent();
});

describe('the environment pool', () => {
  it('ships all eight', () => {
    expect(ENVIRONMENTS.length).toBe(8);
  });

  it('gives every one of them badge text, because the map shows it before you commit', () => {
    for (const def of ENVIRONMENTS) {
      expect(def.text.trim(), def.id).not.toBe('');
    }
  });

  it('gives every one except Clear Space something to actually do', () => {
    for (const def of ENVIRONMENTS) {
      if (def.id === 'clear_space') continue;
      const declares = def.rules !== undefined && Object.keys(def.rules).length > 0;
      // The rest reach the game through the hook bus instead.
      const hooked = [RADIATION_BELT_ID, DEBRIS_FIELD_ID].includes(def.id);
      expect(declares || hooked, `${def.id} does nothing`).toBe(true);
    }
  });
});

describe('environments that modify a calculation', () => {
  it('Stellar Corona adds to every Heat gain', () => {
    const state = inEnvironment(STELLAR_CORONA_ID);
    const hot = gainHeat(state, 2, 'test');
    expect(combatOf(hot).heat).toBe(2 + (environmentRules(state).heatGainBonus ?? 0));
  });

  it('Stellar Corona leaves the vent alone', () => {
    /* It used to double it, as compensation for the +1 on every gain. In play
       the two mostly cancelled: a deck with any vent barely noticed the corona,
       and a deck without one got the penalty and none of the relief. One clean
       rule reads better than two that argue, so a vent in the corona is worth
       exactly what a vent is worth anywhere. */
    const state = inEnvironment(STELLAR_CORONA_ID, { heat: 8 });
    const cooled = ventHeat(state, 2, 'test');
    const plain = ventHeat(inEnvironment('clear_space', { heat: 8 }), 2, 'test');
    expect(combatOf(cooled).heat).toBe(6);
    expect(combatOf(cooled).heat).toBe(combatOf(plain).heat);
  });

  it('Deep Void bleeds Heat at the end of the turn', () => {
    // Measured against the same turn in Clear Space rather than against a raw
    // number, so the stance's own contribution cancels out of both sides. Well
    // clear of the threshold, so neither side trips an overheat and resets.
    const plain = endTurnImmediately(inEnvironment('clear_space', { heat: 3, stance: 'iai' }));
    const void_ = endTurnImmediately(inEnvironment(DEEP_VOID_ID, { heat: 3, stance: 'iai' }));
    expect(combatOf(void_).heat).toBe(
      combatOf(plain).heat - (environmentRules(void_).heatDecayPerTurn ?? 0),
    );
  });

  it('Gravity Well amplifies a heavy hit and leaves a light one alone', () => {
    const state = inEnvironment(GRAVITY_WELL_ID, { stance: 'guard' });
    const enemy = firstEnemy(state);
    const shape = {
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 1,
      consumesFocus: false,
    } as const;

    expect(computeDamage(state, { ...shape, amount: 12 }).beforeBlock).toBe(18);
    expect(computeDamage(state, { ...shape, amount: 11 }).beforeBlock).toBe(11);
  });

  it('Gravity Well caps stance changes, and the cap is enforced', () => {
    const state = inEnvironment(GRAVITY_WELL_ID, { stance: 'guard' });
    expect(stanceChangeLimit(state)).toBe(1);

    const once = setStance(state, 'iai', 'test');
    expect(combatOf(once).stance).toBe('iai');
    const twice = setStance(once, 'guard', 'test');
    expect(combatOf(twice).stance, 'the second change should be refused').toBe('iai');
  });

  it('Chronal Shear queues the enemies twice, resolving the telegraphed move both times', () => {
    const plain = inEnvironment('clear_space', { enemyIds: ['scrap_hound'], hand: [] });
    const sheared = inEnvironment(CHRONAL_SHEAR_ID, { enemyIds: ['scrap_hound'], hand: [] });

    // Round 3 is the shear round; walk both to the same point and compare.
    const damageOver = (start: GameState, rounds: number): number => {
      let next = startPlayerTurn(start);
      const before = hullOf(next);
      for (let i = 0; i < rounds; i++) next = endTurnImmediately(next);
      return before - hullOf(next);
    };

    expect(damageOver(sheared, 3)).toBeGreaterThan(damageOver(plain, 3));
  });
});

describe('environments that act at a moment', () => {
  it('Radiation Belt cooks everyone, including the enemies', () => {
    const state = startPlayerTurn(inEnvironment(RADIATION_BELT_ID, { enemyIds: ['scrap_hound'] }));
    expect(hullOf(state)).toBeLessThan(70);
    expect(firstEnemy(state).hp).toBeLessThan(enemyTable.get('scrap_hound').maxHp);
  });

  it('Debris Field marks a target a turn before the rock lands', () => {
    const state = startPlayerTurn(inEnvironment(DEBRIS_FIELD_ID, { enemyIds: ['scrap_hound'] }));
    const marked = combatOf(state).envMemory['debrisTarget'];
    // Somebody in the fight, and named before the round it lands in.
    const present = ['player', ...combatOf(state).enemies.map((enemy) => enemy.uid)];
    expect(present).toContain(marked);
  });

  it('spreads the rock across everyone rather than always hitting the player', () => {
    /*
     * The regression this exists for: the target used to be the highest-HP
     * combatant, which sounds neutral and is not. The ronin has 70 health and an
     * Act 1 enemy has twenty-something, so it resolved to the player nearly
     * every round — a flat tax wearing a hazard's coat, charged for the thing
     * that keeps you alive.
     */
    const marks = new Set<unknown>();
    for (let i = 0; i < 40; i++) {
      const base = inEnvironment(DEBRIS_FIELD_ID, { enemyIds: ['scrap_hound'] });
      if (base.run === null) throw new Error('test: no run');
      // Only the stream differs between iterations, so what varies is the draw.
      const seeded: GameState = { ...base, run: { ...base.run, rng: createRng(`ROCK-${i}`) } };
      marks.add(combatOf(startPlayerTurn(seeded)).envMemory['debrisTarget']);
    }
    expect(marks.size, 'the rock only ever marks one kind of target').toBeGreaterThan(1);
  });

  it('lets Block stop the rock', () => {
    /* The rock is announced a full turn ahead. A hit you are shown and cannot
       answer is a bill rather than a decision — the telegraph is only worth
       reading if holding Block is a reply to it.

       Overheat and burn stay unblockable, and the difference is where the
       damage comes from: a reactor cooking you from the inside does not care
       what is bolted to the outside. A rock does. */
    const base = inEnvironment(DEBRIS_FIELD_ID, { enemyIds: ['scrap_hound'] });
    if (base.run === null || base.run.combat === null) throw new Error('test: no fight');

    // Mark the player, so the rock is aimed at the one combatant with Block.
    const aimed: GameState = {
      ...base,
      run: {
        ...base.run,
        combat: {
          ...base.run.combat,
          block: 20,
          envMemory: { ...base.run.combat.envMemory, debrisTarget: 'player' },
        },
      },
    };

    const landed = fireHook(aimed, 'onRoundEnd', { round: combatOf(aimed).round });
    expect(hullOf(landed), 'the rock reached hull through 20 Block').toBe(hullOf(aimed));
    expect(combatOf(landed).block, 'Block did not pay for it').toBeLessThan(20);
  });

  it('still takes hull when there is no Block to spend', () => {
    const base = inEnvironment(DEBRIS_FIELD_ID, { enemyIds: ['scrap_hound'] });
    if (base.run === null || base.run.combat === null) throw new Error('test: no fight');
    const aimed: GameState = {
      ...base,
      run: {
        ...base.run,
        combat: {
          ...base.run.combat,
          block: 0,
          envMemory: { ...base.run.combat.envMemory, debrisTarget: 'player' },
        },
      },
    };
    const landed = fireHook(aimed, 'onRoundEnd', { round: combatOf(aimed).round });
    expect(hullOf(landed)).toBeLessThan(hullOf(aimed));
  });

  it('leaves overheat unblockable', () => {
    // The rule that makes the rock's exception mean something.
    const shielded = makeFight({ heat: 0 });
    if (shielded.run === null || shielded.run.combat === null) throw new Error('test: no fight');
    const withBlock: GameState = {
      ...shielded,
      run: { ...shielded.run, combat: { ...shielded.run.combat, block: 40 } },
    };
    const cooked = applyDirectDamage(withBlock, PLAYER, 8, 'heat', 'overheat at 8');
    expect(hullOf(cooked)).toBe(hullOf(withBlock) - 8);
    expect(combatOf(cooked).block).toBe(40);
  });
});

describe('Sensor Fog', () => {
  it('hides the telegraph on every other round, starting with the first', () => {
    /* It used to hide it for the whole fight, which made Sensor Fog a
       different game rather than a harder one: with nothing ever readable
       there is no plan to make, only Block to hold, and a whole fight of that
       is one decision repeated.

       There is still no way to buy the reveal back. A free reveal once a turn
       made the environment a click you paid before getting the information
       anyway. The rhythm is the mitigation, not a button. */
    let fogged = inEnvironment(SENSOR_FOG_ID, { enemyIds: ['scrap_hound'] });
    const seen: { round: number; visible: boolean }[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push({ round: requireCombat(fogged).round, visible: intentVisible(fogged) });
      fogged = startPlayerTurn(fogged);
    }

    // Odd rounds blind, even rounds clear — and what you read on a clear round
    // is worth carrying into the blind one, which is the whole point.
    for (const { round, visible } of seen) {
      expect(visible, `round ${round}`).toBe(round % 2 === 0);
    }
    expect(seen.some((entry) => entry.visible), 'never clear').toBe(true);
    expect(seen.some((entry) => !entry.visible), 'never blind').toBe(true);
  });

  it('hides nothing anywhere else', () => {
    const clear = startPlayerTurn(inEnvironment('clear_space', { enemyIds: ['scrap_hound'] }));
    expect(intentVisible(clear)).toBe(true);
  });

  it('still commits the move, so the fight is blind rather than random', () => {
    // The intent is chosen and frozen exactly as it is anywhere else — the
    // player just cannot read it. That distinction is the difference between
    // hidden information and an unfair fight.
    const fogged = startPlayerTurn(inEnvironment(SENSOR_FOG_ID, { enemyIds: ['scrap_hound'] }));
    expect(firstEnemy(fogged).intentMoveId).not.toBeNull();
  });
});

describe('stance masteries', () => {
  it('reach the damage pipeline rather than sitting beside it', () => {
    // Unsheathed Mind doubles what a stack of Focus is worth. The pipeline has
    // to see that, or the preview and the result disagree.
    const base = makeFight({ stance: 'iai', focus: 3 });
    const mastered = withMastery(base, UNSHEATHED_MIND);
    const enemy = firstEnemy(base);
    const shape = {
      amount: 6,
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: true,
    } as const;

    // One stack per card, so the mastery doubles what THAT stack is worth
    // rather than doubling a lump sum.
    expect(computeDamage(base, shape).beforeBlock).toBe(6 + 2);
    expect(computeDamage(mastered, shape).beforeBlock).toBe(6 + 4);
  });

  it('cannot make the preview disagree with the result', () => {
    const mastered = withMastery(makeFight({ stance: 'iai', focus: 2 }), UNSHEATHED_MIND);
    const enemy = firstEnemy(mastered);
    const shape = {
      amount: 9,
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: false,
    } as const;
    expect(previewDamage(mastered, shape)).toEqual(computeDamage(mastered, shape));
  });

  it('rewrite the stance strip text as well as the behaviour', () => {
    const mastered = withMastery(makeFight({ stance: 'iai' }), UNSHEATHED_MIND);
    const rules = liveStance(mastered);
    expect(rules.focusPerStack).toBe(4);
    expect(rules.text).toContain('4');
    expect(rules.masteries).toContain(UNSHEATHED_MIND);
  });

  it('charge a real cost — Iron Tide buys retained Block with the stance axis', () => {
    const mastered = withMastery(makeFight({ stance: 'guard' }), IRON_TIDE);
    expect(liveStance(mastered).blockRetained).toBeGreaterThan(100);
    expect(stanceChangeLimit(mastered)).toBe(1);
  });

  it('never drop from a normal fight, and are capped', () => {
    const state = applyAction(createInitialState('MASTERY'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');

    expect(rollMastery(run.rng, run, 'combat').masteryId).toBeNull();

    const full = {
      ...run,
      pilot: { ...run.pilot, masteries: ['a', 'b', 'c'].slice(0, MASTERY.cap) },
    };
    expect(rollMastery(run.rng, full, 'boss').masteryId).toBeNull();
  });

  it('always drop from a boss', () => {
    const state = applyAction(createInitialState('BOSSDROP'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');
    expect(rollMastery(run.rng, run, 'boss').masteryId).not.toBeNull();
  });

  it('never give a second one for a stance that already has one', () => {
    // Two on the same stance would compose by overwriting each other field by
    // field, so the second would silently undo half the first.
    const state = applyAction(createInitialState('ONEEACH'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');

    const held = { ...run, pilot: { ...run.pilot, masteries: [IRON_TIDE] } };
    for (let i = 0; i < 40; i++) {
      const rolled = rollMastery({ ...run.rng, rewards: run.rng.rewards + i }, held, 'boss');
      if (rolled.masteryId === null) continue;
      expect(masteryTable.get(rolled.masteryId).stance).not.toBe('guard');
    }
  });

  it('cover both stances in rotation, so the drop is never a dead slot', () => {
    for (const stance of ACTIVE_STANCES) {
      const forStance = masteryTable.all().filter((def) => def.stance === stance);
      expect(forStance.length, `no mastery for ${stance}`).toBeGreaterThan(0);
    }
  });
});

describe("Act 3's counter-enemies", () => {
  it('read the number the pipeline is producing, and the preview shows it', () => {
    const state = makeFight({ enemyIds: [CHIRALITY_WARDEN], stance: 'guard' });
    const enemy = firstEnemy(state);
    const shape = {
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 1,
      consumesFocus: false,
    } as const;

    // Under the threshold it lands in full; over it, most of it is thrown away.
    expect(computeDamage(state, { ...shape, amount: 20 }).beforeBlock).toBe(20);
    expect(computeDamage(state, { ...shape, amount: 40 }).beforeBlock).toBe(16);
    expect(previewDamage(state, { ...shape, amount: 40 })).toEqual(
      computeDamage(state, { ...shape, amount: 40 }),
    );
  });

  it('are worth routing around rather than through — the counter is real', () => {
    const state = makeFight({ enemyIds: [CHIRALITY_WARDEN] });
    const enemy = firstEnemy(state);
    const big = computeDamage(state, {
      amount: 45,
      attacker: PLAYER,
      target: enemyTarget(enemy.uid),
      isAttack: true,
      attackOrdinal: 1,
      consumesFocus: false,
    });
    const twoSmall =
      computeDamage(state, {
        amount: 18,
        attacker: PLAYER,
        target: enemyTarget(enemy.uid),
        isAttack: true,
        attackOrdinal: 1,
        consumesFocus: false,
      }).beforeBlock * 2;
    expect(twoSmall).toBeGreaterThan(big.beforeBlock);
  });
});

describe('the act ladder', () => {
  it('has a full roster for every act and tier', () => {
    for (const act of [1, 2, 3] as const) {
      for (const tier of ['normal', 'elite', 'boss'] as const) {
        const pool = ENCOUNTERS.filter((entry) => entry.act === act && entry.tier === tier);
        expect(pool.length, `act ${act} ${tier}`).toBeGreaterThan(0);
      }
    }
  });

  it('carries the whole run across an act boundary', () => {
    let state = applyAction(createInitialState('ACTS'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');

    state = {
      ...state,
      run: {
        ...run,
        alloy: 250,
        pilot: { ...run.pilot, masteries: [UNSHEATHED_MIND], health: 41 },
        threads: [{ threadId: 'marked', resolved: false, progress: 2 }],
      },
    };

    const next = advanceAct(state);
    const after = next.run;
    if (after === null) throw new Error('test: no run');

    expect(after.act).toBe(2);
    expect(after.alloy).toBe(250);
    expect(after.pilot.masteries).toEqual([UNSHEATHED_MIND]);

    /* Beating an act is worth two separate things. The ceiling goes up — the
       one progression beat a card reward cannot dilute — and a share of what
       sits under the ceiling comes back, because arriving in a new sky on
       whatever the boss left you made a won fight feel like a loss. */
    const maxHealth = run.pilot.maxHealth + BOSS_MAX_HEALTH;
    expect(after.pilot.maxHealth).toBe(maxHealth);
    expect(after.pilot.health).toBe(
      41 + BOSS_MAX_HEALTH + Math.floor(maxHealth * ACT_CLEAR_HEAL_PCT),
    );
    expect(after.threads[0]?.progress).toBe(2);

    // A new sky, though: fresh map, nowhere visited, no shop held over.
    expect(after.position).toBeNull();
    expect(after.visited).toEqual([]);
    expect(after.shop).toBeNull();
    expect(after.map?.act).toBe(2);
  });

  it('never patches past the ceiling', () => {
    // A boss cleared at near-full health should arrive at full, not above it.
    let state = applyAction(createInitialState('ACTS-FULL'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');
    state = { ...state, run: { ...run, pilot: { ...run.pilot, health: run.pilot.maxHealth } } };

    const after = advanceAct(state).run;
    if (after === null) throw new Error('test: no run');
    expect(after.pilot.health).toBe(after.pilot.maxHealth);
  });

  it('refuses to advance past the last act', () => {
    let state = applyAction(createInitialState('LAST'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');
    state = { ...state, run: { ...run, act: 3 } };
    expect(advanceAct(state)).toBe(state);
  });
});

describe('the Wavefront', () => {
  it('does not exist in Act 1', () => {
    const state = applyAction(createInitialState('FRONT'), { kind: 'beginRun' });
    expect(state.run?.wavefront).toBeNull();
  });

  it('starts with a lead when the act it belongs to opens', () => {
    let state = applyAction(createInitialState('FRONT'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');
    state = advanceAct({ ...state, run: { ...run, act: 1 } });
    expect(state.run?.wavefront?.row).toBe(-WAVEFRONT.grace);
    expect(state.run?.wavefront?.hazardPending).toBe(false);
  });

  it('charges double for a stop, which is the whole mechanism', () => {
    let state = applyAction(createInitialState('FRONT2'), { kind: 'beginRun' });
    const run = state.run;
    if (run === null) throw new Error('test: no run');
    state = advanceAct({ ...state, run: { ...run, act: 1 } });

    const map = state.run?.map;
    const stop = map?.nodes.find((node) => node.type === 'safe' || node.type === 'station');
    const plain = map?.nodes.find((node) => node.type === 'combat' && node.row > 0);
    expect(stop).toBeDefined();
    expect(plain).toBeDefined();

    // Compared as costs rather than by walking, so the assertion is about the
    // rule and not about which node a seed happened to put where.
    expect(WAVEFRONT.timeAtStop).toBeGreaterThan(WAVEFRONT.timePerNode);
  });
});
