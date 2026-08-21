/* Presentation settings. In memory, for this tab, and nowhere else.
 *
 * These are deliberately NOT in `GameState`. Nothing here can change what
 * happens — turning the shake off does not change a single number — and a
 * replayed action log must produce the same run whether or not the person
 * replaying it likes their screen moving. Putting them in state would make the
 * seed depend on a preference, which is exactly the class of bug the named RNG
 * streams exist to prevent.
 *
 * They are also not persisted, and that is not an oversight: the no-saves rule
 * covers "just a settings cache" too. A run is one sitting, and the toggle
 * lives as long as the sitting does.
 *
 * `prefers-reduced-motion` is not a setting — it is the operating system
 * telling us something, and it always wins. `motionAllowed()` is the only
 * thing anything should ask.
 */

import { prefersReducedMotion } from './anim.ts';

export interface Settings {
  /**
   * Screen shake on hits that reach the hull.
   *
   * On by default because it is the clearest signal in the game that damage
   * got *through* rather than being absorbed, and off is one click away.
   */
  readonly shake: boolean;
}

let current: Settings = { shake: true };

const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  for (const listener of listeners) listener();
}

export function onSettingsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The one question the animation layer should ask before moving anything. */
export function shakeAllowed(): boolean {
  return current.shake && !prefersReducedMotion();
}

/** Tests, and the fresh-start path. */
export function resetSettings(): void {
  current = { shake: true };
}
