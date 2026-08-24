/* Element building, small and boring.
 *
 * No framework, by design. This is the whole abstraction: it exists so screens
 * read as structure instead of a hundred `createElement`/`setAttribute` pairs,
 * and it stops at that.
 */

export type AttrValue = string | number | boolean | null | undefined;
export type Attrs = Readonly<Record<string, AttrValue>>;
export type Child = Node | string | null | undefined | false;

function applyAttrs(node: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (value === true) {
      node.setAttribute(name, '');
      continue;
    }
    node.setAttribute(name, String(value));
  }
}

function appendChildren(node: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/**
 * The same, for SVG.
 *
 * `createElement` produces an HTML element whatever the tag says, so an
 * `<svg><path>` built that way renders as nothing at all and gives no error.
 * The namespace is the entire difference and it is easy to forget, which is
 * why the marks share one door rather than each remembering.
 */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

/**
 * Replace a node's children, dropping the nulls. `replaceChildren` rejects
 * them, and conditional children read far better as `cond ? node : null` than
 * as an array built up in pieces.
 */
export function fill(node: Element, children: readonly Child[]): void {
  node.replaceChildren();
  appendChildren(node, children);
}

/** Fill a node and hand it back, so a button can be built in one expression. */
export function withChildren<T extends Element>(node: T, children: readonly Child[]): T {
  fill(node, children);
  return node;
}

/** Real `<button>`s everywhere, so keyboard and focus work without being asked. */
export function button(label: string, attrs: Attrs, onClick: () => void): HTMLButtonElement {
  const node = el('button', { type: 'button', ...attrs }, [label]);
  node.addEventListener('click', onClick);
  return node;
}

/**
 * Hover, wired so a finger can never raise it.
 *
 * A touch pointer fires `pointerenter` on finger-DOWN. Anywhere a hover handler
 * re-renders — and in this UI they nearly all do, because hover is a preview
 * and a preview is drawn from state — that means: finger lands, enter fires,
 * the screen is rebuilt, the node under the finger is destroyed, the finger
 * lifts on nothing, and no `click` is ever dispatched. The control simply does
 * not work on a phone, silently, while working perfectly under a mouse.
 *
 * Hover is a mouse affordance: it is what a pointer that can rest somewhere
 * without committing gets as an extra. A finger cannot rest, so it gets the
 * tap, which is the interaction every one of these controls already supports.
 *
 * `leave` is guarded on `isConnected` as well: a re-render removes the node and
 * the removal itself fires `pointerleave`, and treating that as the pointer
 * leaving starts a strobe loop between enter and leave.
 */
export function onHoverOrFocus(node: HTMLElement, set: (on: boolean) => void): void {
  node.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    set(true);
  });
  node.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    if (node.isConnected) set(false);
  });
  node.addEventListener('focus', () => set(true));
  node.addEventListener('blur', () => {
    if (node.isConnected) set(false);
  });
}
