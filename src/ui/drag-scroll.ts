/* Grab the page and pull it.
 *
 * The chart is 118rem tall inside a 40rem window, the Info panel is a long
 * column, the inventory is the whole deck, and the log grows all fight. All of
 * them scrolled by wheel or by dragging a scrollbar, which is the one
 * interaction in the game that asks for a 12px target.
 *
 * So: press anywhere in a scrollable box and drag it. One handler at the root
 * rather than a call per screen, because the next scrollable thing somebody
 * adds should not have to remember — and because screens rebuild their whole
 * subtree on every render, so anything bound per element is bound again a
 * moment later.
 *
 * MOUSE ONLY, deliberately. A finger already has this gesture natively, and
 * every attempt to also drive it from pointer events fights the browser's own
 * momentum scrolling and loses. It is the same rule `onHoverOrFocus` follows
 * for the same reason: an affordance belongs to the pointer that can express
 * it. See `dom.ts`.
 *
 * Nothing here can change the game. It moves `scrollTop`.
 */

/**
 * How far the pointer travels before this is a drag rather than a click.
 *
 * Zero would make every click on a card a one-pixel pan and swallow the click
 * that followed. Large enough to survive the shake of pressing a mouse button,
 * small enough that a deliberate pull starts immediately.
 */
const THRESHOLD = 5;

/**
 * Controls that own their own drag, and must never be taken over.
 *
 * The volume slider is the whole list today, and it is the reason the list
 * exists: a range input IS a drag, and hijacking it would make the one control
 * in the game you are supposed to pull the one control you cannot.
 */
function ownsItsDrag(node: Element): boolean {
  const control = node.closest('input, select, textarea, [contenteditable="true"]');
  return control !== null;
}

/** Can this box actually scroll in the given axis, and is it allowed to? */
function scrolls(node: Element, axis: 'y' | 'x'): boolean {
  const style = getComputedStyle(node);
  const overflow = axis === 'y' ? style.overflowY : style.overflowX;
  if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') return false;
  return axis === 'y'
    ? node.scrollHeight > node.clientHeight + 1
    : node.scrollWidth > node.clientWidth + 1;
}

/**
 * The nearest ancestor that would move if you spun the wheel here.
 *
 * Falls through to the document's own scroller, so a long screen with no inner
 * box — the reward list, a station — drags too. "Everywhere" was the ask, and a
 * gesture that works on four screens out of nine is worse than one that works
 * on none, because the player learns it and then it fails.
 */
function scrollerFor(start: Element, root: Element): HTMLElement | null {
  let node: Element | null = start;
  while (node !== null && node !== root.parentElement) {
    if (node instanceof HTMLElement && (scrolls(node, 'y') || scrolls(node, 'x'))) return node;
    node = node.parentElement;
  }
  const page = document.scrollingElement;
  if (page instanceof HTMLElement && page.scrollHeight > page.clientHeight + 1) return page;
  return null;
}

export function installDragScroll(root: HTMLElement): void {
  let box: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let fromLeft = 0;
  let fromTop = 0;
  let dragging = false;
  /**
   * A pan just ended, so the click it is about to produce is not a click.
   *
   * A flag read by a permanent listener, rather than a one-shot listener armed
   * at the end of the drag. The one-shot version was wrong in the case that
   * matters: a click only fires when the press and the release land on the SAME
   * element, so a drag that ends anywhere else produces no click at all and
   * leaves the trap armed — to spring on the next real click, somewhere else
   * entirely, several seconds later.
   */
  let swallowClick = false;

  const release = (): void => {
    box = null;
    dragging = false;
    document.body.classList.remove('is-dragging');
  };

  window.addEventListener(
    'click',
    (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  root.addEventListener('pointerdown', (event) => {
    // Any new press means the last gesture is over, however it ended.
    swallowClick = false;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (ownsItsDrag(target)) return;

    const found = scrollerFor(target, root);
    if (found === null) return;

    box = found;
    startX = event.clientX;
    startY = event.clientY;
    fromLeft = found.scrollLeft;
    fromTop = found.scrollTop;
    dragging = false;
  });

  window.addEventListener(
    'pointermove',
    (event) => {
      if (box === null) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (!dragging) {
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        dragging = true;
        /* The cursor is on the body rather than on the box: once a drag is
           running the pointer regularly leaves the box it started in, and a
           grabbing cursor that reverts halfway through the gesture reads as the
           drag having been dropped. */
        document.body.classList.add('is-dragging');
      }

      /* The content follows the hand: pull down and the content comes down,
         which means the scroll offset goes the other way. */
      box.scrollTop = fromTop - dy;
      box.scrollLeft = fromLeft - dx;

      /* Only once it IS a drag. Before the threshold this is still an ordinary
         click on a card or a star, and cancelling the browser's default there
         would take the text cursor and the focus behaviour with it. */
      event.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener('pointerup', () => {
    if (box === null) return;
    const panned = dragging;
    release();
    /* Swallow the click this gesture is about to produce. Without it, dragging
       the chart to read ahead and letting go over a star walks you into it. */
    if (panned) swallowClick = true;
  });

  /* A drag that ends outside the window never sends `pointerup`, and a box left
     latched would resume panning the next time the mouse moved over the page. */
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
}
