/* Fullscreen.
 *
 * An hour-long run with no saves is a sitting, and a sitting wants the whole
 * screen — the chart is 118rem tall and the fight puts the rail, the corner and
 * the hand at four different edges. Browser chrome takes a band off the top of
 * all of it.
 *
 * Presentation, like `settings.ts`: nothing here can change a number, and a
 * replayed action log produces the same run windowed or not. It is deliberately
 * NOT a setting either — the browser already owns this piece of state and will
 * change it behind our back (F11, Esc, leaving the tab), so the only honest
 * source of truth is `document.fullscreenElement`. Storing a boolean beside it
 * would guarantee the two disagree.
 *
 * The vendor-prefixed half exists for Safari, which still has no unprefixed
 * `requestFullscreen` on some versions. Typed rather than cast to `any`, so the
 * shape is checked rather than asserted.
 */

interface WebkitFullscreenDocument {
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

interface WebkitFullscreenElement {
  webkitRequestFullscreen?: () => void;
}

function doc(): (Document & WebkitFullscreenDocument) | null {
  return typeof document === 'undefined' ? null : document;
}

/** Is this even on offer? An iPhone says no, and the control should not appear. */
export function fullscreenSupported(): boolean {
  const target = doc();
  if (target === null) return false;
  const root: Element & WebkitFullscreenElement = target.documentElement;
  return (
    target.fullscreenEnabled === true &&
    (typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function')
  );
}

/** Asked, never remembered. The browser owns this and changes it without us. */
export function isFullscreen(): boolean {
  const target = doc();
  if (target === null) return false;
  return (target.fullscreenElement ?? target.webkitFullscreenElement ?? null) !== null;
}

/**
 * Set once a request has actually been REFUSED by this browser.
 *
 * `fullscreenEnabled` is a promise, not a guarantee: several phone browsers
 * report it true and then reject the request, which left a button that looked
 * fine and did nothing every time it was pressed. The file's own rule is that
 * a control which cannot work is not a control, and it was only being applied
 * to the browsers honest enough to say so up front.
 *
 * A refusal is remembered rather than retried because the reasons are all
 * standing ones — the platform does not do it, or a permissions policy forbids
 * it. It is not stored anywhere: `settings.ts` and this module are both
 * presentation, and this is a fact about the browser, not a preference.
 */
let refused = false;

/** Listeners that want to know the control has become impossible. */
const refusalWatchers = new Set<() => void>();

function markRefused(): void {
  if (refused) return;
  refused = true;
  for (const watcher of [...refusalWatchers]) watcher();
}

/**
 * In or out.
 *
 * `requestFullscreen` rejects when it was not called from a gesture, and that
 * rejection is not an error worth showing anybody. It IS worth acting on: a
 * refusal means the button should stop claiming to work — see `markRefused`.
 */
export function toggleFullscreen(): void {
  const target = doc();
  if (target === null) return;

  if (isFullscreen()) {
    if (typeof target.exitFullscreen === 'function') void target.exitFullscreen().catch(() => undefined);
    else target.webkitExitFullscreen?.();
    return;
  }

  const root: Element & WebkitFullscreenElement = target.documentElement;
  if (typeof root.requestFullscreen === 'function') {
    void root.requestFullscreen().catch(() => {
      markRefused();
    });
    return;
  }
  if (typeof root.webkitRequestFullscreen === 'function') {
    root.webkitRequestFullscreen();
    /* The prefixed form returns nothing, so there is no rejection to catch.
       If the document is still not fullscreen a moment later, it was refused —
       one frame is enough, because a granted request applies synchronously
       enough to be visible on the next tick. */
    setTimeout(() => {
      if (!isFullscreen()) markRefused();
    }, 250);
    return;
  }
  markRefused();
}

/**
 * Told when a request has been refused, so a control can take itself away.
 *
 * Returns its own unsubscribe, and fires immediately if the refusal already
 * happened — a button built after the first failed press must not be born
 * claiming to work.
 */
export function watchRefusal(listener: () => void): () => void {
  if (refused) {
    listener();
    return () => undefined;
  }
  refusalWatchers.add(listener);
  return () => refusalWatchers.delete(listener);
}

/** Fires for F11 and for Esc as well as for our own button. */
export function onFullscreenChange(listener: () => void): () => void {
  const target = doc();
  if (target === null) return () => undefined;
  target.addEventListener('fullscreenchange', listener);
  target.addEventListener('webkitfullscreenchange', listener);
  return () => {
    target.removeEventListener('fullscreenchange', listener);
    target.removeEventListener('webkitfullscreenchange', listener);
  };
}

/**
 * The control, wherever it is asked for.
 *
 * It keeps ITSELF up to date rather than waiting to be re-rendered: F11 and Esc
 * both change the state without going anywhere near the store, and a button
 * that still says "Fullscreen" while the page is fullscreen is worse than no
 * button. The listener drops itself once the node has left the document, which
 * is how the copy in a screen that gets replaced stops existing.
 *
 * Returns null where the browser does not offer it — a control that cannot work
 * is not a control, it is a thing that looks broken.
 */
export function renderFullscreenButton(className: string): HTMLButtonElement | null {
  if (!fullscreenSupported()) return null;

  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.dataset['sound'] = 'own';
  node.setAttribute('aria-keyshortcuts', 'F');

  /* Two spans rather than a text node, so the corner rail can go icon-only on
     a narrow window without this button needing to know the breakpoint. The
     glyph is `aria-hidden` and the accessible name comes from the label, so
     hiding the label visually never leaves the button unnamed — see
     `aria-label` below, which carries it either way. */
  const glyph = document.createElement('span');
  glyph.className = 'btn-corner-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '\u26F6';

  const label = document.createElement('span');
  label.className = 'btn-corner-label';

  node.append(glyph, label);

  const paint = (): void => {
    const on = isFullscreen();
    const words = on ? 'Exit fullscreen' : 'Fullscreen';
    label.textContent = words;
    node.setAttribute('aria-label', words);
    node.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  paint();

  node.addEventListener('click', toggleFullscreen);

  const stop = onFullscreenChange(() => {
    if (!node.isConnected) {
      stop();
      return;
    }
    paint();
  });

  /* And if the browser refuses, the button removes itself.
     "Fullscreen does not work on phones" was this: several phone browsers say
     `fullscreenEnabled` and then reject, so the control sat there being pressed
     and doing nothing. Now the first refusal takes it off the screen, which is
     the same answer this module already gives an iPhone — it just took a
     rejection to find out. */
  const unwatch = watchRefusal(() => {
    unwatch();
    node.remove();
  });

  return node;
}
