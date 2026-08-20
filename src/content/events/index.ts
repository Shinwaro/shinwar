/* Anomaly events.
 *
 * The template, from DESIGN.md §4, and the validator enforces most of it:
 *
 *   1. A specific, named situation. Never "you find a crate."
 *   2. Three options that answer different needs — power, economy, safety,
 *      information. Not three sizes of the same answer.
 *   3. Legible risk categories rather than hidden dice. The player should be
 *      able to tell what KIND of thing might happen, even when the amount is
 *      deferred. Nothing here rolls a die on the player behind their back:
 *      every option states exactly what it does now, and the uncertainty lives
 *      in the Threads it opens.
 *   4. At least one option that defers its consequence into a Thread.
 *
 * And the rule that makes the other three work: **"Leave" is always available
 * and always genuinely worthless.** It is what makes the rest read as decisions
 * rather than a slot machine you are forced to pull. Never give it a
 * consolation prize.
 *
 * `detail` is hand-written framing. The mechanical line under it is GENERATED
 * from `effects` by `describeRunEffects()` — the same rule as card text, for
 * the same reason.
 *
 * 10 events at M4. The pool scales to ~35 at M6.
 */

import type { EventDef } from '../../engine/types.ts';

export const EVENTS: readonly EventDef[] = [
  {
    id: 'the_last_clutch',
    name: 'The Last Clutch',
    body:
      'Three Vareth in a hab-shell barely holding pressure. Their translator is crude and the ' +
      'meaning is not: this is the final viable egg of their species, and they are asking you, ' +
      'a stranger with a sword, to carry it somewhere safe.',
    options: [
      {
        id: 'escort',
        label: 'Escort it',
        detail: 'Nothing now. It will ask for something later.',
        effects: [{ op: 'setThread', threadId: 'the_clutch' }],
        risk: 'Unknown',
        payoff: 'Unknown',
      },
      {
        id: 'sell',
        label: 'Sell it to the Syndicate',
        detail: 'They are two lanes over and they have been asking.',
        effects: [
          { op: 'alloy', amount: 120 },
          { op: 'setThread', threadId: 'marked' },
        ],
        risk: 'Low now',
        payoff: 'Immediate, large',
      },
      {
        id: 'break',
        label: 'Break the shell',
        detail: 'The chitin is stronger than anything in your kit.',
        effects: [
          { op: 'card', cardId: 'vareth_chitin_edge' },
          { op: 'setThread', threadId: 'marked' },
        ],
        risk: 'Moral',
        payoff: 'Immediate, specific',
      },
      {
        id: 'leave',
        label: 'Leave them',
        detail: 'The shell will hold a while yet. Probably.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_yard',
    name: 'Kell Yard',
    body:
      'A repair yard bolted to a dead freighter, run by someone who calls you "captain" without ' +
      'once looking up from the ledger. They do good work. They also do credit.',
    options: [
      {
        id: 'credit',
        label: 'Open a line of credit',
        detail: 'You sign for it. They keep the paperwork, and a courier.',
        effects: [
          { op: 'alloy', amount: 140 },
          { op: 'setThread', threadId: 'yard_debt' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, large',
      },
      {
        id: 'plate',
        label: 'Sell them your spare plating',
        detail: 'The cutter flies lighter. It also flies thinner.',
        effects: [
          { op: 'health', amount: -9 },
          { op: 'alloy', amount: 75 },
        ],
        risk: 'The ship',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'shift',
        label: 'Work a shift on the line',
        detail: 'Sixteen hours under someone else’s hull. You learn something.',
        effects: [
          { op: 'health', amount: -9 },
          { op: 'upgradeRandomCard' },
        ],
        risk: 'The body',
        payoff: 'Permanent, small',
      },
      {
        id: 'leave',
        label: 'Fly on',
        detail: 'They do not look up when you undock either.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_becalmed_navigator',
    name: 'The Becalmed',
    body:
      'A courier hull with no drive signature, running on cabin light. The pilot has been ' +
      'plotting the same three systems for eleven days because there is nothing else to do ' +
      'with a mind that only knows how to plot.',
    options: [
      {
        id: 'fuel',
        label: 'Give them your reserve',
        detail: 'Enough to reach a lane. Not enough that you will enjoy the next stretch.',
        effects: [
          { op: 'alloy', amount: -70 },
          { op: 'setThread', threadId: 'navigators_favour' },
        ],
        risk: 'Economic',
        payoff: 'Deferred',
      },
      {
        id: 'charts',
        label: 'Buy the charts',
        detail: 'Eleven days of work, sold at the price of being desperate.',
        effects: [
          { op: 'alloy', amount: -40 },
          { op: 'card', cardId: 'dead_reckoning' },
        ],
        risk: 'Economic',
        payoff: 'Immediate, specific',
      },
      {
        id: 'core',
        label: 'Take the drive core',
        detail: 'They cannot use it. Someone down the line will pay for it.',
        effects: [
          { op: 'alloy', amount: 190 },
          { op: 'health', amount: -6 },
        ],
        risk: 'Moral',
        payoff: 'Immediate, the ship',
      },
      {
        id: 'leave',
        label: 'Hold your heading',
        detail: 'They do not hail. They are past hailing.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_shrine',
    name: 'A Shrine of the Dead Sect',
    body:
      'Someone cut your order’s mark into a rock the size of a hab-block and left a blade in ' +
      'it. The mark is correct down to the stroke order. Whoever did it knew, and whoever did ' +
      'it is not here.',
    options: [
      {
        id: 'kneel',
        label: 'Say the rites',
        detail: 'All of it. Every name, in order, to nobody.',
        effects: [{ op: 'setThread', threadId: 'sect_rites' }],
        risk: 'None',
        payoff: 'Deferred',
      },
      {
        id: 'blade',
        label: 'Take the blade',
        detail: 'It comes out of the rock the way it went in.',
        effects: [
          { op: 'card', cardId: 'the_dead_sect' },
          { op: 'health', amount: -12 },
        ],
        risk: 'The body',
        payoff: 'Immediate, large',
      },
      {
        /* A free rest, deliberately: the Safe Planet is the only other place to
           recover and a route may not offer one. Small enough that it is not a
           replacement for routing toward the rest you actually need. */
        id: 'vigil',
        label: 'Sit with it a while',
        detail: 'Nobody has swept the floor in eleven years. You sweep the floor.',
        effects: [{ op: 'health', amount: 12 }],
        risk: 'None',
        payoff: 'Immediate, small',
      },
      {
        id: 'burn',
        label: 'Strip it and sell the alloy',
        detail: 'It is a rock with a good metal seam and no one left to be offended.',
        effects: [
          { op: 'alloy', amount: 110 },
          { op: 'maxHealth', amount: -4 },
        ],
        risk: 'Something you will not name',
        payoff: 'Immediate, large',
      },
      {
        id: 'leave',
        label: 'Log the position and go',
        detail: 'It will be here. Everything out here is here for a long time.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_derelict_cutter',
    name: 'A Cutter Like Yours',
    body:
      'Same class, same salvage refit, same scorch pattern along the dorsal seam. The pilot is ' +
      'not aboard and the airlock was opened from inside.',
    options: [
      {
        id: 'reactor',
        label: 'Cut out the reactor',
        detail: 'It is worth more than the ship it came out of. Cutting it free costs you.',
        effects: [
          { op: 'alloy', amount: 210 },
          { op: 'health', amount: -6 },
          { op: 'setThread', threadId: 'coolant_leak' },
        ],
        risk: 'The ship',
        payoff: 'Immediate, the ship',
      },
      {
        id: 'hold',
        label: 'Strip the hold',
        detail: 'Whatever they were running, they were running a lot of it.',
        effects: [{ op: 'alloy', amount: 85 }],
        risk: 'None',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'log',
        label: 'Read the flight log',
        detail: 'You find out what they were carrying, and why they stopped.',
        effects: [
          { op: 'removeRandomCard' },
          { op: 'health', amount: 8 },
        ],
        risk: 'The deck',
        payoff: 'Information',
      },
      {
        id: 'leave',
        label: 'Do not board it',
        detail: 'The airlock was opened from inside. That is the whole reason.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_ember_field',
    name: 'The Ember Field',
    body:
      'A debris field still burning off reactor slag from something that came apart here a ' +
      'decade ago. It is full of good metal and it is the temperature of a foundry floor.',
    options: [
      {
        id: 'run_hot',
        label: 'Run it hot',
        detail: 'Straight through, grabbing what the grapples can hold.',
        effects: [
          { op: 'health', amount: -8 },
          { op: 'alloy', amount: 90 },
        ],
        risk: 'The ship',
        payoff: 'Immediate, large',
      },
      {
        id: 'creep',
        label: 'Cool the drive and creep',
        detail: 'Two days at a crawl. You spend them on the forge bench.',
        effects: [
          { op: 'health', amount: -8 },
          { op: 'upgradeRandomCard' },
        ],
        risk: 'The body',
        payoff: 'Permanent, small',
      },
      {
        id: 'vent',
        label: 'Vent coolant to cross',
        detail: 'It works. The loop is never quite right afterwards.',
        effects: [
          { op: 'alloy', amount: 60 },
          { op: 'setThread', threadId: 'coolant_leak' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'leave',
        label: 'Go around',
        detail: 'It costs you nothing but the distance.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_toll_gate',
    name: 'The Toll',
    body:
      'A scav clan has strung a net of dead satellites across the only clean lane out of this ' +
      'system and put a woman with a loudhailer in front of it. She sounds bored, and reasonable.',
    options: [
      {
        id: 'pay',
        label: 'Pay the toll',
        detail: 'They throw in the field medicine. They are not monsters, they are a business.',
        effects: [
          { op: 'alloy', amount: -80 },
          { op: 'health', amount: 14 },
        ],
        risk: 'Economic',
        payoff: 'Immediate, the body',
      },
      {
        id: 'cut',
        label: 'Cut through',
        detail: 'The net is dead satellites. The people are not.',
        effects: [
          { op: 'health', amount: -14 },
          { op: 'alloy', amount: 40 },
        ],
        risk: 'The body',
        payoff: 'Immediate, small',
      },
      {
        id: 'name',
        label: 'Give them the ship’s name',
        detail: 'They mark your hull instead of charging you. Everyone will know the mark.',
        effects: [
          { op: 'alloy', amount: 90 },
          { op: 'card', cardId: 'syndicate_mark' },
          { op: 'setThread', threadId: 'marked' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, large',
      },
      {
        id: 'leave',
        label: 'Take the long lane',
        detail: 'Nothing out there but distance.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_hollow_pilgrim',
    name: 'The Hollow Pilgrim',
    body:
      'A pilgrim of an order that outlived yours by four years, walking a decompressed ring ' +
      'station in a suit two sizes too large. They recognise your stance before your face.',
    options: [
      {
        id: 'kneel',
        label: 'Keep the vigil with them',
        detail: 'Their rites are not yours. They are close enough to hurt.',
        effects: [{ op: 'setThread', threadId: 'sect_rites' }],
        risk: 'None',
        payoff: 'Deferred',
      },
      {
        id: 'feed',
        label: 'Feed them',
        detail: 'They eat like someone who has forgotten it was an option.',
        effects: [
          { op: 'alloy', amount: -50 },
          { op: 'health', amount: 18 },
        ],
        risk: 'Economic',
        payoff: 'Immediate, the body',
      },
      {
        id: 'trade',
        label: 'Trade forms',
        detail: 'You give up a habit to learn one. It is not a fair swap and both of you know it.',
        effects: [
          { op: 'removeRandomCard' },
          { op: 'card', cardId: 'crossing_arc' },
        ],
        risk: 'The deck',
        payoff: 'Immediate, specific',
      },
      {
        id: 'leave',
        label: 'Let them walk',
        detail: 'They have been walking it a while.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_scav_market',
    name: 'Market With No Station',
    body:
      'Eleven hulls holding formation in open space with their cargo bays facing inward. No ' +
      'dock, no fees, no questions, and nothing on offer twice.',
    options: [
      {
        id: 'credit',
        label: 'Buy on credit',
        detail: 'They are selling below value and smiling about it. That is the tell.',
        effects: [
          { op: 'alloy', amount: 160 },
          { op: 'setThread', threadId: 'yard_debt' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, the ship',
      },
      {
        id: 'plating',
        label: 'Sell your spare plating',
        detail: 'A thinner hull and a heavier account.',
        effects: [
          { op: 'health', amount: -8 },
          { op: 'alloy', amount: 80 },
        ],
        risk: 'The ship',
        payoff: 'Immediate, moderate',
      },
      {
        /* Somewhere other than the Station to turn Alloy into health. The
           Station's patch is 150 for half your maximum; this is smaller and
           dearer per point, because a market stall is not a medical bay — but
           it is here, and the Station may be three nodes away. */
        id: 'supplies',
        label: 'Buy field supplies',
        detail: 'Sealant, sutures, and something that smells like it works.',
        effects: [
          { op: 'alloy', amount: -70 },
          { op: 'health', amount: 16 },
        ],
        risk: 'None',
        payoff: 'Immediate, small',
      },
      {
        id: 'memory',
        label: 'Sell a form of the sect',
        detail: 'They record you doing it. You will not do it the same way again.',
        effects: [
          { op: 'removeRandomCard' },
          { op: 'alloy', amount: 110 },
        ],
        risk: 'The deck',
        payoff: 'Immediate, large',
      },
      {
        id: 'leave',
        label: 'Buy nothing',
        detail: 'Eleven hulls watch you go without changing formation.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },

  {
    id: 'the_wavefront_echo',
    name: 'Echo of the Wavefront',
    body:
      'The front is nowhere near here yet and this is not the front. It is the sound of it ' +
      'arriving somewhere else, three months ago, still travelling.',
    options: [
      {
        id: 'outrun',
        label: 'Burn ahead of it',
        detail: 'You reach the next field before anyone else does. It costs the drive.',
        effects: [
          // One health cost, not two. Deleting ship hull turned this option's
          // hull price into a health price and it already had one, so it
          // charged the player twice for the same decision.
          { op: 'health', amount: -14 },
          { op: 'alloy', amount: 130 },
        ],
        risk: 'Both',
        payoff: 'Immediate, large',
      },
      {
        id: 'shelter',
        label: 'Shelter behind the moon',
        detail: 'Six quiet hours with a whetstone and nothing to do.',
        effects: [{ op: 'upgradeRandomCard' }],
        risk: 'None',
        payoff: 'Permanent, small',
      },
      {
        id: 'ride',
        label: 'Let it wash over the hull',
        detail: 'You feel it in your teeth. The reactor learns something from it.',
        effects: [
          { op: 'maxHealth', amount: -5 },
          { op: 'card', cardId: 'runaway_bloom' },
          { op: 'setThread', threadId: 'coolant_leak' },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, large',
      },
      {
        id: 'leave',
        label: 'Note it and move',
        detail: 'It is three months old and it is not for you.',
        effects: [],
        risk: 'None',
        payoff: 'None',
        isLeave: true,
      },
    ],
  },
];
