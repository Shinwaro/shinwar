/* What a card sounds like, from what it does.
 *
 * Not a table of card ids. A hundred cards with a hand-assigned sound each is a
 * list that is wrong the day somebody adds the hundred-and-first, and the whole
 * reason the rules text is generated is that hand-maintained parallel data
 * drifts. So this reads the effect ops — the same ops `describeCard` reads — and
 * decides from the SHAPE.
 *
 * The shapes were named by Robin, one example card each:
 *
 *   mini attack        one target, free            Hairline
 *   small attack       one target, 1 Energy        Deferred Burn
 *   big attack         one target, 2+              Sever
 *   multi-hit          the same target, repeatedly Empty the Rack, Momentum
 *   small AoE          the room, cheap             Fanned Cut
 *   big AoE            the room, 2+                Clean Sweep
 *   AoE multi-hit      the room, repeatedly        Broken Formation
 *   debuff attack      a hit that leaves something Rust Bloom, Point of Release
 *   debuff AoE         the same, to the room       Starfall, Rusting Wind
 *   IAI                anything with an IAI rider  IAI Slash
 *   shield             Block, and only Block       Solar Shield, Bulwark
 *   shield special     Block and more than Block   Stillwater Guard
 *   strength           Strength on yourself
 *   overclocked        a Power                     Overclock the Core
 *   focus / energy     the resource it hands you
 *
 * A card is one sound, at the moment it is played. What it then DOES to the
 * gauge keeps its own voice on its own beat — Sever is the attack, then the
 * Heat, then the vent — because those are events with animations attached and
 * the card announcing itself is not.
 */

import type { CardDef, EffectOp } from '../engine/types.ts';
import { OVERCLOCK, STRENGTH } from '../content/statuses.ts';
import type { SoundKey } from './sound.ts';

interface Shape {
  damage: boolean;
  aoe: boolean;
  multi: boolean;
  /** A status put on the OTHER side. A Scald you take yourself is a cost. */
  debuff: boolean;
  block: boolean;
  focus: boolean;
  energy: boolean;
  strength: boolean;
  overclock: boolean;
  /** Anything at all besides Block, for telling a plain shield from a special. */
  extras: boolean;
}

function walk(ops: readonly EffectOp[], into: Shape): void {
  for (const op of ops) {
    switch (op.op) {
      case 'damage':
        into.damage = true;
        if (op.target === 'allEnemies') into.aoe = true;
        if ((op.times ?? 1) > 1) into.multi = true;
        break;

      case 'applyStatus':
        if (op.target === 'enemy' || op.target === 'allEnemies') {
          into.debuff = true;
          into.extras = true;
        } else if (op.status === STRENGTH) {
          into.strength = true;
          into.extras = true;
        } else if (op.status === OVERCLOCK) {
          into.overclock = true;
          into.extras = true;
        } else {
          into.extras = true;
        }
        break;

      case 'block':
        into.block = true;
        break;

      case 'gainFocus':
        into.focus = true;
        into.extras = true;
        break;

      case 'gainEnergy':
        into.energy = true;
        into.extras = true;
        break;

      /* Into the branches. A card whose damage lives inside a conditional is
         still an attack — The Last Plate is a shield whichever way its own
         question resolves, and Nothing Left to Lose is an attack. */
      case 'conditional':
        walk(op.then, into);
        walk(op.else ?? [], into);
        break;

      /* "For every card discarded, deal 2" is a multi-hit — it is one op in the
         data and several blows on the board, which is what the sound is about.
         Empty the Rack and Momentum are exactly this and read as nothing else. */
      case 'scaleWith': {
        const damageBefore = into.damage;
        walk(op.then, into);
        if (into.damage !== damageBefore || into.damage) into.multi = true;
        break;
      }

      default:
        into.extras = true;
        break;
    }
  }
}

/**
 * The one sound this card makes when it is played.
 *
 * `rider` is WHICH stance's bonus fired, or null — not a property of the card,
 * because it depends on where you were standing when you played it.
 *
 * Which stance matters, and taking a boolean here was a bug: Sever's rider is
 * GUARD venting 2 Heat, so every Sever played in GUARD came out with the IAI
 * sound. The IAI voice belongs to the IAI bonus and to nothing else.
 */
export function cardVoice(def: CardDef, rider: string | null): SoundKey {
  const shape: Shape = {
    damage: false,
    aoe: false,
    multi: false,
    debuff: false,
    block: false,
    focus: false,
    energy: false,
    strength: false,
    overclock: false,
    extras: false,
  };
  walk(def.effects, shape);

  const cost = def.cost === 'X' ? 2 : def.cost;

  /* A card that only applies something, and applies it to THEM, is a debuff
     card whether or not it also swings — Rust Bloom does nothing but put Rust
     on the room and belongs with Point of Release rather than with the skills
     that shuffle your own deck. */
  if (!shape.damage && shape.debuff) return 'atkDebuff';

  if (shape.damage) {
    /* The stance bonus wins over the shape. A card that hits harder because of
       where you are standing is that card, whatever else it is doing — which is
       the whole reason IAI has a sound of its own. */
    if (rider === 'iai') return 'cardAttackIai';

    /* The same swing, one phase of it.
     *
     * A card with an IAI rider is written as two beats and sounds like two
     * beats — but out of IAI the second beat never happens, and it was falling
     * through to the generic small-attack sound, which made the same card two
     * completely unrelated noises depending on where you were standing. This is
     * the matched single-phase version: recognisably the same blade, once.
     *
     * Keyed off the rider's STANCE rather than off a card id, so every card
     * built on the two-phase IAI shape gets the pair without anyone
     * remembering to wire it. */
    if (def.stanceRider?.stance === 'iai') return 'cardAttackIaiSolo';

    if (shape.aoe) {
      if (shape.multi) return 'atkAoeMultihit';
      if (shape.debuff) return 'atkDebuffAoe';
      return cost >= 2 ? 'atkAoeBig' : 'atkAoeSmall';
    }
    if (shape.multi) return 'atkMultihit';
    if (shape.debuff) return 'atkDebuff';
    if (cost <= 0) return 'atkMini';
    return cost === 1 ? 'atkSmall' : 'atkBig';
  }

  /* A Power changes the rest of the fight rather than resolving inside it, and
     that is what the Overclock sound is for — the card type carries it, so a
     Power added tomorrow gets it without anybody remembering. */
  if (def.type === 'power' || shape.overclock) return 'overclocked';
  if (shape.strength) return 'strength';
  if (shape.block) return shape.extras ? 'blockSpecial' : 'block';
  if (shape.focus) return 'focus';
  if (shape.energy) return 'energy';

  /* Everything left is a skill that moves cards or statuses around. The draw
     has its own voice on its own beat, so this is the floor rather than the
     common case. */
  return 'cardSkill';
}
