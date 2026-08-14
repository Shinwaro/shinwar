/* State in, string out — deterministically.
 *
 * `JSON.stringify` orders keys by insertion, so two states that are equal in
 * every way can stringify differently if they were built by different code
 * paths. That would make the determinism test a test of construction order
 * rather than of behaviour. So keys are sorted here, always.
 *
 * This is used by the determinism harness, the serialization round-trip test,
 * the simulator, and the state dump on screen. It is NOT persistence — nothing
 * written by this file is ever stored anywhere.
 */

import type { GameState } from './types.ts';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      // An `undefined` here means a state field slipped through as optional.
      // JSON would drop it and the round-trip test would fail obscurely;
      // failing here says exactly which field it was.
      if (entry === undefined) {
        throw new Error(`serialize: '${key}' is undefined. State fields are \`T | null\`, never optional.`);
      }
      out[key] = stableValue(entry);
    }
    return out;
  }
  return value;
}

export function stableStringify(state: unknown, indent = 0): string {
  return JSON.stringify(stableValue(state), null, indent);
}

/** FNV-1a over the stable string. Short, comparable, good enough for a run id. */
export function hashState(state: GameState): string {
  const text = stableStringify(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function toJson(state: GameState): string {
  return stableStringify(state, 2);
}

export function fromJson(text: string): GameState {
  return JSON.parse(text) as GameState;
}
