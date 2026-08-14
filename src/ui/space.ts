/* The asteroid scene. Carried over from the old site's `assets/space.js`,
 * ported to TypeScript with its behaviour intact.
 *
 * Three properties are load-bearing and must survive any future edit:
 *
 *   1. The rock is built from a FIXED seed constant, so it is the same
 *      asteroid on every visit rather than a new one each load.
 *   2. The canvas is fixed to the viewport, not sized to the document, so
 *      scrolling costs nothing and the page drifts over a still scene.
 *   3. The loop stops when the tab is hidden, and never starts at all under
 *      `prefers-reduced-motion`. A permanently running canvas is a battery bug.
 *
 * It backs the title and menu screens. The combat stage gets its own, quieter
 * background — do not reuse this one there.
 *
 * This file is UI, not engine: `Math.random` for the drifting debris is fine
 * here and nowhere under `src/engine/`.
 */

/** The same rock every visit. Not a date, not a timestamp — a constant. */
const ROCK_SEED = 20260814;

interface Bit {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  sp: number;
  ds: number;
  near: boolean;
}

export interface SpaceScene {
  /** Resume the drift. No-op under reduced motion or while the tab is hidden. */
  start(): void;
  /** Pause the drift. The last painted frame stays on screen. */
  stop(): void;
  /** Tear down every listener. Call before dropping the canvas. */
  destroy(): void;
}

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function createSpaceScene(canvas: HTMLCanvasElement): SpaceScene {
  const context = canvas.getContext('2d');
  if (context === null) {
    return { start() {}, stop() {}, destroy() {} };
  }
  const ctx = context;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let rock: HTMLCanvasElement | null = null;
  let bits: Bit[] = [];
  let width = 0;
  let height = 0;
  let running = false;
  let frame = 0;
  let resizeTimer = 0;

  function buildRock(w: number, h: number): HTMLCanvasElement | null {
    const r = Math.min(w, h) * 0.46;
    const cx = w * 0.4;
    const cy = h * 0.4;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const g = off.getContext('2d');
    if (g === null) return null;
    const rand = makeRng(ROCK_SEED);

    const pts: [number, number][] = [];
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + Math.sin(a * 3.1) * 0.11 + Math.sin(a * 7.3) * 0.06 + (rand() - 0.5) * 0.13;
      pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.86]);
    }

    const first = pts[0];
    if (first === undefined) return null;

    g.beginPath();
    g.moveTo(first[0], first[1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p === undefined) continue;
      g.lineTo(p[0], p[1]);
    }
    g.closePath();
    g.clip();

    const lg = g.createRadialGradient(cx - r * 0.55, cy - r * 0.6, r * 0.05, cx, cy, r * 1.5);
    /* Deliberately dimmer than the standalone study: this rock is a backdrop
       for text, and a brighter lit face pushes body copy under 4.5:1. */
    lg.addColorStop(0, '#767b84');
    lg.addColorStop(0.22, '#4e525a');
    lg.addColorStop(0.5, '#272a30');
    lg.addColorStop(0.78, '#121418');
    lg.addColorStop(1, '#08090c');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);

    /* Craters: dark floor, rim catching light on the lower-right, since the
       key light is upper-left. */
    for (let c = 0; c < 30; c++) {
      const ca = rand() * Math.PI * 2;
      const cd = Math.sqrt(rand()) * r * 0.88;
      const x = cx + Math.cos(ca) * cd;
      const y = cy + Math.sin(ca) * cd * 0.86;
      const cr = (rand() * 0.5 + 0.12) * r * 0.28;
      const shade = 1 - Math.min(1, (x - (cx - r)) / (2 * r));
      g.beginPath();
      g.ellipse(x, y, cr, cr * 0.78, ca, 0, Math.PI * 2);
      g.fillStyle = `rgba(8,9,12,${0.3 + shade * 0.4})`;
      g.fill();
      g.beginPath();
      g.ellipse(x + cr * 0.16, y + cr * 0.2, cr * 0.9, cr * 0.7, ca, 0, Math.PI * 2);
      g.strokeStyle = `rgba(215,222,236,${0.14 * (1 - shade)})`;
      g.lineWidth = Math.max(1, cr * 0.16);
      g.stroke();
    }

    g.globalCompositeOperation = 'lighter';
    const rim = g.createRadialGradient(
      cx - r * 0.78,
      cy - r * 0.8,
      r * 0.02,
      cx - r * 0.5,
      cy - r * 0.5,
      r * 1.05,
    );
    rim.addColorStop(0, 'rgba(226,236,255,.28)');
    rim.addColorStop(1, 'rgba(226,236,255,0)');
    g.fillStyle = rim;
    g.fillRect(0, 0, w, h);

    return off;
  }

  function seedBits(): void {
    bits = [];
    const n = Math.round(Math.min(width, 1600) / 7);
    for (let i = 0; i < n; i++) {
      bits.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 3.2 + 0.5,
        vx: (Math.random() - 0.3) * 0.26,
        vy: (Math.random() - 0.5) * 0.18,
        a: Math.random() * 0.55 + 0.05,
        sp: Math.random() * Math.PI,
        ds: (Math.random() - 0.5) * 0.011,
        near: Math.random() > 0.74,
      });
    }
  }

  function paint(): void {
    ctx.clearRect(0, 0, width, height);
    if (rock !== null) ctx.drawImage(rock, 0, 0, width, height);
    for (const b of bits) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.sp);
      const s = b.near ? b.r * 1.9 : b.r;
      ctx.fillStyle = `rgba(232,229,222,${b.a})`;
      ctx.fillRect(-s, -s * 0.55, s * 2, s * 1.1);
      ctx.restore();
    }
  }

  /* Fixed to the viewport, never to the document. */
  function size(): void {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rock = buildRock(width, height);
    seedBits();
    paint();
  }

  function step(): void {
    if (!running) return;
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.sp += b.ds;
      if (b.x < -12) b.x = width + 12;
      if (b.x > width + 12) b.x = -12;
      if (b.y < -12) b.y = height + 12;
      if (b.y > height + 12) b.y = -12;
    }
    paint();
    frame = requestAnimationFrame(step);
  }

  function start(): void {
    if (reduce || running || document.hidden) return;
    running = true;
    frame = requestAnimationFrame(step);
  }

  function stop(): void {
    running = false;
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  /* Debounced: mobile browser chrome sliding in and out fires resize
     constantly, and rebuilding the rock on every one of those would stutter. */
  function onResize(): void {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(size, 150);
  }

  function onVisibilityChange(): void {
    if (document.hidden) stop();
    else start();
  }

  size();
  start();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    start,
    stop,
    destroy(): void {
      stop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
