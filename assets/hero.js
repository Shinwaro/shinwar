/* Draws the asteroid and drifting debris behind the wordmark on the index.
   Index-only — experiments never load this. Nothing here is persisted, and the
   loop stops entirely once the hero scrolls out of view so it costs nothing
   while you are reading the cards. */

(function () {
  "use strict";

  var cv = document.getElementById("hero-sky");
  if (!cv || !cv.getContext) return;

  var ctx = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rock = null, bits = [], W = 0, H = 0, running = false, visible = true;

  /* fixed seed, so it is the same rock on every visit rather than a new one each load */
  function rng(s) {
    return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }

  function buildRock(w, h) {
    var r = Math.min(w, h) * 0.42;
    var cx = w * 0.44, cy = h * 0.5;
    var off = document.createElement("canvas");
    off.width = w; off.height = h;
    var g = off.getContext("2d");
    var rand = rng(20260814);

    var pts = [], n = 46, i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var k = 1 + Math.sin(a * 3.1) * 0.11 + Math.sin(a * 7.3) * 0.06 + (rand() - 0.5) * 0.13;
      pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.86]);
    }

    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.clip();

    var lg = g.createRadialGradient(cx - r * 0.55, cy - r * 0.6, r * 0.05, cx, cy, r * 1.5);
    lg.addColorStop(0,    "#b9bec9");
    lg.addColorStop(0.22, "#7d818c");
    lg.addColorStop(0.5,  "#40434c");
    lg.addColorStop(0.78, "#1c1e24");
    lg.addColorStop(1,    "#0a0b0e");
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);

    /* craters: dark floor, rim catching light on the lower-right since the key is upper-left */
    for (var c = 0; c < 26; c++) {
      var ca = rand() * Math.PI * 2, cd = Math.sqrt(rand()) * r * 0.88;
      var x = cx + Math.cos(ca) * cd, y = cy + Math.sin(ca) * cd * 0.86;
      var cr = (rand() * 0.5 + 0.12) * r * 0.3;
      var shade = 1 - Math.min(1, (x - (cx - r)) / (2 * r));
      g.beginPath(); g.ellipse(x, y, cr, cr * 0.78, ca, 0, Math.PI * 2);
      g.fillStyle = "rgba(8,9,12," + (0.32 + shade * 0.4) + ")"; g.fill();
      g.beginPath(); g.ellipse(x + cr * 0.16, y + cr * 0.2, cr * 0.9, cr * 0.7, ca, 0, Math.PI * 2);
      g.strokeStyle = "rgba(215,222,236," + (0.16 * (1 - shade)) + ")";
      g.lineWidth = Math.max(1, cr * 0.16); g.stroke();
    }

    g.globalCompositeOperation = "lighter";
    var rim = g.createRadialGradient(cx - r * 0.78, cy - r * 0.8, r * 0.02, cx - r * 0.5, cy - r * 0.5, r * 1.05);
    rim.addColorStop(0, "rgba(226,236,255,.5)");
    rim.addColorStop(1, "rgba(226,236,255,0)");
    g.fillStyle = rim; g.fillRect(0, 0, w, h);

    return off;
  }

  function seedBits() {
    bits = [];
    var n = Math.round(Math.min(W, 1500) / 7);
    for (var i = 0; i < n; i++) {
      bits.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 3.2 + 0.5,
        vx: (Math.random() - 0.3) * 0.28, vy: (Math.random() - 0.5) * 0.2,
        a: Math.random() * 0.6 + 0.05,
        sp: Math.random() * Math.PI, ds: (Math.random() - 0.5) * 0.012,
        near: Math.random() > 0.72
      });
    }
  }

  function size() {
    var rect = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(W * dpr);
    cv.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rock = buildRock(W, H);
    seedBits();
    paint();
  }

  function paint() {
    ctx.clearRect(0, 0, W, H);
    if (rock) ctx.drawImage(rock, 0, 0, W, H);
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.sp);
      var s = b.near ? b.r * 1.9 : b.r;
      ctx.fillStyle = "rgba(232,229,222," + b.a + ")";
      ctx.fillRect(-s, -s * 0.55, s * 2, s * 1.1);
      ctx.restore();
    }
  }

  function step() {
    if (!running) return;
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      b.x += b.vx; b.y += b.vy; b.sp += b.ds;
      if (b.x < -12) b.x = W + 12;
      if (b.x > W + 12) b.x = -12;
      if (b.y < -12) b.y = H + 12;
      if (b.y > H + 12) b.y = -12;
    }
    paint();
    requestAnimationFrame(step);
  }

  function start() {
    if (reduce || running || !visible) return;
    running = true;
    requestAnimationFrame(step);
  }
  function stop() { running = false; }

  size();
  start();

  var t;
  window.addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(size, 150);
  });

  /* stop burning frames once the hero is scrolled past */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0 }).observe(cv);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });
})();
