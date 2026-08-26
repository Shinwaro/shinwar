/* What a card sounds like.
 *
 * `cardVoice` reads the effect ops rather than a table of card ids, for the
 * same reason the rules text is generated: a hand-assigned sound per card is
 * wrong the day somebody adds the next one, and nothing would ever notice.
 *
 * These are Robin's own examples, one per shape. They are the specification —
 * if a change to a card moves it into a different bucket, that is either the
 * point or a mistake, and either way somebody should have to say so here.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import { cardVoice } from '../src/ui/card-voice.ts';

beforeEach(() => {
  reloadContent();
});

describe('a card is announced by its shape', () => {
  const EXAMPLES: Readonly<Record<string, string>> = {
    // One target, by price.
    hairline: 'atkMini',
    deferred_burn: 'atkSmall',
    sever: 'atkBig',
    // The same target, repeatedly — including the ones that scale rather than
    // declaring `times`, because "for every card discarded, deal 2" is several
    // blows on the board whatever it is in the data.
    empty_the_rack: 'atkMultihit',
    momentum: 'atkMultihit',
    // The room.
    fanned_cut: 'atkAoeSmall',
    clean_sweep: 'atkAoeBig',
    broken_formation: 'atkAoeMultihit',
    // A hit that leaves something behind, and the same to the room. Rust Bloom
    // leaves something behind without hitting at all, which is still this.
    rust_bloom: 'atkDebuff',
    point_of_release: 'atkDebuff',
    starfall: 'atkDebuffAoe',
    rusting_wind: 'atkDebuffAoe',
    // Block, and Block plus more than Block.
    solar_parry: 'block',
    bulwark: 'block',
    stillwater_guard: 'blockSpecial',
    // Changes the rest of the fight rather than resolving inside it.
    overclock_the_core: 'overclocked',
  };

  it('puts every example card in the bucket it was given for', () => {
    const wrong: string[] = [];
    for (const [id, want] of Object.entries(EXAMPLES)) {
      const def = cardTable.find(id);
      if (def === undefined) {
        wrong.push(`${id} is not a card any more`);
        continue;
      }
      const got = cardVoice(def, null);
      if (got !== want) wrong.push(`${def.name}: ${got}, wanted ${want}`);
    }
    expect(wrong).toEqual([]);
  });

  it('lets the IAI rider win over the shape, and only the IAI one', () => {
    /* A card that hits harder for where you are standing is that card, whatever
       else it is doing — which is the whole reason IAI has a sound of its own.
       It depends on the stance at the moment of play, so it is an argument
       rather than a property of the card.
     *
     * WHICH stance is the part that was wrong: Sever's rider is GUARD venting
     * Heat, and a boolean here gave every Sever played in GUARD the two-phase
     * attack sound. */
    const slash = cardTable.get('iai_slash');
    expect(cardVoice(slash, null)).not.toBe('cardAttackIai');
    expect(cardVoice(slash, 'iai')).toBe('cardAttackIai');

    const sever = cardTable.get('sever');
    expect(sever.stanceRider?.stance, 'Sever stopped being the GUARD case').toBe('guard');
    expect(cardVoice(sever, 'guard'), 'a GUARD rider is not an IAI attack').toBe('atkBig');
  });

  it('gives every shipped card a voice', () => {
    // `cardSkill` is the floor, not a failure — but a card should never fall
    // through to it just because a new op was added and nobody taught this.
    for (const def of cardTable.all()) {
      expect(typeof cardVoice(def, null), def.id).toBe('string');
    }
  });

  it('does not put half the pool in one bucket', () => {
    /* The classifier earns its keep by SPREADING the pool. If one voice covers
       most of it the shapes have collapsed into each other and every card
       sounds the same again, which is where this started. */
    const tally = new Map<string, number>();
    for (const def of cardTable.all()) {
      const voice = cardVoice(def, null);
      tally.set(voice, (tally.get(voice) ?? 0) + 1);
    }
    const total = cardTable.all().length;
    const biggest = Math.max(...tally.values());
    expect(tally.size, 'the pool uses fewer than six voices').toBeGreaterThanOrEqual(6);
    expect(biggest / total, 'one voice covers most of the pool').toBeLessThan(0.35);
  });
});
