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
 * In or out.
 *
 * `requestFullscreen` rejects when it was not called from a gesture, and that
 * rejection is not an error worth showing anybody — the control simply did
 * nothing, which is exactly what the browser decided should happen.
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
    void root.requestFullscreen().catch(() => undefined);
    return;
  }
  root.webkitRequestFullscreen?.();
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

  const paint = (): void => {
    const on = isFullscreen();
    node.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
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

  return node;
}
