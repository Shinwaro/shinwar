/* Boot.
 *
 * Load the content, validate it in dev, seed the title screen, mount the app.
 * Nothing is read from storage because nothing is ever written to it.
 */

import './styles/tokens.css';
import './styles/shell.css';
import './styles/game.css';

import { createInitialState } from './engine/state.ts';
import { loadContent } from './content/index.ts';
import { validateContent } from './content/registry.ts';
import { createStore } from './ui/store.ts';
import { mountApp } from './ui/app.ts';
import { newSeed } from './ui/screens/title.ts';

loadContent();

if (import.meta.env.DEV) {
  const issues = validateContent();
  if (issues.length > 0) {
    console.error(`content: ${issues.length} validation issue(s)`);
    for (const issue of issues) console.error(`  ${issue.where}: ${issue.problem}`);
  }
}

const root = document.getElementById('app');
if (root === null) throw new Error('boot: #app is missing from index.html');

// The engine has no entropy of its own, so the first seed is minted here and
// handed in. Everything downstream of it is deterministic.
mountApp(root, createStore(createInitialState(newSeed())));
