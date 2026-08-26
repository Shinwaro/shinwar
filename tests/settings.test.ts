/* Presentation settings, and the one rule that matters about them.
 *
 * They live in memory for the length of the tab. They are not in `GameState`,
 * they are not saved, and `prefers-reduced-motion` overrides them — that last
 * one is the only place a preference and an accessibility signal can disagree,
 * and the accessibility signal has to win every time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSettings,
  onSettingsChange,
  resetSettings,
  setSetting,
  shakeAllowed,
  volume,
} from '../src/ui/settings.ts';
import { play, stopAll, unlock } from '../src/ui/sound.ts';

/** The tests run under `environment: 'node'`, so the query is stubbed. */
function stubReducedMotion(reduce: boolean): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { matchMedia: () => ({ matches: reduce }) },
  });
}

beforeEach(() => {
  resetSettings();
  stubReducedMotion(false);
});

afterEach(() => {
  resetSettings();
  Reflect.deleteProperty(globalThis, 'window');
});

describe('presentation settings', () => {
  it('starts with shake on', () => {
    // On by default: it is the clearest signal that damage got through rather
    // than being absorbed, and off is one click away.
    expect(getSettings().shake).toBe(true);
    expect(shakeAllowed()).toBe(true);
  });

  it('turns off, and stays off', () => {
    setSetting('shake', false);
    expect(getSettings().shake).toBe(false);
    expect(shakeAllowed()).toBe(false);
  });

  it('lets reduced motion win over the preference', () => {
    // The whole point of the module. The player saying "shake on" and the
    // operating system saying "no motion" is not a tie.
    stubReducedMotion(true);
    expect(getSettings().shake).toBe(true);
    expect(shakeAllowed()).toBe(false);
  });

  it('notifies listeners, and only on an actual change', () => {
    const listener = vi.fn();
    const off = onSettingsChange(listener);

    setSetting('shake', false);
    expect(listener).toHaveBeenCalledTimes(1);

    // Setting it to what it already is is not a change, and a re-render for
    // nothing is how a panel loses its scroll position.
    setSetting('shake', false);
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    setSetting('shake', true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hands back a new object rather than mutating the old one', () => {
    const before = getSettings();
    setSetting('shake', false);
    expect(getSettings()).not.toBe(before);
    expect(before.shake).toBe(true);
  });
});

describe('sound', () => {
  /* The tests run under `environment: 'node'`, where there is no
     `AudioContext` and no `window`. That is exactly the state the game is in
     before the first click, so it is the state worth asserting on: every one of
     these is called from the middle of a fight, and a sound that throws would
     take the turn with it. They must all be silent no-ops and none of them may
     raise. */

  it('starts audible and mutes without touching anything else', () => {
    /* A level, not a switch. Zero IS the mute, so there is one control rather
       than two that can disagree — and it starts above zero because nobody
       discovers a setting they have to find before it does anything. */
    expect(getSettings().volume).toBeGreaterThan(0);
    setSetting('volume', 0);
    expect(getSettings().volume).toBe(0);
    expect(getSettings().shake, 'muting changed the shake').toBe(true);
  });

  it('never lets a level out of range, whatever it is set to', () => {
    // It comes off a slider, and a slider is an input.
    setSetting('volume', 4);
    expect(volume()).toBe(1);
    setSetting('volume', -2);
    expect(volume()).toBe(0);
  });

  it('never throws where there is no Audio at all, muted or not', () => {
    /* The tests run under `environment: 'node'`, where `Audio` does not exist.
       That is also the state the page is in before the first click, and it is
       the one worth asserting on: every one of these is called from the middle
       of a fight, and a sound that throws would take the turn with it. */
    for (const on of [0.7, 0]) {
      setSetting('volume', on);
      expect(() => {
        play('draw');
        play('atkBig');
        play('overheat');
        play('nodeStation');
        stopAll();
      }, `volume: ${on}`).not.toThrow();
    }
  });

  it('asks for nothing before the first gesture', () => {
    /* `unlock` is called from the buttons that start a run and nowhere else: a
       browser will not let audio start without a gesture, and a queue filling
       up behind one that cannot open is worse than no sound. */
    expect(() => unlock()).not.toThrow();
  });
});
