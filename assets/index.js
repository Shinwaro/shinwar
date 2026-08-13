/* Renders the index from window.EXPERIMENTS (see experiments.js).
   Builds nodes with textContent rather than innerHTML, so a blurb containing
   < or & can never break the page. */

(function () {
  "use strict";

  var CATEGORIES = [
    { id: "arcade",  label: "Arcade",   plural: "arcade games" },
    { id: "quiz",    label: "Quizzes",  plural: "quizzes" },
    { id: "trainer", label: "Trainers", plural: "trainers" },
    { id: "toy",     label: "Toys",     plural: "toys" },
  ];

  var all = (window.EXPERIMENTS || []).slice().sort(function (a, b) {
    if (a.added !== b.added) return a.added < b.added ? 1 : -1; // newest first
    return a.title.localeCompare(b.title);
  });

  var grid = document.getElementById("grid");
  var filters = document.getElementById("filters");
  var current = "all";

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function categoryOf(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return null;
  }

  /* ---------- chips ---------- */

  function buildFilters() {
    // "all" is only worth showing once there's something to filter.
    if (all.length === 0) return;

    var shown = [{ id: "all", label: "All" }];
    CATEGORIES.forEach(function (c) {
      if (all.some(function (x) { return x.category === c.id; })) shown.push(c);
    });

    // A lone category doesn't need a filter UI at all.
    if (shown.length < 3) return;

    shown.forEach(function (c) {
      var count = c.id === "all"
        ? all.length
        : all.filter(function (x) { return x.category === c.id; }).length;

      var b = el("button", "chip");
      b.type = "button";
      b.dataset.cat = c.id;
      b.appendChild(document.createTextNode(c.label));
      b.appendChild(el("span", "chip-count", String(count)));
      b.addEventListener("click", function () {
        setFilter(c.id, true);
      });
      filters.appendChild(b);
    });
  }

  function syncChips() {
    var chips = filters.querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].dataset.cat === current ? "true" : "false");
    }
  }

  /* ---------- cards ---------- */

  function card(x) {
    var cat = categoryOf(x.category);

    var a = el("a", "card");
    a.href = "x/" + x.slug + "/index.html";

    var tag = el("span", "tag tag-" + x.category, cat ? cat.label : x.category);
    a.appendChild(tag);
    a.appendChild(el("span", "card-title", x.title));
    a.appendChild(el("span", "card-blurb", x.blurb));
    return a;
  }

  /* ---------- empty states ---------- */

  function emptyAll() {
    var d = el("div", "empty");
    d.appendChild(el("strong", null, "Nothing here yet."));
    d.appendChild(document.createTextNode(
      "This is where the experiments go — small games, quizzes, trainers and toys, " +
      "each one its own little page. The first one is probably being built right now."
    ));
    return d;
  }

  function emptyFiltered(cat) {
    var d = el("div", "empty");
    d.appendChild(el("strong", null, "No " + cat.plural + " yet."));
    var a = el("a", null, "Show everything");
    a.href = "#all";
    d.appendChild(a);
    d.appendChild(document.createTextNode(" instead."));
    return d;
  }

  /* ---------- render ---------- */

  function render() {
    grid.textContent = "";

    if (all.length === 0) {
      grid.appendChild(emptyAll());
      return;
    }

    var list = current === "all"
      ? all
      : all.filter(function (x) { return x.category === current; });

    if (list.length === 0) {
      grid.appendChild(emptyFiltered(categoryOf(current)));
      return;
    }

    var frag = document.createDocumentFragment();
    list.forEach(function (x) { frag.appendChild(card(x)); });
    grid.appendChild(frag);
  }

  /* ---------- filter state lives in the URL hash, not in storage ---------- */

  function setFilter(cat, pushHash) {
    current = categoryOf(cat) ? cat : "all";
    if (pushHash) {
      // replaceState keeps the back button meaning "back to the last page",
      // not "back through every chip I poked".
      history.replaceState(null, "", current === "all" ? "#" : "#" + current);
    }
    syncChips();
    render();
  }

  function fromHash() {
    return (location.hash || "").replace(/^#/, "");
  }

  buildFilters();
  setFilter(fromHash(), false);
  window.addEventListener("hashchange", function () { setFilter(fromHash(), false); });
})();
