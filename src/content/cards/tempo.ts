/* Tempo cards — the long turn.
 *
 * Robin's ask: reward drawing, make a long turn possible, and let a set-up pay
 * off in one enormous swing. The existing pool could not do any of that, because
 * Energy and draw were fixed at 3 and 5 forever and nothing scaled on how much
 * you had already done this turn.
 *
 * Three levers, and they are meant to be combined:
 *
 *   - Heat buys Energy. The gauge stops being purely a cost and becomes a
 *     resource you can spend, which is what makes riding it toward the overheat
 *     line a real decision instead of a mistake.
 *   - Cards drawn beget cards played. Draw that pays for itself keeps the turn
 *     going rather than just replacing the card you spent.
 *   - Something at the end that scales on the whole turn, so a nine-card turn
 *     ends in a number a three-card turn cannot reach.
 *
 * They chain: Pressure Utilization into Open the Line into Long Form is a turn you
 * build rather than a hand you play.
 */

import type { CardDef } from '../../engine/types.ts';
import { RUST, VULNERABLE, WEAK } from '../statuses.ts';

export const TEMPO_CARDS: readonly CardDef[] = [
  {
    /* Renamed from Pressure Release, id and all — nothing referenced the old
       one. "Release" is what venting does, and this card is the opposite: it
       spends a gauge that is already high rather than bringing it down. A name
       that describes the wrong half of the mechanic is worse on an archetype
       whose whole difficulty is knowing which direction you are pushing. */
    id: 'pressure_utilization',
    name: 'Pressure Utilization',
    type: 'skill',
    rarity: 'common',
    archetype: 'overheat',
    cost: 0,
    /* The gate moved from 5 to 6, and the upgrade's from 4 to 5.

       At 5 the card was free Energy for most of a heat deck's turn: the
       archetype wants the gauge high anyway, so the condition was met by
       playing the deck as intended rather than by taking a risk. At 6 it pays
       two points from the line — you are choosing to sit inside the overheat
       window to get it, which is the bargain the card is supposed to be
       offering. */
    /* The Vulnerable is unconditional, and that is the point of putting it
       here. The card's own bargain already reads the gauge — Energy if you are
       hot, more Heat if you are not — so a cost that ALSO scaled with Heat
       would have been the same question twice. A flat point of Vulnerable is
       what you pay for asking the question at all. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 6 },
        then: [{ op: 'gainEnergy', amount: 1 }],
        else: [{ op: 'gainHeat', amount: 2 }],
      },
      { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'self' },
    ],
    upgrade: {
      name: 'Pressure Utilization+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 5 },
          then: [{ op: 'gainEnergy', amount: 2 }],
          else: [{ op: 'gainHeat', amount: 2 }],
        },
        { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'self' },
      ],
    },
    flavor: 'Let it out through something useful on the way past.',
  },

  {
    id: 'open_the_line',
    name: 'Open the Line',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'draw', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'cardsPlayedThisTurnAtLeast', value: 3 },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Open the Line+',
      effects: [
        { op: 'draw', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'cardsPlayedThisTurnAtLeast', value: 2 },
          then: [{ op: 'gainEnergy', amount: 1 }],
        },
      ],
    },
    flavor: 'The third move is the one that shows you the fourth.',
  },

  {
    id: 'long_form',
    name: 'Long Form',
    type: 'attack',
    rarity: 'epic',
    archetype: 'neutral',
    cost: 2,
    // The payoff card. On a three-card turn it is unremarkable; on a nine-card
    // turn it is the reason the other eight were worth playing.
    effects: [
      { op: 'damage', amount: 6, target: 'enemy' },
      {
        op: 'scaleWith',
        source: 'cardsPlayedThisTurn',
        per: 2,
        then: [{ op: 'damage', amount: 8, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Long Form+',
      effects: [
        { op: 'damage', amount: 8, target: 'enemy' },
        {
          op: 'scaleWith',
          source: 'cardsPlayedThisTurn',
          per: 2,
          then: [{ op: 'damage', amount: 12, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Forty years of drill, spent in the order they were learned.',
  },

  {
    id: 'held_line',
    name: 'Held Line',
    type: 'skill',
    rarity: 'epic',
    archetype: 'guard',
    cost: 1,
    effects: [
      { op: 'block', amount: 6 },
      {
        op: 'scaleWith',
        source: 'cardsPlayedThisTurn',
        per: 1,
        then: [{ op: 'block', amount: 2 }],
      },
    ],
    upgrade: {
      name: 'Held Line+',
      effects: [
        { op: 'block', amount: 9 },
        {
          op: 'scaleWith',
          source: 'cardsPlayedThisTurn',
          per: 1,
          then: [{ op: 'block', amount: 3 }],
        },
      ],
    },
    flavor: 'Every motion before this one was also the guard.',
  },

  {
    id: 'flashpoint',
    name: 'Flashpoint',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'overheat',
    cost: 1,
    exhaust: true,
    /* The other end of the Heat bargain: the hotter you are, the harder this
       lands.
 
       It no longer hands the gauge all the way back. Venting 5 meant the card
       cashed a full reactor AND returned you to a cold one, so the only cost of
       running the Heat plan at maximum was the turn you spent doing it — the
       card was the payoff and the reset in one. Two leaves you hot, which is
       where a card that rewards being hot should leave you: still in the
       bargain, still one bad draw from the ceiling.
 
       The Vulnerable came off for the same reason. A legendary that hits for 25
       does not also need to make the next hit land harder; that was the payoff
       paying a second time, and it made Flashpoint the correct opener to every
       burst rather than the end of one. */
    /* Four per two Heat, as ONE hit — and the step size is the point, not the
       rate.

       The rate is unchanged: two a point before, two a point now, 21 off an
       eight-point gauge either way. What changed is that it used to arrive as
       NINE separate two-damage blows, because "deal 2 more per Heat" was
       spelled as a `scaleWith` that repeated the hit. Strength is flat per hit
       and a `damageEveryHit` relic is flat per hit, so at three Strength and
       one relic this card silently gained 36 damage that nothing on its face
       mentioned — the biggest per-hit-bonus carrier in the game, on the card
       already designed to be the biggest hit in the game.

       Counted in twos rather than ones because that is how the card now reads
       out loud, and because a gauge is a coarse resource: "4 per 2 Heat" is a
       number you can plan a turn around, where "2 per Heat" invited counting
       single points that never mattered individually. */
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      {
        op: 'scaleWith',
        source: 'currentHeat',
        per: 2,
        then: [{ op: 'damage', amount: 4, target: 'enemy' }],
      },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Flashpoint+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        {
          op: 'scaleWith',
          source: 'currentHeat',
          per: 2,
          then: [{ op: 'damage', amount: 6, target: 'enemy' }],
        },
        { op: 'ventHeat', amount: 2 },
      ],
    },
    flavor: 'Spend the whole reactor through the edge and start again cold.',
  },

  {
    id: 'second_wind',
    name: 'Second Wind',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    /* Costs 1. At 0 it was a free look at three more cards with an Energy
       refund attached, which is not a decision -- there was never a turn where
       playing it first was wrong. */
    cost: 1,
    exhaust: true,
    effects: [
      { op: 'draw', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'handSizeAtLeast', value: 7 },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Second Wind+',
      effects: [
        { op: 'draw', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'handSizeAtLeast', value: 6 },
          then: [{ op: 'gainEnergy', amount: 1 }],
        },
      ],
    },
    flavor: 'You were not tired. You were between things.',
  },

  /* ---------- deliberately small ----------
     Cards that do one thing and interact with one mechanic. Tuned low on
     purpose: a card that is slightly too weak is a tuning number, and a card
     that does three things is a design decision you have to unpick. Every one
     of these touches Heat, the stance, or Focus — and only one of them. */

  /* Was two cards. `runaway_intake` was this exact card one rarity higher —
     0 Energy, +1 Energy, +3 Heat, same upgrade — which is both a duplicate and
     a tier inversion, since the uncommon offered nothing the common did not. */
  {
    id: 'stoke_the_core',
    name: 'Stoke the Core',
    type: 'skill',
    /* Epic, and it burns.
     *
     * A free Energy for 3 Heat is the whole overheat archetype in one card, and
     * as a repeatable common it was the archetype's floor rather than its
     * ceiling — every hot deck opened with it, every turn it appeared. Once a
     * fight, at a tier that means you had to be given it, it is the turn you
     * decide to spend rather than the turn you always have. */
    rarity: 'epic',
    archetype: 'overheat',
    cost: 0,
    exhaust: true,
    /* Four Heat, and the Energy only if that leaves you at six or more.
     *
       The unconditional version was Energy for Heat at a fixed rate, which made
       it best in the deck that wanted it least: a cold deck played it from two
       Heat, took the Energy and was still nowhere near the threshold. The whole
       point of the archetype is that Heat is dangerous, and a card that hands
       out the reward before the danger starts is the archetype's floor rather
       than its ceiling.
     *
       Gated at six, it has to be played from two or above to pay at all — so
       taking the Energy means standing in the half of the gauge where overheat
       is a real possibility. The Heat comes first and the check reads the total
       after it, which is the reading the card's own sentence gives.
     *
       The upgrade keeps its unconditional Energy at half the Heat: gating that
       too would make the cheaper version WORSE at reaching the gate, which is
       an upgrade that undoes itself. */
    effects: [
      { op: 'gainHeat', amount: 4 },
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 6 },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Stoke the Core+',
      effects: [
        { op: 'gainHeat', amount: 2 },
        { op: 'gainEnergy', amount: 1 },
      ],
    },
    flavor: 'Ask it for more. It has never once refused.',
  },

  {
    id: 'kindled_edge',
    name: 'Kindled Edge',
    type: 'attack',
    rarity: 'common',
    archetype: 'overheat',
    cost: 1,
    effects: [
      { op: 'damage', amount: 8, target: 'enemy' },
      { op: 'gainHeat', amount: 2 },
    ],
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'damage', amount: 3, target: 'enemy' }],
    },
    upgrade: {
      name: 'Kindled Edge+',
      effects: [
        { op: 'damage', amount: 12, target: 'enemy' },
        { op: 'gainHeat', amount: 2 },
      ],
    },
    flavor: 'Warm metal takes an edge that cold metal argues with.',
  },

  {
    id: 'bank_the_breath',
    name: 'Bank the Breath',
    type: 'skill',
    rarity: 'common',
    archetype: 'guard',
    cost: 0,
    effects: [{ op: 'gainFocus', amount: 1 }],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'gainFocus', amount: 1 }],
    },
    upgrade: {
      name: 'Bank the Breath+',
      effects: [{ op: 'gainFocus', amount: 2 }],
    },
    flavor: 'Counting is not waiting. It only looks like it.',
  },

  {
    id: 'turn_the_shoulder',
    name: 'Turn the Shoulder',
    type: 'skill',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'block', amount: 3 },
    ],
    upgrade: {
      name: 'Turn the Shoulder+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'block', amount: 6 },
      ],
    },
    flavor: 'The guard and the turn are the same motion, taught twice.',
  },

  {
    id: 'reverse_the_grip',
    name: 'Reverse the Grip',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'gainFocus', amount: 1 },
    ],
    upgrade: {
      name: 'Reverse the Grip+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'gainFocus', amount: 2 },
      ],
    },
    flavor: 'Same blade. Other hand. Everything after it is different.',
  },

  {
    id: 'cross_step',
    name: 'Cross Step',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Cross Step+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'ventHeat', amount: 4 },
      ],
    },
    flavor: 'Out of the line, and cooler for having left it.',
  },

  {
    id: 'sweeping_guard',
    name: 'Sweeping Guard',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'damage', amount: 3, target: 'allEnemies' }],
    // The same card is a sweep in IAI and a wall in GUARD.
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'block', amount: 6 }],
    },
    upgrade: {
      name: 'Sweeping Guard+',
      effects: [{ op: 'damage', amount: 5, target: 'allEnemies' }],
      stanceRider: {
        stance: 'guard',
        effects: [{ op: 'block', amount: 9 }],
      },
    },
    flavor: 'Everything in reach, and then back where it started.',
  },

  {
    id: 'coolant_burst',
    name: 'Coolant Burst',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'overheat',
    cost: 1,
    // Pays for the sweep by giving the gauge back. The hotter you are, the more
    // this card is worth — which is the opposite of every other Heat card.
    effects: [
      {
        op: 'scaleWith',
        source: 'currentHeat',
        per: 2,
        then: [{ op: 'damage', amount: 2, target: 'allEnemies' }],
      },
      { op: 'ventHeat', amount: 4 },
    ],
    upgrade: {
      name: 'Coolant Burst+',
      effects: [
        {
          op: 'scaleWith',
          source: 'currentHeat',
          per: 2,
          then: [{ op: 'damage', amount: 3, target: 'allEnemies' }],
        },
        { op: 'ventHeat', amount: 6 },
      ],
    },
    flavor: 'Everything the loop was holding, released at once and outward.',
  },

  {
    id: 'rusting_wind',
    name: 'Rusting Wind',
    type: 'attack',
    rarity: 'epic',
    archetype: 'neutral',
    cost: 2,
    /* Low damage, but the Rust runs on every one of them at once — the sweep
       that gets better the more things there are to hit.

       2 and 3, down from 3 and 4. Written when Rust was 1 damage a stack; at 2
       this was 6 unblockable a turn on every enemy on the board from one card,
       and it climbs, because a stack decays a turn and this lands three. */
    effects: [
      { op: 'damage', amount: 3, target: 'allEnemies' },
      { op: 'applyStatus', status: RUST, stacks: 2, target: 'allEnemies' },
    ],
    upgrade: {
      name: 'Rusting Wind+',
      effects: [
        { op: 'damage', amount: 5, target: 'allEnemies' },
        { op: 'applyStatus', status: RUST, stacks: 3, target: 'allEnemies' },
      ],
    },
    flavor: 'It does not cut. It starts something that finishes on its own.',
  },

  /* ---- the second batch ----
     Stance changing had one shape: change it and get a small thing. These are
     the versions where the change is the cost of something larger. */

  {
    id: 'weight_shift',
    name: 'Weight Shift',
    type: 'skill',
    /* Epic. A free Energy is the strongest line a 0-cost can print, and the
       stance change it is priced against is a cost only to a deck that cared
       where it was standing — which, for the deck that wants this card, is
       none of them. The Burn is what keeps it honest; the tier is what keeps
       it out of every second reward screen. */
    rarity: 'epic',
    archetype: 'neutral',
    cost: 0,
    exhaust: true,
    /* The Heat is what it costs. A free Energy for a stance change was a cost
       only to a deck that cared where it was standing — which, for the deck
       that wants this card, is none of them. Two Heat is a quarter of the gauge
       for a quarter of a turn, which is a trade you have to actually think
       about at 6. */
    /* And a point of Vulnerable, which is the honest half of the price.
     *
     * Heat alone was the wrong currency for this card: it is a NEUTRAL 0-cost
     * that hands you an Energy, and the decks that want a free Energy most are
     * the ones running the gauge on purpose — so its cost was a discount for
     * exactly the archetype it was strongest in. Vulnerable is a cost nothing
     * in the game rewards, so it lands the same on every deck.
     *
     * Last, after the Energy, because a self-applied debuff sheds at the end of
     * the round it was paid — see `applyStatus` in `effects.ts`. You take the
     * enemy phase under it and then it starts wearing off. */
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'gainEnergy', amount: 1 },
      { op: 'gainHeat', amount: 2 },
      { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'self' },
    ],
    upgrade: {
      name: 'Weight Shift+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'gainEnergy', amount: 1 },
        { op: 'gainHeat', amount: 2 },
        { op: 'draw', amount: 1 },
        { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'self' },
      ],
    },
    flavor: 'Once a fight the footing is free. After that you are paying for it.',
  },

  {
    id: 'the_turning',
    name: 'The Turning',
    type: 'skill',
    rarity: 'epic',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'draw', amount: 2 },
      { op: 'gainFocus', amount: 1 },
    ],
    upgrade: {
      name: 'The Turning+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'draw', amount: 2 },
        { op: 'gainFocus', amount: 2 },
      ],
    },
    flavor: 'The whole art, if you ask the wrong teacher, is knowing when.',
  },

  {
    id: 'breath_count',
    name: 'Breath Count',
    type: 'skill',
    rarity: 'common',
    archetype: 'iai',
    cost: 1,
    /* Vent 2, not 1. Two is the threshold that sheds a stack of Scald, so a
       common in the IAI pool is a real answer to the status IAI decks meet most
       — and a vent of 1 on a Focus card was a rounding error you never chose it
       for. */
    effects: [
      { op: 'gainFocus', amount: 2 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Breath Count+',
      effects: [
        { op: 'gainFocus', amount: 3 },
        { op: 'ventHeat', amount: 3 },
      ],
    },
    flavor: 'Four in, four held, four out. The rest of it is just fighting.',
  },

  {
    id: 'chained_draw',
    name: 'Chained Draw',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    effects: [
      { op: 'damage', amount: 4, target: 'enemy' },
      { op: 'draw', amount: 1 },
    ],
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'gainFocus', amount: 1 }],
    },
    upgrade: {
      name: 'Chained Draw+',
      effects: [
        { op: 'damage', amount: 6, target: 'enemy' },
        { op: 'draw', amount: 1 },
      ],
      stanceRider: {
        stance: 'iai',
        effects: [{ op: 'gainFocus', amount: 2 }],
      },
    },
    flavor: 'One motion that has not finished when the next one starts.',
  },

  {
    /* The Weak-cost utility card, the other half of the same idea.
     *
     * Weak belongs on cards that do NOT deal damage — on an attack it fights
     * the card it is printed on, and on a draw card it is a clean price: you
     * spent the turn reading instead of swinging, so you swing softer.
     *
     * Burns, and the reason is the stack cap. Weak stops at two, so a
     * repeatable card charging one stack stops paying after the second play —
     * within a single turn the third copy is free. On a card whose whole output
     * is more cards, that is an engine that pays its price once. Once per copy
     * keeps the cost real.
     */
    id: 'count_the_beats',
    name: 'Count the Beats',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    exhaust: true,
    effects: [
      { op: 'draw', amount: 3 },
      { op: 'applyStatus', status: WEAK, stacks: 1, target: 'self' },
    ],
    upgrade: {
      name: 'Count the Beats+',
      effects: [
        { op: 'draw', amount: 4 },
        { op: 'applyStatus', status: WEAK, stacks: 1, target: 'self' },
      ],
    },
    flavor: 'Four of them, always, and the fifth is where they stop being careful.',
  },

];
