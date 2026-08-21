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
} from '../src/ui/settings.ts';

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
