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
import { RELIQUARY_EVENT } from './reliquary.ts';

export const EVENTS: readonly EventDef[] = [
  RELIQUARY_EVENT,
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
          { op: 'alloy', amount: 120 },
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
          { op: 'alloy', amount: 95 },
          { op: 'health', amount: -12 },
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
        detail: 'Eleven days of work, sold at the price of being desperate. They were not theirs to sell.',
        effects: [
          { op: 'alloy', amount: -40 },
          { op: 'setThread', threadId: 'borrowed_charts' },
        ],
        risk: 'Economic',
        payoff: 'Deferred',
      },
      {
        id: 'core',
        label: 'Take the drive core',
        detail: 'They cannot use it. Someone down the line will pay for it.',
        effects: [
          { op: 'alloy', amount: 105 },
          { op: 'health', amount: -13 },
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
          { op: 'alloy', amount: 60 },
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
          { op: 'alloy', amount: 130 },
          { op: 'health', amount: -14 },
          { op: 'setThread', threadId: 'coolant_leak' },
        ],
        risk: 'The ship',
        payoff: 'Immediate, the ship',
      },
      {
        id: 'hold',
        label: 'Strip the hold',
        detail: 'Whatever they were running, they were running a lot of it.',
        effects: [
          { op: 'alloy', amount: 40 },
          { op: 'health', amount: 8 },
        ],
        risk: 'None',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'log',
        label: 'Read the flight log',
        detail: 'You find out what they were carrying, and why they stopped.',
        effects: [
          { op: 'health', amount: 4 },
          { op: 'removeRandomCard' },
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
          { op: 'alloy', amount: 95 },
          { op: 'health', amount: -12 },
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
          { op: 'alloy', amount: -110 },
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
          { op: 'alloy', amount: 130 },
          { op: 'health', amount: -16 },
        ],
        risk: 'The body',
        payoff: 'Immediate, small',
      },
      {
        id: 'name',
        label: 'Give them the ship’s name',
        detail: 'They mark your hull instead of charging you. Everyone will know the mark.',
        effects: [
          { op: 'setThread', threadId: 'marked' },
          { op: 'card', cardId: 'syndicate_mark' },
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
        label: 'Eat with them',
        detail: 'They eat like someone who has forgotten it was an option. You sit down as well.',
        effects: [
          { op: 'alloy', amount: -80 },
          { op: 'health', amount: 10 },
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
          { op: 'alloy', amount: 130 },
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
          { op: 'alloy', amount: 95 },
          { op: 'health', amount: -12 },
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
          { op: 'health', amount: 9 },
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
          { op: 'alloy', amount: 145 },
          { op: 'health', amount: -18 },
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

  /* ---------- M6: the pool that stops a run repeating ----------
     An Anomaly is spent once per run, so ten of them meant most runs met the
     whole pool and Act 3 saw nothing new. These follow the same template: a
     named situation, three options answering different needs, and a leave that
     is genuinely worthless.

     Several carry an `acts` restriction. One that only appears late can assume
     you have a deck and some Alloy, which lets it ask a harder question than one
     that has to work on turn three of Act 1. */

  {
    id: 'the_quiet_transponder',
    name: 'The Quiet Transponder',
    body:
      'A sect beacon, still cycling its identification forty years after the sect stopped ' +
      'existing to be identified. It has been talking to nobody for longer than you have been ' +
      'alive. The codes still authenticate against your cutter.',
    options: [
      {
        id: 'answer',
        label: 'Answer it properly',
        detail: 'The response takes an hour, and the forms come back to you as you speak them.',
        effects: [{ op: 'setThread', threadId: 'sect_rites' }],
        risk: 'Unknown',
        payoff: 'Unknown',
      },
      {
        id: 'strip',
        label: 'Strip the transmitter',
        detail: 'Good parts, and nobody left to mind.',
        effects: [
          { op: 'alloy', amount: 55 },
        ],
        risk: 'None',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'listen',
        label: 'Listen to the whole loop',
        detail: 'Six hours of a dead voice naming stations. You learn where things were.',
        effects: [
          { op: 'upgradeRandomCard' },
          { op: 'health', amount: -6 },
        ],
        risk: 'Time',
        payoff: 'Immediate, specific',
      },
      {
        id: 'pass',
        label: 'Let it keep talking',
        detail: 'It has managed this long without an audience.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_stalled_convoy',
    name: 'The Stalled Convoy',
    body:
      'Nine haulers strung out along a burn they will not finish. Their escort left two days ' +
      'ago and did not say why. The convoy master is still transmitting a schedule nobody is ' +
      'keeping, on a channel nobody is answering.',
    options: [
      {
        id: 'escort',
        label: 'Escort them out',
        detail: 'Slow, visible, and someone will notice a cutter moving at hauler speed.',
        effects: [
          { op: 'alloy', amount: 120 },
          { op: 'setThread', threadId: 'marked' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, large',
      },
      {
        id: 'parts',
        label: 'Trade for their spares',
        detail: 'They have more drive parts than drive.',
        effects: [
          { op: 'alloy', amount: -60 },
          { op: 'health', amount: 8 },
        ],
        risk: 'None',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'take',
        label: 'Take what you need',
        detail: 'Nobody here is armed. That is the whole of the situation.',
        effects: [
          { op: 'alloy', amount: 60 },
          { op: 'maxHealth', amount: -4 },
        ],
        risk: 'Moral',
        payoff: 'Immediate, large',
      },
      {
        id: 'pass',
        label: 'Hold your burn',
        detail: 'The schedule they are keeping is not yours.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_cold_forge',
    name: 'The Cold Forge',
    body:
      'A weapons shop built into a hollowed asteroid, banked down to embers and left. The ' +
      'smith is not here. The work is: eleven blades at various stages, and notes in a hand ' +
      'that expected to come back.',
    options: [
      {
        id: 'relight',
        label: 'Relight it and finish one',
        detail: 'You are not a smith. You have watched enough of them to be dangerous.',
        effects: [
          { op: 'upgradeRandomCard' },
          { op: 'upgradeRandomCard' },
          { op: 'health', amount: -10 },
        ],
        risk: 'The body',
        payoff: 'Immediate, large',
      },
      {
        id: 'notes',
        label: 'Take the notes',
        detail: 'Somebody spent a life learning this. It fits in a pocket.',
        effects: [{ op: 'card', cardId: 'crossing_arc', upgraded: true }],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'strip',
        label: 'Strip the shop',
        detail: 'Tools, stock, and the good steel he never got to.',
        effects: [
          { op: 'alloy', amount: 115 },
          { op: 'setThread', threadId: 'yard_debt' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'pass',
        label: 'Bank it again and go',
        detail: 'You leave the embers where you found them.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_borrowed_registry',
    name: 'A Ship With Your Registry',
    acts: [2, 3],
    body:
      'It is flying under your registry, three digits off, and it has been running debts on ' +
      'it for a month. The pilot is apologetic in the way of someone who has done the ' +
      'arithmetic and decided you will not shoot.',
    options: [
      {
        id: 'collect',
        label: 'Collect what they owe you',
        detail: 'They pay. It is most of what they have, and they knew it was coming.',
        effects: [
          { op: 'alloy', amount: 75 },
        ],
        risk: 'None',
        payoff: 'Immediate, large',
      },
      {
        id: 'forgive',
        label: 'Let them keep the name',
        detail: 'Somebody, somewhere, updates a ledger about you.',
        effects: [{ op: 'setThread', threadId: 'navigators_favour' }],
        risk: 'Unknown',
        payoff: 'Unknown',
      },
      {
        id: 'swap',
        label: 'Trade registries',
        detail: 'Their debts, your clean name. The debts travel faster than you do.',
        effects: [
          { op: 'alloy', amount: 140 },
          { op: 'setThread', threadId: 'yard_debt' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, large',
      },
      {
        id: 'pass',
        label: 'Break off',
        detail: 'Three digits is enough distance for today.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_reactor_choir',
    name: 'The Reactor Choir',
    acts: [2, 3],
    body:
      'Forty people living inside a runaway reactor housing, singing to keep time with its ' +
      'cycle. They have been doing this for six years. They are not, as far as you can tell, ' +
      'in any distress about it.',
    options: [
      {
        id: 'learn',
        label: 'Learn the cycle',
        detail: 'You spend a day counting with them. Your own reactor sounds different after.',
        effects: [{ op: 'card', cardId: 'flashpoint' }],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'tap',
        label: 'Tap the housing',
        detail: 'There is more power here than forty people need in order to sing.',
        effects: [
          { op: 'alloy', amount: 55 },
          { op: 'setThread', threadId: 'coolant_leak' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, large',
      },
      {
        id: 'warn',
        label: 'Tell them what it is doing',
        detail: 'They already know. They thank you for the courtesy and keep singing.',
        effects: [
          { op: 'health', amount: 12 },
        ],
        risk: 'None',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'pass',
        label: 'Leave them to it',
        detail: 'Six years is a long time to be wrong about something.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_wrecking_field',
    name: 'The Wrecking Field',
    body:
      'Somebody has been towing dead ships here for years and stacking them by class. It is ' +
      'tidy in a way that suggests one person with a system and a great deal of time. There ' +
      'is no sign of the person.',
    options: [
      {
        id: 'salvage',
        label: 'Work the stacks',
        detail: 'Hours of it, in a suit, in the dark, and not unobserved.',
        effects: [
          { op: 'alloy', amount: 105 },
          { op: 'health', amount: -13 },
          { op: 'setThread', threadId: 'marked' },
        ],
        risk: 'The body, deferred',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'lighten',
        label: 'Leave something behind',
        detail: 'A form you never liked, filed away with the rest of the dead weight.',
        effects: [
          { op: 'removeRandomCard' },
          { op: 'alloy', amount: 40 },
        ],
        risk: 'None',
        payoff: 'Immediate, small',
      },
      {
        id: 'wait',
        label: 'Wait for whoever stacks them',
        detail: 'They arrive at the end of the second day, and are not pleased.',
        effects: [{ op: 'ambush', tier: 'elite' }],
        risk: 'A fight',
        payoff: 'Immediate, unknown',
      },
      {
        id: 'pass',
        label: 'Fly the lane and go',
        detail: 'Somebody has a filing system. It is not yours.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_long_orbit',
    name: 'The Long Orbit',
    body:
      'A one-seat courier on a ninety-year ellipse, still under power, still correcting. The ' +
      'pilot has been dead for most of it. The correction burns are perfect.',
    options: [
      {
        id: 'study',
        label: 'Study the burns',
        detail: 'Ninety years of somebody being exactly right, written in fuel.',
        effects: [{ op: 'card', cardId: 'long_form' }],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'fuel',
        label: 'Take the remaining fuel',
        detail: 'It ends the orbit. Nothing was going to meet it anyway.',
        effects: [
          { op: 'alloy', amount: 50 },
        ],
        risk: 'Moral',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'rites',
        label: 'Say the forms over them',
        detail: 'The sect had words for this. You are the only one left who knows them.',
        effects: [
          { op: 'health', amount: 7 },
          { op: 'setThread', threadId: 'sect_rites' },
        ],
        risk: 'Unknown',
        payoff: 'Unknown',
      },
      {
        id: 'pass',
        label: 'Let the orbit finish',
        detail: 'It has sixty years left and no need of you.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_pressure_auction',
    name: 'The Pressure Auction',
    acts: [2, 3],
    body:
      'A hab with failing life support, selling everything it owns before the air runs out. ' +
      'The auctioneer is calm and fast and has clearly done the arithmetic on how long she ' +
      'has. Prices drop every hour.',
    options: [
      {
        id: 'early',
        label: 'Buy early, pay full',
        detail: 'You take the good lot while there is still a good lot.',
        effects: [
          { op: 'alloy', amount: -120 },
          { op: 'card', cardId: 'unsheathed_mind' },
        ],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'late',
        label: 'Wait for the last hour',
        detail: 'Cheap, and you spend the wait breathing what they have left.',
        effects: [
          { op: 'alloy', amount: 110 },
          { op: 'health', amount: -14 },
        ],
        risk: 'The body',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'scrubber',
        label: 'Give them your spare scrubber',
        detail: 'They will not forget it, and they are the sort who write things down.',
        effects: [
          { op: 'setThread', threadId: 'navigators_favour' },
        ],
        risk: 'Unknown',
        payoff: 'Deferred',
      },
      {
        id: 'pass',
        label: 'Bid on nothing',
        detail: 'You watch a room sell its furniture, and you leave.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_mirror_wake',
    name: 'The Mirror Wake',
    acts: [3],
    body:
      'Your own drive signature, four hours old, on a heading you have not flown. Something ' +
      'out here is wearing your wake deliberately, and doing it well enough that the ' +
      'difference took you two passes to find.',
    options: [
      {
        id: 'hunt',
        label: 'Turn and hunt it',
        detail: 'Whatever is copying you is close enough to be caught.',
        effects: [{ op: 'ambush', tier: 'elite' }],
        risk: 'A fight',
        payoff: 'Immediate, unknown',
      },
      {
        id: 'feed',
        label: 'Feed it a false wake',
        detail: 'Let it follow something that is not there, and see who else follows it.',
        effects: [
          { op: 'alloy', amount: 55 },
          { op: 'setThread', threadId: 'marked' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'copy',
        label: 'Copy the copy',
        detail: 'It is flying you better than you do. That is worth knowing.',
        effects: [
          { op: 'upgradeRandomCard' },
          { op: 'health', amount: -8 },
        ],
        risk: 'The body',
        payoff: 'Immediate, specific',
      },
      {
        id: 'pass',
        label: 'Change heading',
        detail: 'Let it wear a wake that goes nowhere.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_field_surgeon',
    name: 'The Field Surgeon',
    body:
      'A medical tender working out of a converted ore hopper, taking anyone. The surgeon has ' +
      'not slept in a while and is entirely competent anyway. There is a queue.',
    options: [
      {
        id: 'treat',
        label: 'Take a bed',
        detail: 'Proper work, properly done, and it costs what proper work costs.',
        effects: [
          { op: 'alloy', amount: -90 },
          { op: 'health', amount: 11 },
        ],
        risk: 'None',
        payoff: 'Immediate, large',
      },
      {
        id: 'donate',
        label: 'Pay for the queue',
        detail: 'Eleven people who could not afford the bed you were about to take.',
        effects: [
          { op: 'alloy', amount: -140 },
          { op: 'maxHealth', amount: 8 },
          { op: 'setThread', threadId: 'navigators_favour' },
        ],
        risk: 'Unknown',
        payoff: 'Immediate, permanent',
      },
      {
        id: 'work',
        label: 'Hold instruments for a shift',
        detail: 'You learn where things are inside a person. It is applicable.',
        effects: [
          { op: 'card', cardId: 'pressure_cut' },
          { op: 'health', amount: 10 },
        ],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'pass',
        label: 'Keep your place in the lane',
        detail: 'The queue is long, and you are not the worst of it.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_archive_hulk',
    name: 'The Archive Hulk',
    body:
      'A library ship, holed and airless, its collection still racked and still readable. ' +
      'Whoever holed it did not stop to take anything, which tells you what they thought the ' +
      'contents were worth.',
    options: [
      {
        id: 'read',
        label: 'Read until your air runs low',
        detail: 'Forms, drills, and one manual on a stance nobody teaches now.',
        effects: [
          { op: 'upgradeRandomCard' },
          { op: 'health', amount: -7 },
        ],
        risk: 'The body',
        payoff: 'Immediate, specific',
      },
      {
        id: 'index',
        label: 'Take the index only',
        detail: 'Not the books. The list of where the books came from.',
        effects: [{ op: 'setThread', threadId: 'navigators_favour' }],
        risk: 'Unknown',
        payoff: 'Unknown',
      },
      {
        id: 'racks',
        label: 'File a claim on the hull',
        detail: 'The shelving is worth more than the collection. That is the joke. A claim takes weeks to clear.',
        effects: [{ op: 'setThread', threadId: 'salvage_claim' }],
        risk: 'Moral',
        payoff: 'Deferred, large',
      },
      {
        id: 'pass',
        label: 'Leave it racked',
        detail: 'Somebody may come who can read it properly.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_burning_lane',
    name: 'The Burning Lane',
    acts: [2, 3],
    body:
      'A transit lane running hot. Some cascade three months upstream is still arriving, and ' +
      'everything that flies it comes out the far side cooked. It is four days shorter than ' +
      'going around.',
    options: [
      {
        id: 'run',
        label: 'Run it hot',
        detail: 'Four days saved. The reactor will remember.',
        effects: [
          { op: 'alloy', amount: 55 },
          { op: 'setThread', threadId: 'coolant_leak' },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, large',
      },
      {
        id: 'shielded',
        label: 'Go slow and shielded',
        detail: 'You arrive intact, and a great deal later.',
        effects: [
          { op: 'health', amount: 8 },
        ],
        risk: 'None',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'tune',
        label: 'Tune the cutter to the lane',
        detail: 'Run the loop the way the lane wants it run, and learn something permanent.',
        effects: [
          { op: 'card', cardId: 'coolant_burst' },
          { op: 'health', amount: -9 },
        ],
        risk: 'The body',
        payoff: 'Immediate, specific',
      },
      {
        id: 'pass',
        label: 'Go around',
        detail: 'Four days is four days.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  /* ---- the Voided batch ----

     These exist because of a shape the pool kept producing and could not
     price: an option that hands you something for nothing. A free 150 Alloy is
     not a decision, and neither is a free relic — so the ones that should have
     been the tempting, ugly choice were just the correct one.

     A Voided card is the cost the reward screen cannot express. It is not
     damage you heal off and it is not Alloy you earn back: it is a slot in
     every hand it turns up in, for the rest of the run, and a removal fee to
     end that. The only price in the game that gets worse the longer you leave
     it, which is exactly the shape a bad decision should have.

     The rule these are written to: the Voided option is always the one that
     costs somebody ELSE something. The player is never punished for taking a
     risk, only for taking the way out that somebody else pays for. */

  {
    id: 'the_lifeboat',
    name: 'The Lifeboat',
    body:
      'A hauler is coming apart two hundred kilometres off your beam, and its lifeboat is ' +
      'already burning toward you. Your hold takes four. The boat is carrying eleven, and ' +
      'the pilot is on the open channel asking you to confirm you have room.',
    options: [
      {
        id: 'take_four',
        label: 'Take four and burn',
        detail: 'You pick four. You do not explain the arithmetic and nobody asks you to.',
        effects: [
          { op: 'alloy', amount: 180 },
          { op: 'card', cardId: 'voided_the_witness' },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, large',
      },
      {
        id: 'take_all',
        label: 'Take all eleven',
        detail: 'Seven of them ride in the hold with the coolant, and it costs you the trim.',
        effects: [
          { op: 'health', amount: -14 },
          { op: 'setThread', threadId: 'quiet_repair' },
        ],
        risk: 'The body',
        payoff: 'Deferred',
      },
      {
        id: 'tow',
        label: 'Tow the boat instead',
        detail: 'Slower, heavier, and everybody stays where they are — including the one who keeps talking.',
        effects: [
          { op: 'health', amount: -6 },
          { op: 'setThread', threadId: 'the_passenger' },
        ],
        risk: 'The body',
        payoff: 'Deferred',
      },
      {
        id: 'leave',
        label: 'Hold your heading',
        detail: 'You were never on that channel.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_relay_station',
    name: 'The Relay',
    body:
      'A collapse-warning relay, still transmitting, still crewed by two people who have not ' +
      'been resupplied in a hundred days. Its power cells are the exact spec your cutter takes.',
    acts: [2, 3],
    options: [
      {
        id: 'strip_cells',
        label: 'Take the cells',
        detail: 'The relay goes quiet nine minutes after you leave. It was warning somebody.',
        effects: [
          { op: 'alloy', amount: 150 },
          { op: 'maxHealth', amount: 8 },
          { op: 'card', cardId: 'voided_scorched_lane' },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, large',
      },
      {
        id: 'resupply',
        label: 'Give them what you can spare',
        detail: 'Water, two weeks of rations, and the last of your good sealant.',
        effects: [
          { op: 'alloy', amount: -90 },
          { op: 'setThread', threadId: 'navigators_favour' },
        ],
        risk: 'Economic',
        payoff: 'Deferred',
      },
      {
        id: 'listen',
        label: 'Sit and listen to the feed',
        detail: 'Six hours of collapse telemetry. You come away knowing where not to be.',
        effects: [{ op: 'upgradeRandomCard' }],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'leave',
        label: 'Acknowledge and move on',
        detail: 'You send the receipt they are legally owed and nothing else.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_debt_collector',
    name: 'The Collector',
    body:
      'A thin man in a good coat is waiting at the mooring with a ledger and no visible weapon. ' +
      'He is not here for you. He is here for the family two berths down, and he would like a ' +
      'lift out afterwards.',
    acts: [2, 3],
    options: [
      {
        id: 'drive',
        label: 'Give him the lift',
        detail: 'You do not watch the berth. You hear it, though, and you hear it clearly.',
        effects: [
          { op: 'alloy', amount: 110 },
          { op: 'card', cardId: 'voided_the_debt' },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, large',
      },
      {
        id: 'warn',
        label: 'Warn the berth',
        detail: 'Nine minutes of head start, which is more than they had.',
        effects: [
          { op: 'setThread', threadId: 'marked' },
          { op: 'health', amount: 12 },
        ],
        risk: 'Deferred',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'buy',
        label: 'Settle their book yourself',
        detail: 'He is genuinely surprised, writes it off, and hands you the page.',
        effects: [
          { op: 'alloy', amount: -160 },
          { op: 'maxHealth', amount: 12 },
        ],
        risk: 'Economic',
        payoff: 'Permanent',
      },
      {
        id: 'leave',
        label: 'Cast off early',
        detail: 'The mooring fees are somebody else’s problem now.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_open_channel',
    name: 'The Open Channel',
    body:
      'Somebody is broadcasting the collapse front’s real position, unencrypted, to anyone who ' +
      'will listen. A syndicate cutter is triangulating them and is offering good money for a ' +
      'second bearing to cross with.',
    options: [
      {
        id: 'give_bearing',
        label: 'Give the bearing',
        detail: 'It takes eleven seconds. The broadcast stops about an hour later.',
        effects: [
          { op: 'alloy', amount: 100 },
          { op: 'card', cardId: 'voided_the_name' },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, large',
      },
      {
        id: 'jam',
        label: 'Jam the triangulation',
        detail: 'You put your own reactor noise across the band until they give up.',
        effects: [
          { op: 'health', amount: -11 },
          { op: 'setThread', threadId: 'navigators_favour' },
        ],
        risk: 'The body',
        payoff: 'Deferred',
      },
      {
        id: 'listen_front',
        label: 'Just write down the front’s position',
        detail: 'It is good data and it was free, which should have been the first clue.',
        effects: [{ op: 'card', cardId: 'dead_reckoning' }],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'leave',
        label: 'Close the channel',
        detail: 'Not your band, not your war.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_ration_queue',
    name: 'The Queue',
    body:
      'Four hundred people on a rock with eleven days of air, and a station master with a list. ' +
      'Your cutter is the only hull in the system with a working scrubber, and he is willing to ' +
      'discuss what that is worth.',
    options: [
      {
        id: 'sell_scrubber',
        label: 'Sell him the scrubber',
        detail: 'Eleven days becomes forty. Your own air gets a great deal more interesting.',
        effects: [
          { op: 'alloy', amount: 130 },
          { op: 'health', amount: -16 },
        ],
        risk: 'The body',
        payoff: 'Immediate, large',
      },
      {
        id: 'take_list',
        label: 'Buy a place at the top of the list',
        detail: 'Somebody at the bottom of it moves down four hundred places.',
        effects: [
          { op: 'alloy', amount: -60 },
          { op: 'health', amount: 8 },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, moderate',
      },
      {
        id: 'run_ferry',
        label: 'Run the ferry yourself',
        detail: 'Nine trips, no cargo, and a fortnight you were not going to get back anyway.',
        effects: [
          { op: 'health', amount: -8 },
          { op: 'setThread', threadId: 'quiet_repair' },
        ],
        risk: 'The body',
        payoff: 'Deferred',
      },
      {
        id: 'leave',
        label: 'Undock',
        detail: 'The list was never going to have your name on it.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_slow_wreck',
    name: 'The Slow Wreck',
    body:
      'A sect cutter, your own pattern, drifting with its lights still on and one life sign ' +
      'that has not moved in a long time. The reactor is intact. So is the pilot, technically.',
    acts: [2, 3],
    options: [
      {
        id: 'take_reactor',
        label: 'Cut the reactor free',
        detail: 'It takes six hours and the life sign stops somewhere in the middle of it.',
        effects: [
          { op: 'alloy', amount: 140 },
          { op: 'card', cardId: 'voided_dead_weight' },
          { op: 'maxHealth', amount: 10 },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, large',
      },
      {
        id: 'wake',
        label: 'Wake them',
        detail: 'They are not grateful and they are not lucid, but they know the old forms.',
        effects: [
          { op: 'health', amount: -10 },
          { op: 'setThread', threadId: 'sect_rites' },
        ],
        risk: 'The body',
        payoff: 'Deferred',
      },
      {
        id: 'rites',
        label: 'Say the rites and let it drift',
        detail: 'The whole thing, out loud, to nobody, exactly as you were taught.',
        effects: [
          { op: 'upgradeRandomCard' },
          { op: 'removeRandomCard' },
        ],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'leave',
        label: 'Log the position and go',
        detail: 'Somebody with more time will find it.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  /* ---- three more places to kneel ----

     The Rites became repeatable and the artifact became the reward for saying
     them three times in one run, which made the number of shrines a balance
     figure rather than flavour. Five events offered them; a route that takes
     every Anomaly it can reach sees about seventeen, so five sources meant the
     third kneeling was mostly a dice roll about which events the pool handed
     you. Eight makes it a route you can decide to take.

     None of them is a shrine. A rite said over a corpse, a rite said into a
     recorder and a rite said back to you by something that is not a person are
     three different scenes, and the third one is meant to be unpleasant. */

  {
    id: 'the_ossuary_drum',
    name: 'The Ossuary Drum',
    body:
      'A sect burial drum, tumbling end over end where somebody let go of it. Forty-one names ' +
      'are cut into the rim and the last four are unfinished — whoever was cutting them was ' +
      'interrupted and did not come back to it.',
    options: [
      {
        id: 'finish',
        label: 'Finish the names, then say the rites',
        detail: 'You do not know the last four. You say them the way they should have been.',
        effects: [{ op: 'setThread', threadId: 'sect_rites' }],
        risk: 'None',
        payoff: 'Deferred',
      },
      {
        id: 'strip',
        label: 'Strip the drum',
        detail: 'It is good alloy and it is doing nothing where it is.',
        effects: [{ op: 'alloy', amount: 95 }],
        risk: 'None',
        payoff: 'Immediate, small',
      },
      {
        id: 'match',
        label: 'Match its spin and ride alongside',
        detail:
          'Four hours matching a dead man’s tumble. You arrive at the next thing already tired ' +
          'and already steadier.',
        effects: [
          { op: 'health', amount: -8 },
          { op: 'upgradeRandomCard' },
        ],
        risk: 'The body',
        payoff: 'Immediate, specific',
      },
      {
        id: 'leave',
        label: 'Let it tumble',
        detail: 'It has somewhere to be and it is going there.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_last_recording',
    name: 'The Last Recording',
    body:
      'A survey drone has been holding station over nothing for eleven years, transmitting the ' +
      'same forty seconds. It is one of yours, halfway through the rites, and it stops in the ' +
      'middle of a name because that is where the recording ended.',
    options: [
      {
        id: 'answer',
        label: 'Say the rest of it back',
        detail: 'The drone has no receiver. You say it anyway, from the name it stopped on.',
        effects: [{ op: 'setThread', threadId: 'sect_rites' }],
        risk: 'None',
        payoff: 'Deferred',
      },
      {
        id: 'wipe',
        label: 'Wipe it and take the drone',
        detail:
          'Eleven years of station-keeping fuel, and a transmitter that has been on the whole ' +
          'time. Both are worth more than the recording.',
        effects: [
          { op: 'alloy', amount: 130 },
          { op: 'setThread', threadId: 'marked' },
        ],
        risk: 'Attention',
        payoff: 'Immediate, large',
      },
      {
        id: 'listen',
        label: 'Listen to all of it, several times',
        detail: 'There is a way they hold the third line that you had forgotten.',
        effects: [{ op: 'card', cardId: 'the_dead_sect', upgraded: true }],
        risk: 'None',
        payoff: 'Immediate, specific',
      },
      {
        id: 'leave',
        label: 'Fly past it',
        detail: 'It will keep saying it. That is the only thing it does now.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },

  {
    id: 'the_reciting_hull',
    name: 'The Reciting Hull',
    acts: [2, 3],
    body:
      'Something has been chewing a cutter apart for a long time, and it has learned the shape ' +
      'of what the crew said while it did. It is saying the rites now, in the right order, in ' +
      'four voices at once, and none of the four are breathing.',
    options: [
      {
        id: 'correct',
        label: 'Say them correctly, over it',
        detail:
          'It has the seventh and eighth lines the wrong way round. You will not leave that ' +
          'standing, whatever is doing it.',
        effects: [
          { op: 'health', amount: -9 },
          { op: 'setThread', threadId: 'sect_rites' },
        ],
        risk: 'The body',
        payoff: 'Deferred',
      },
      {
        id: 'silence',
        label: 'Silence it',
        detail: 'It does not stop when the hull comes apart. It stops some time after.',
        effects: [{ op: 'ambush', tier: 'combat' }],
        risk: 'A fight, now',
        payoff: 'Immediate, specific',
      },
      {
        id: 'record',
        label: 'Record the four voices',
        detail:
          'Somebody at a yard will pay for this and will not ask what it is. You will know.',
        /* 15 Alloy a point of max health, which is the run-wide rate. */
        effects: [
          { op: 'alloy', amount: 90 },
          { op: 'maxHealth', amount: -6 },
        ],
        risk: 'Permanent',
        payoff: 'Immediate, large',
      },
      {
        id: 'leave',
        label: 'Run silent past it',
        detail: 'It is still going when the signal drops below the noise floor.',
        effects: [],
        isLeave: true,
        risk: 'None',
        payoff: 'None',
      },
    ],
  },
];
