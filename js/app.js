/* Content Digest: static single-page app. No build step, no dependencies. */
(function () {
  "use strict";

  var SPEEDS = [1, 1.15, 1.25, 1.35, 1.5, 1.75, 2];
  var VOICES = ["william", "ryan", "alba"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SITE = "Content Digest";

  var $ = function (id) { return document.getElementById(id); };
  var app = $("app");
  var main = $("main");

  /* ---------- storage ---------- */
  function lsGet(k, d) { try { var v = localStorage.getItem("cd." + k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem("cd." + k, String(v)); } catch (e) { /* ignore */ } }

  /* ---------- tiny DOM helper (no innerHTML, so content is always escaped) ---------- */
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") n.className = v;
        else if (k === "text") n.textContent = v;
        else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(n, arguments[i]);
    return n;
  }
  function append(n, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(n, x); }); return; }
    n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function slug(s) { return String(s).toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  /* ---------- dates ---------- */
  function pd(s) { var p = s.split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function short(s) { var d = pd(s); return MON[d.m - 1] + " " + d.d; }
  function range(a, b) {
    var x = pd(a), y = pd(b);
    if (x.y === y.y) return short(a) + " to " + short(b) + ", " + y.y;
    return short(a) + ", " + x.y + " to " + short(b) + ", " + y.y;
  }

  /* ---------- data ---------- */
  var cache = {};
  function getJSON(path) {
    if (!cache[path]) {
      cache[path] = fetch(path).then(function (r) {
        if (!r.ok) throw new Error(path + " (" + r.status + ")");
        return r.json();
      }).catch(function (e) { delete cache[path]; throw e; });
    }
    return cache[path];
  }

  /* ---------- router ---------- */
  var currentDrop = null;

  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/latest";
    var i = h.indexOf("?");
    var path = i < 0 ? h : h.slice(0, i);
    var qs = i < 0 ? "" : h.slice(i + 1);
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(qs) };
  }

  function setNav(name) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      if (a.getAttribute("data-nav") === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function setTitle(t) { document.title = t ? t + " | " + SITE : SITE; }

  function route() {
    closeMenu();
    var r = parseHash();
    var p = r.parts[0] || "latest";
    var done;
    if (p === "drop" && r.parts[1]) done = routeDrop(r.parts[1], r.parts[2], false);
    else if (p === "archive") done = pageArchive();
    else if (p === "search") done = pageSearch(r.params.get("q") || "");
    else if (p === "about") done = pageAbout();
    else done = routeDrop(null, null, true);
    done.catch(showError);
  }

  function showError(e) {
    hidePlayer();
    app.dataset.drop = "";
    currentDrop = null;
    app.replaceChildren(el("div", { class: "card pad", role: "alert" },
      el("h1", { text: "Something went wrong" }),
      el("p", { text: "Could not load the digest data. " + (location.protocol === "file:" ? "Serve this folder over http (for example with python3 -m http.server) instead of opening the file directly." : "Try reloading the page.") }),
      el("p", { class: "note", text: String(e && e.message || e) })));
  }

  function enter(title) {
    setTitle(title);
    window.scrollTo({ top: 0, behavior: "instant" });
    main.focus({ preventScroll: true });
  }

  /* ---------- drop page ---------- */
  function routeDrop(id, day, latest) {
    return Promise.all([getJSON("data/index.json"), getJSON("data/drops.json")]).then(function (res) {
      var drops = res[1];
      if (!drops.length) { app.replaceChildren(el("p", { class: "card pad", text: "No drops yet." })); hidePlayer(); return; }
      var drop = latest ? drops[0] : drops.filter(function (d) { return d.id === id; })[0];
      if (!drop) {
        hidePlayer(); setNav("archive");
        app.dataset.drop = "";
        enter("Not found");
        app.replaceChildren(el("div", { class: "card pad" }, el("h1", { text: "Drop not found" }), el("p", null, el("a", { href: "#/archive", text: "Browse the archive" }))));
        return;
      }
      setNav(latest || drop.id === drops[0].id ? "latest" : "archive");
      if (app.dataset.drop === drop.id && !latest) { scrollToDay(day); return; }
      currentDrop = drop;
      app.dataset.drop = drop.id;
      enter(drop.title);
      app.replaceChildren(renderDrop(drop));
      showPlayer(drop);
      if (day) scrollToDay(day);
    });
  }

  function scrollToDay(day) {
    if (!day) return;
    var t = document.getElementById("day-" + day);
    if (t) { t.scrollIntoView({ behavior: "instant", block: "start" }); t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
  }

  function renderDrop(drop) {
    var wrap = el("div", { class: "mode-" + mode });
    var head = el("header", { class: "card drop-head" },
      el("p", { class: "range", text: range(drop.start, drop.end) }),
      el("h1", { text: drop.title }),
      drop.intro ? el("p", { class: "lede", text: drop.intro }) : null);
    if (drop.spotlight) {
      var s = drop.spotlight;
      head.appendChild(el("div", { class: "spot" },
        el("span", { class: "big", text: s.value }),
        el("div", null,
          el("div", { class: "lab" }, el("span", { "aria-hidden": "true", text: (s.icon || "") + " " }), s.label),
          s.detail ? el("div", { class: "det", text: s.detail }) : null)));
    }
    if (drop.note) head.appendChild(el("p", { class: "note", text: drop.note }));
    wrap.appendChild(head);

    var toolbar = el("div", { class: "toolbar" });
    var bFull = el("button", { type: "button", "aria-pressed": mode === "full" ? "true" : "false", text: "Full bites" });
    var bQuick = el("button", { type: "button", "aria-pressed": mode === "quick" ? "true" : "false", text: "Quick scan" });
    function setMode(m) {
      mode = m; lsSet("mode", m);
      bFull.setAttribute("aria-pressed", m === "full");
      bQuick.setAttribute("aria-pressed", m === "quick");
      wrap.className = "mode-" + m;
    }
    bFull.addEventListener("click", function () { setMode("full"); });
    bQuick.addEventListener("click", function () { setMode("quick"); });
    toolbar.appendChild(el("div", { class: "seg", role: "group", "aria-label": "View" }, bFull, bQuick));
    wrap.appendChild(toolbar);

    var glance = el("nav", { class: "card glance", "aria-label": "Issues in this drop" }, el("h2", { text: "At a glance" }));
    var ol = el("ol");
    drop.issues.forEach(function (is) {
      ol.appendChild(el("li", null, el("a", { href: "#/drop/" + drop.id + "/" + is.id },
        el("span", { class: "gd", text: (is.weekday ? is.weekday + ", " : "") + short(is.id) }),
        el("span", { class: "gt", text: is.top || is.label }))));
    });
    glance.appendChild(ol);
    wrap.appendChild(glance);

    drop.issues.forEach(function (is) {
      var sec = el("section", { class: "issue", id: "day-" + is.id, "aria-labelledby": "h-" + is.id });
      sec.appendChild(el("div", { class: "issue-head" },
        el("h2", { id: "h-" + is.id, text: is.label }),
        is.weekday ? el("span", { class: "chip", text: is.weekday }) : null));
      is.sections.forEach(function (s) { sec.appendChild(renderSection(s)); });
      wrap.appendChild(sec);
    });
    return wrap;
  }

  function renderSection(s) {
    var ul = el("ul");
    s.bullets.forEach(function (b) {
      ul.appendChild(el("li", null, el("span", { class: "h", text: b.h }), b.t ? el("span", { class: "t", text: b.t }) : null));
    });
    return el("article", { class: "card sec", "data-sec": slug(s.name) },
      el("header", null, el("span", { class: "ic", "aria-hidden": "true", text: s.icon }), el("h3", { text: s.name })),
      ul);
  }

  /* ---------- archive ---------- */
  function pageArchive() {
    return getJSON("data/index.json").then(function (idx) {
      hidePlayer(); app.dataset.drop = ""; currentDrop = null;
      setNav("archive"); enter("Archive");
      var root = el("div", null, el("h1", { text: "Archive" }), el("p", { class: "lede", text: "Every drop, grouped by month. Latest first." }));
      var drops = idx.drops.slice().sort(function (a, b) { return a.end < b.end ? 1 : a.end > b.end ? -1 : 0; });
      var lastMonth = "";
      drops.forEach(function (d) {
        if (d.month !== lastMonth) {
          lastMonth = d.month;
          var m = pd(d.month + "-01");
          root.appendChild(el("h2", { class: "month" }, el("span", { "aria-hidden": "true", text: "🗓️" }), MONTHS[m.m - 1] + " " + m.y));
        }
        var days = el("ul", { class: "days", "aria-label": "Jump to a day" });
        d.issues.forEach(function (is) {
          days.appendChild(el("li", null, el("a", { href: "#/drop/" + d.id + "/" + is.id, text: short(is.id) })));
        });
        root.appendChild(el("article", { class: "card arch" },
          el("h3", null, el("a", { href: "#/drop/" + d.id, text: d.title })),
          el("p", { text: range(d.start, d.end) + " \u00b7 " + d.issues.length + " issues" }),
          d.intro ? el("p", { text: d.intro }) : null,
          days));
      });
      app.replaceChildren(root);
    });
  }

  /* ---------- search ---------- */
  var corpus = null;
  function buildCorpus(drops) {
    if (corpus) return corpus;
    corpus = [];
    drops.forEach(function (d) {
      d.issues.forEach(function (is) {
        is.sections.forEach(function (s) {
          s.bullets.forEach(function (b) {
            corpus.push({
              drop: d, issue: is, sec: s, b: b, end: d.end + is.id,
              hay: (b.h + " " + (b.t || "") + " " + s.name + " " + is.label + " " + d.title).toLowerCase()
            });
          });
        });
      });
    });
    return corpus;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function terms(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
  function highlight(text, re) {
    if (!re) return text;
    var out = document.createDocumentFragment(), last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      if (m.index > last) out.appendChild(document.createTextNode(text.slice(last, m.index)));
      out.appendChild(el("mark", { text: m[0] }));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.appendChild(document.createTextNode(text.slice(last)));
    return out;
  }
  function snippet(t, re) {
    if (t.length <= 240) return t;
    re.lastIndex = 0;
    var m = re.exec(t), at = m ? m.index : 0;
    var s = Math.max(0, at - 80), e = Math.min(t.length, s + 240);
    return (s > 0 ? "\u2026" : "") + t.slice(s, e) + (e < t.length ? "\u2026" : "");
  }

  function pageSearch(q) {
    return getJSON("data/drops.json").then(function (drops) {
      hidePlayer(); app.dataset.drop = ""; currentDrop = null;
      setNav("search"); enter("Search");
      var input = el("input", { type: "search", id: "q", placeholder: "Search every drop (try: gold, TikTok, Fed)", "aria-label": "Search", autocomplete: "off", value: q });
      input.value = q;
      var count = el("p", { class: "count", role: "status" });
      var out = el("div");
      var timer = null;
      function run() {
        var query = input.value.trim();
        history.replaceState(null, "", query ? "#/search?q=" + encodeURIComponent(query) : "#/search");
        var ts = terms(query);
        out.replaceChildren();
        if (!ts.length) { count.textContent = "Type to search. Results appear as you type."; return; }
        var re = new RegExp(ts.map(esc).join("|"), "gi");
        var hits = [];
        buildCorpus(drops).forEach(function (c) {
          for (var i = 0; i < ts.length; i++) if (c.hay.indexOf(ts[i]) < 0) return;
          var hl = c.b.h.toLowerCase(), score = 0;
          ts.forEach(function (t) { if (hl.indexOf(t) >= 0) score += 2; });
          hits.push({ c: c, score: score });
        });
        hits.sort(function (a, b) { return b.score - a.score || (a.c.end < b.c.end ? 1 : -1); });
        count.textContent = hits.length ? hits.length + (hits.length === 1 ? " result" : " results") + (hits.length > 100 ? " (showing the first 100)" : "") : "No results. Try a shorter or different word.";
        hits.slice(0, 100).forEach(function (h) {
          var c = h.c;
          out.appendChild(el("a", { class: "card res", href: "#/drop/" + c.drop.id + "/" + c.issue.id },
            el("p", { class: "meta" }, el("span", { "aria-hidden": "true", text: c.sec.icon + " " }), highlight(c.sec.name, re), " \u00b7 " + c.issue.label + " \u00b7 " + c.drop.title),
            el("div", { class: "rt" }, highlight(c.b.h, re)),
            c.b.t ? el("div", { class: "rd" }, highlight(snippet(c.b.t, re), re)) : null));
        });
      }
      input.addEventListener("input", run);
      app.replaceChildren(el("div", null, el("h1", { text: "Search" }),
        el("div", { class: "search-box", role: "search" }, input), count, out));
      run();
    });
  }

  /* ---------- about ---------- */
  function pageAbout() {
    return getJSON("data/legend.json").then(function (legend) {
      hidePlayer(); app.dataset.drop = ""; currentDrop = null;
      setNav("about"); enter("About");
      var ul = el("ul", { class: "legend" });
      legend.forEach(function (l) {
        ul.appendChild(el("li", null, el("span", { class: "ic", "aria-hidden": "true", text: l.icon }),
          el("div", null, el("b", { text: l.name }), el("span", { class: "d", text: l.desc }))));
      });
      app.replaceChildren(el("div", { class: "about" },
        el("h1", { text: "About" }),
        el("p", { class: "lede", text: "Content Digest turns a pile of reading into a few minutes of skimming or listening." }),
        el("section", { class: "card pad", style: "margin-bottom:16px" },
          el("h2", { text: "How it works" }),
          el("ol", null,
            el("li", { text: "Each drop covers a stretch of days. Open Latest for the newest one, or the Archive for older ones." }),
            el("li", { text: "Every day is split into small cards, one per topic. Switch between Full bites and Quick scan (headlines only) at the top of a drop." }),
            el("li", { text: "Press play in the bar at the bottom to hear the whole drop. Pick a speed from 1x to 2x and a voice. Switching voice keeps your place." }),
            el("li", { text: "Search looks through every drop right in your browser. Nothing is sent anywhere." })),
          el("p", { class: "note", text: "Your voice, speed, and view choices are remembered on this device." })),
        el("section", { class: "card pad" },
          el("h2", { text: "What the icons mean" }),
          ul)));
    });
  }

  /* ---------- menu ---------- */
  var menuBtn = $("menu-btn"), sidebar = $("sidebar"), scrim = $("scrim");
  function openMenu() { sidebar.classList.add("open"); scrim.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); }
  function closeMenu() { sidebar.classList.remove("open"); scrim.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", function () { sidebar.classList.contains("open") ? closeMenu() : openMenu(); });
  scrim.addEventListener("click", closeMenu);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  /* ---------- audio player ---------- */
  var mode = lsGet("mode", "full") === "quick" ? "quick" : "full";
  var audio = $("audio"), playerEl = $("player");
  var pPlay = $("p-play"), pSeek = $("p-seek"), pCur = $("p-cur"), pDur = $("p-dur");
  var pSpeed = $("p-speed"), pVoice = $("p-voice"), pMsg = $("p-msg");
  var voice = lsGet("voice", "william");
  if (VOICES.indexOf(voice) < 0) voice = "william";
  var speed = parseFloat(lsGet("speed", "1"));
  if (SPEEDS.indexOf(speed) < 0) speed = 1;
  var playerDropId = null, pendingPct = null, resume = false, dragging = false;

  pSpeed.value = String(speed);
  pVoice.value = voice;

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var s = Math.floor(t % 60), m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
    var ss = (s < 10 ? "0" : "") + s;
    return h ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
  }
  function applyRate() {
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
    audio.preservesPitch = true;
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;
  }
  function setPlayLabel() {
    var playing = !audio.paused;
    pPlay.textContent = playing ? "\u23f8" : "\u25b6";
    pPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  function updateTime() {
    var d = audio.duration;
    pCur.textContent = fmt(audio.currentTime);
    pDur.textContent = isFinite(d) ? fmt(d) : "0:00";
    if (!dragging && isFinite(d) && d > 0) pSeek.value = String(Math.round(audio.currentTime / d * 1000));
    pSeek.setAttribute("aria-valuetext", fmt(audio.currentTime) + " of " + (isFinite(d) ? fmt(d) : "unknown"));
  }
  function loadVoice(keepPosition) {
    var path = playerDropId && currentDrop && currentDrop.audio && currentDrop.audio[voice];
    pMsg.textContent = "";
    if (!path) { audio.removeAttribute("src"); audio.load(); pMsg.textContent = "Audio is not available for this voice."; updateTime(); return; }
    var d = audio.duration;
    pendingPct = keepPosition && isFinite(d) && d > 0 ? audio.currentTime / d : null;
    resume = keepPosition && !audio.paused;
    audio.src = path;
    applyRate();
    audio.load();
    pSeek.value = pendingPct === null ? "0" : String(Math.round(pendingPct * 1000));
  }
  audio.addEventListener("loadedmetadata", function () {
    applyRate();
    if (pendingPct !== null && isFinite(audio.duration)) {
      audio.currentTime = pendingPct * audio.duration;
      pendingPct = null;
    }
    if (resume) { resume = false; var p = audio.play(); if (p && p.catch) p.catch(function () { setPlayLabel(); }); }
    updateTime();
  });
  audio.addEventListener("loadstart", applyRate);
  audio.addEventListener("timeupdate", updateTime);
  audio.addEventListener("durationchange", updateTime);
  audio.addEventListener("play", setPlayLabel);
  audio.addEventListener("pause", setPlayLabel);
  audio.addEventListener("ended", setPlayLabel);
  audio.addEventListener("error", function () { if (audio.getAttribute("src")) pMsg.textContent = "Could not load this audio. Try another voice."; });

  pPlay.addEventListener("click", function () {
    if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () { pMsg.textContent = "Playback was blocked. Press play again."; }); }
    else audio.pause();
  });
  $("p-back").addEventListener("click", function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  $("p-fwd").addEventListener("click", function () { if (isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 15); });
  pSeek.addEventListener("pointerdown", function () { dragging = true; });
  pSeek.addEventListener("pointerup", function () { dragging = false; });
  pSeek.addEventListener("input", function () {
    if (isFinite(audio.duration)) { audio.currentTime = pSeek.value / 1000 * audio.duration; pCur.textContent = fmt(audio.currentTime); }
  });
  pSeek.addEventListener("change", function () { dragging = false; });
  pSpeed.addEventListener("change", function () {
    speed = parseFloat(pSpeed.value); lsSet("speed", speed); applyRate();
  });
  pVoice.addEventListener("change", function () {
    voice = pVoice.value; lsSet("voice", voice); loadVoice(true);
  });

  function showPlayer(drop) {
    var changed = playerDropId !== drop.id;
    playerDropId = drop.id;
    playerEl.hidden = false;
    document.body.classList.add("has-player");
    sizePlayer();
    if (changed || !audio.getAttribute("src")) { audio.pause(); loadVoice(false); setPlayLabel(); }
  }
  function hidePlayer() {
    if (playerEl.hidden) return;
    audio.pause();
    playerEl.hidden = true;
    document.body.classList.remove("has-player");
    playerDropId = null;
    audio.removeAttribute("src");
    audio.load();
    pSeek.value = "0"; pCur.textContent = "0:00"; pDur.textContent = "0:00";
    setPlayLabel();
  }
  function sizePlayer() {
    document.documentElement.style.setProperty("--player-h", playerEl.offsetHeight + "px");
  }
  if (window.ResizeObserver) new ResizeObserver(sizePlayer).observe(playerEl);
  window.addEventListener("resize", sizePlayer);

  /* ---------- boot ---------- */
  window.addEventListener("hashchange", route);
  route();
})();
