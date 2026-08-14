/* Load the content pools once, before any test runs.
 *
 * `beginRun` opens a fight, and a fight resolves enemy and card ids through
 * the registry — so a test that never mentions content still needs it loaded,
 * exactly as the app does at boot. Registering it here rather than in each
 * file keeps the tests honest about that dependency instead of hiding it.
 *
 * Vitest isolates modules per file, so this runs per file and the tables that
 * `content.test.ts` deliberately clears cannot leak into anything else.
 */

import { loadContent } from '../src/content/index.ts';

loadContent();
