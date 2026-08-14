/* Anomaly events. Every one is a named situation with 3+ options that answer
 * different needs, legible risk categories rather than hidden dice, and at
 * least one option that defers its consequence into a Thread.
 *
 * "Leave" is always available and always genuinely worthless. The registry
 * validator enforces both halves of that.
 *
 * Empty until M4.
 */

import type { EventDef } from '../../engine/types.ts';

export const EVENTS: readonly EventDef[] = [];
