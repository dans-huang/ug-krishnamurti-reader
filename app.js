/* ============================================================
   U.G. Krishnamurti — Reading Edition
   Vanilla SPA. Hash routing. No build step, works from file://.
   ============================================================ */
(function () {
  "use strict";

  var LIB = window.UG_LIBRARY || { books: [], recordings: [] };
  var BOOKS = LIB.books, RECS = LIB.recordings;
  var ZH = window.UG_ZH || {};
  var byId = {};
  BOOKS.forEach(function (b) { byId[b.id] = b; });

  /* ---- translation helpers ---- */
  function T(k) { var v = ZH[k]; return (typeof v === "string" && v.trim()) ? v : null; }

  var CN_NUM = { one: "一", two: "二", three: "三", four: "四", five: "五",
    six: "六", seven: "七", eight: "八", nine: "九", ten: "十",
    "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六",
    "7": "七", "8": "八", "9": "九", "10": "十", "11": "十一", "12": "十二" };
  function cnNum(s) { return CN_NUM[String(s).toLowerCase()] || s; }

  var NUM_WORD = ["Zero", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
  function numWord(n) { return NUM_WORD[n] || String(n); }

  function eyebrowDisp(eye) {
    if (SET.lang === "en" || !eye) return eye;
    var m;
    if ((m = eye.match(/^Chapter\s+(\w+)/i))) return "第 " + cnNum(m[1]) + " 章";
    if ((m = eye.match(/^Part\s+(\w+)/i))) return "第 " + cnNum(m[1]) + " 部";
    var map = { "Opening": "卷首", "Conversations": "對話",
      "Recording · Transcript": "錄音 · 逐字稿" };
    return map[eye] || eye;
  }

  // heading rendering for the three language modes
  function headParts(key, en) {
    var zh = T(key);
    if (SET.lang === "zh") return { text: zh || en, cjk: !!zh, second: null };
    if (SET.lang === "bi") return { text: en, cjk: false, second: zh };
    return { text: en, cjk: false, second: null };
  }
  // build a heading element's class + trailing translated line
  function headHtml(tag, cls, key, en) {
    var hp = headParts(key, en);
    var c = cls + (hp.cjk ? " cjk" : "");
    var sub = hp.second ? '<div class="tr-head">' + esc(hp.second) + "</div>" : "";
    return "<" + tag + ' class="' + c + '">' + esc(hp.text) + "</" + tag + ">" + sub;
  }
  function zhUi(en, zh) { return SET.lang === "en" ? en : zh; }

  var app = document.getElementById("app");
  var topbar = document.getElementById("topbar");
  var topbarTitle = document.getElementById("topbar-title");
  var progressBar = document.querySelector("#progress span");
  var tocBtn = document.getElementById("toc-btn");

  var ROMAN = ["", "One", "Two", "Three", "Four", "Five"];

  /* ---------- settings ---------- */
  var SET = {
    lang: load("ug.lang", "en"),
    theme: load("ug.theme", "paper"),
    size: parseInt(load("ug.size", "0"), 10),
    face: load("ug.face", "serif"),
    measure: load("ug.measure", "normal")
  };
  var SIZE_SCALE = { "-1": 0.9, "0": 1, "1": 1.12, "2": 1.26 };
  var MEASURE_REM = { narrow: "34rem", normal: "39rem", wide: "46rem" };

  function applySettings() {
    document.documentElement.setAttribute("data-theme", SET.theme);
    document.documentElement.setAttribute("data-lang", SET.lang);
    document.documentElement.style.setProperty("--reader-scale", SIZE_SCALE[String(SET.size)] || 1);
    document.documentElement.style.setProperty("--measure", MEASURE_REM[SET.measure] || "39rem");
    document.documentElement.style.setProperty(
      "--reading-face", SET.face === "sans" ? "var(--sans)" : "var(--serif)");
    syncSegs();
  }

  /* ---------- helpers ---------- */
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function fmtWords(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, "") + "k" : String(n); }

  /* ---------- progress / read-state ---------- */
  function readMap() { try { return JSON.parse(load("ug.read", "{}")); } catch (e) { return {}; } }
  function markRead(bid, ci) {
    var m = readMap(); m[bid + "/" + ci] = 1; save("ug.read", JSON.stringify(m));
  }
  function isRead(bid, ci) { return !!readMap()[bid + "/" + ci]; }
  function setLast(obj) { save("ug.last", JSON.stringify(obj)); }
  function getLast() { try { return JSON.parse(load("ug.last", "null")); } catch (e) { return null; } }

  /* ============================================================
     Block rendering (shared by chapters & recordings)
     ============================================================ */
  function renderBlocks(blocks, keyBase) {
    var mode = SET.lang;
    // drop cap only when the chapter opens with prose (Latin only)
    var dropCap = mode !== "zh" && blocks.length && blocks[0].type !== "speech";
    var html = "";
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b.text) continue;   // skip empty OCR fragments (e.g. bare speaker labels)
      var zh = T(keyBase + "/" + i);
      if (b.type === "speech") {
        var cls = b.speaker === "ug" ? "ug" : "q";
        var label = b.speaker === "ug" ? "U.G." : "Q";
        var main = (mode === "zh" && zh) ? zh : b.text;
        var tr = (mode === "bi" && zh) ? '<span class="d-tr">' + esc(zh) + "</span>" : "";
        html += '<div class="dialogue ' + cls + '"><span class="spk">' + label +
                '</span><span class="d-text">' + esc(main) + "</span>" + tr + "</div>";
      } else {
        var lead = (dropCap && i === 0) ? "lead" : "";
        if (mode === "zh") {
          html += '<p class="' + lead + '">' + esc(zh || b.text) + "</p>";
        } else {
          html += '<p class="' + lead + '">' + esc(b.text) + "</p>";
          if (mode === "bi" && zh) html += '<p class="tr">' + esc(zh) + "</p>";
        }
      }
    }
    return html;
  }

  /* ============================================================
     LIBRARY
     ============================================================ */
  function viewLibrary() {
    setContext("library");
    var en = SET.lang === "en";
    var totalWords = BOOKS.reduce(function (s, b) { return s + b.words; }, 0);
    var totalMin = BOOKS.reduce(function (s, b) { return s + b.minutes; }, 0);

    var last = getLast(), contHtml = "";
    if (last) {
      var ct = continueTarget(last);
      if (ct) {
        contHtml =
          '<div class="continue rise" style="animation-delay:.25s">' +
            '<div><div class="ct-label">' + (SET.lang === "en" ? "Continue reading" : "繼續閱讀") + "</div>" +
            '<div class="ct-title"><b>' + esc(ct.title) + "</b> — " + esc(ct.sub) + "</div></div>" +
            '<a class="btn" href="' + ct.href + '">' + (SET.lang === "en" ? "Resume →" : "繼續 →") + "</a>" +
          "</div>";
      }
    }

    var items = BOOKS.map(function (b, i) {
      var num = String(b.num).padStart(2, "0");
      var t = headParts("bt/" + b.id, b.title);
      var s = headParts("bs/" + b.id, b.subtitle);
      var meta = en
        ? plural(b.chapters.length, "part") + "<br>" + b.minutes + " min · " + fmtWords(b.words) + " words"
        : b.chapters.length + " 部<br>" + b.minutes + " 分鐘";
      return '<a class="index-item" href="#/book/' + b.id + '" style="animation-delay:' + (0.35 + i * 0.06) + 's">' +
        '<div class="idx-num">' + num + "</div>" +
        '<div class="idx-main">' +
          '<h3 class="idx-title' + (t.cjk ? " cjk" : "") + '">' + esc(t.text) + "</h3>" +
          (t.second ? '<div class="tr-head">' + esc(t.second) + "</div>" : "") +
          '<div class="idx-sub' + (s.cjk ? " cjk" : "") + '">' + esc(s.text) + "</div>" +
        "</div>" +
        '<div class="idx-meta"><span class="yr">' + b.year + "</span>" + meta + "</div>" +
      "</a>";
    }).join("");

    var recs = RECS.map(function (r, i) {
      return '<a class="rec-item" href="#/rec/' + i + '">' +
        '<div class="rk">Recording ' + String(i + 1).padStart(2, "0") + "</div>" +
        '<div class="rt">' + esc(recTitle(r)) + "</div>" +
        '<div class="rm">' + r.minutes + " min · transcript</div>" +
      "</a>";
    }).join("");

    app.innerHTML =
      '<section class="hero"><div class="wrap">' +
        '<div class="eyebrow hero-kicker rise">The Un-Guru · Collected Works</div>' +
        '<h1 class="hero-title rise" style="animation-delay:.05s">U.G.<br><em>Krishnamurti</em></h1>' +
        '<p class="hero-sub rise" style="animation-delay:.12s">Not an avatar, not a teacher — “a philosopher of sorts” who insisted that mind is a myth, that enlightenment is an illusion, and that there is nothing whatever to seek.</p>' +
        '<blockquote class="hero-manifesto rise" style="animation-delay:.18s">' +
          "“My teaching, if that is the word you want to use, has no copyright. You are free to reproduce, distribute, interpret, misinterpret, distort, garble, do whatever you like — even claim authorship — without my consent or the permission of anybody.”" +
          "<cite>U.G. Krishnamurti</cite>" +
        "</blockquote>" +
        contHtml +
      "</div></section>" +

      '<section class="contents"><div class="wrap">' +
        '<div class="section-head"><h2' + (en ? "" : ' class="cjk"') + ">" + (en ? "The " + numWord(BOOKS.length) + " Books" : cnNum(BOOKS.length) + "部著作") + "</h2>" +
          '<span class="count">' + (en ? totalMin + " min · " + fmtWords(totalWords) + " words" : totalMin + " 分鐘") + "</span></div>" +
        '<div class="index-list">' + items + "</div>" +

        (recs ? '<div class="section-head" style="margin-top:4.5rem"><h2' + (en ? "" : ' class="cjk"') + ">" + (en ? "Recordings" : "錄音") + "</h2>" +
          '<span class="count">' + (en ? "Supplemental transcripts" : "補充逐字稿") + "</span></div>" +
          '<div class="rec-list">' + recs + "</div>" : "") +

        '<footer class="site-foot">The collected books and recordings of the man who refused to be a guru. ' +
        "U.G. Krishnamurti (1918–2007) placed everything he said in the public domain — “reproduce, distribute, interpret, misinterpret, distort, garble, do whatever you like.” " +
        "Text is the Internet Archive’s OCR of scanned editions, so expect occasional artifacts. A private reading edition.</footer>" +
      "</div></section>";

    BOOKS.forEach(function (b, i) {
      var node = app.querySelectorAll(".index-item")[i];
      if (node) node.classList.add("rise");
    });
    window.scrollTo(0, 0);
  }

  function continueTarget(last) {
    if (!last) return null;
    if (last.type === "rec" && RECS[last.id] != null) {
      var r = RECS[last.id];
      return { title: recTitle(r), sub: SET.lang === "en" ? "Recording" : "錄音", href: "#/rec/" + last.id };
    }
    var b = byId[last.id];
    if (!b) return null;
    var ci = Math.min(last.ch || 0, b.chapters.length - 1);
    var c = b.chapters[ci];
    var zh = SET.lang !== "en";
    return {
      title: zh ? (T("bt/" + b.id) || b.title) : b.title,
      sub: zh ? (T("ct/" + b.id + "/" + ci) || c.title) : c.title,
      href: "#/read/" + b.id + "/" + ci
    };
  }

  /* ============================================================
     BOOK OVERVIEW
     ============================================================ */
  var COVER_THEMES = [
    { bg: "#2a2722", ink: "#e7c98c" },
    { bg: "#3a2a23", ink: "#e9b48a" },
    { bg: "#26302e", ink: "#a9d2c4" },
    { bg: "#312530", ink: "#d8a9cf" },
    { bg: "#2c3038", ink: "#a8c2dd" },
    { bg: "#33241f", ink: "#e3a07a" }
  ];

  function coverHtml(b, small) {
    var t = COVER_THEMES[(b.num - 1) % COVER_THEMES.length];
    var cvr = headParts("bt/" + b.id, b.title);
    return '<div class="cover" style="--cover-bg:' + t.bg + ';--cover-ink:' + t.ink + '">' +
      '<div class="c-num">' + String(b.num).padStart(2, "0") + "</div>" +
      "<div>" +
        '<div class="c-title' + (cvr.cjk ? " cjk" : "") + '">' + esc(cvr.text) + "</div>" +
        '<div class="c-author">U.G. Krishnamurti</div>' +
      "</div></div>";
  }

  function viewBook(id) {
    var b = byId[id];
    if (!b) return viewLibrary();
    setContext("library");
    topbarTitle.textContent = b.title;

    var firstUnread = 0;
    for (var k = 0; k < b.chapters.length; k++) { if (!isRead(id, k)) { firstUnread = k; break; } }

    var en = SET.lang === "en";
    var rows = b.chapters.map(function (c, i) {
      var eye = eyebrowDisp(c.eyebrow || (i === 0 ? "Opening" : "Part " + i));
      var t = headParts("ct/" + id + "/" + i, c.title);
      var s = c.subtitle ? headParts("cs/" + id + "/" + i, c.subtitle) : null;
      var subSpan = s ? '<span class="ch-subt' + (s.cjk ? " cjk" : "") + '">' + esc(s.text) + "</span>" : "";
      var trLine = t.second ? '<span class="tr-head">' + esc(t.second) + "</span>" : "";
      return '<a class="ch-row ' + (isRead(id, i) ? "read" : "") + '" href="#/read/' + id + "/" + i + '" ' +
        'style="animation-delay:' + (0.2 + i * 0.04) + 's">' +
        '<div class="ch-eye">' + esc(eye) + "</div>" +
        '<div class="ch-ttl' + (t.cjk ? " cjk" : "") + '">' + esc(t.text) + trLine + subSpan + "</div>" +
        '<div class="ch-min">' + c.minutes + (en ? " min" : " 分") + '<span class="ch-dot"></span></div>' +
      "</a>";
    }).join("");

    app.innerHTML =
      '<section class="book-hero"><div class="wrap"><div class="book-hero-grid">' +
        '<div class="rise">' + coverHtml(b) + "</div>" +
        '<div class="book-hero-meta">' +
          '<a class="eyebrow rise" href="#/" style="animation-delay:.04s">' + (en ? "← The Collected Works" : "← 全集") + "</a>" +
          '<div class="rise" style="animation-delay:.08s">' + headHtml("h1", "book-title", "bt/" + id, b.title) + "</div>" +
          '<p class="book-sub rise' + (headParts("bs/" + id, b.subtitle).cjk ? " cjk" : "") + '" style="animation-delay:.12s">' + esc(headParts("bs/" + id, b.subtitle).text) + "</p>" +
          '<div class="book-stats rise" style="animation-delay:.16s">' +
            '<div class="stat"><b>' + b.chapters.length + "</b><span>" + (en ? "Parts" : "部") + "</span></div>" +
            '<div class="stat"><b>' + b.minutes + "</b><span>" + (en ? "Min read" : "分鐘") + "</span></div>" +
            '<div class="stat"><b>' + fmtWords(b.words) + "</b><span>" + (en ? "Words" : "字數") + "</span></div>" +
            '<div class="stat"><b>' + b.year + "</b><span>" + (en ? "Edition" : "版本") + "</span></div>" +
          "</div>" +
          '<div class="book-actions rise" style="animation-delay:.2s">' +
            '<a class="btn" href="#/read/' + id + "/" + firstUnread + '">' +
              (en ? (firstUnread > 0 ? "Continue →" : "Start reading →") : (firstUnread > 0 ? "繼續閱讀 →" : "開始閱讀 →")) + "</a>" +
            '<span class="btn ghost" style="cursor:default">' + esc(b.source) + "</span>" +
          "</div>" +
        "</div>" +
      "</div></div></section>" +

      '<section class="chapter-index"><div class="wrap" style="max-width:840px">' +
        '<div class="section-head"><h2' + (en ? "" : ' class="cjk"') + ">" + (en ? "Contents" : "目錄") + "</h2>" +
        '<span class="count">' + (en ? plural(b.chapters.length, "part") : b.chapters.length + " 部") + "</span></div>" +
        rows +
      "</div></section>";

    app.querySelectorAll(".ch-row").forEach(function (n) { n.classList.add("rise"); });
    window.scrollTo(0, 0);
  }

  /* ============================================================
     READER
     ============================================================ */
  var scrollHandler = null, saveTimer = null;

  function viewReader(id, ci) {
    var b = byId[id];
    if (!b) return viewLibrary();
    ci = Math.max(0, Math.min(ci, b.chapters.length - 1));
    var c = b.chapters[ci];
    setContext("reader");
    topbarTitle.textContent = b.title;
    tocBtn.hidden = false;
    buildToc(b, ci);

    var rawEye = c.eyebrow || (ci === 0 ? "Opening" : "Part " + ci);
    var eye = eyebrowDisp(rawEye);
    var subHtml = "";
    if (c.subtitle) {
      var shp = headParts("cs/" + id + "/" + ci, c.subtitle);
      subHtml = '<p class="art-subt' + (shp.cjk ? " cjk" : "") + '">' + esc(shp.text) + "</p>";
      if (shp.second) subHtml += '<p class="art-subt cjk" style="opacity:.82;font-size:1.02rem">' + esc(shp.second) + "</p>";
    }
    var bookLinkText = SET.lang === "zh" ? (T("bt/" + id) || b.title) : b.title;

    function navTitle(cc) { return SET.lang === "zh" ? (T("ct/" + id + "/" + cc.idx) || cc.ch.title) : cc.ch.title; }
    var prev = ci > 0 ? { ch: b.chapters[ci - 1], idx: ci - 1 } : null;
    var next = ci < b.chapters.length - 1 ? { ch: b.chapters[ci + 1], idx: ci + 1 } : null;
    var en = SET.lang === "en";

    var nav =
      '<nav class="art-nav">' +
        (prev
          ? '<a class="prev" href="#/read/' + id + "/" + (ci - 1) + '"><span class="nv-dir">' + (en ? "← Previous" : "← 上一篇") + "</span>" +
            '<span class="nv-ttl">' + esc(navTitle(prev)) + "</span></a>"
          : '<a class="prev disabled"><span class="nv-dir">' + (en ? "Beginning" : "卷首") + "</span></a>") +
        (next
          ? '<a class="next" href="#/read/' + id + "/" + (ci + 1) + '"><span class="nv-dir">' + (en ? "Next →" : "下一篇 →") + "</span>" +
            '<span class="nv-ttl">' + esc(navTitle(next)) + "</span></a>"
          : '<a class="next" href="#/book/' + id + '"><span class="nv-dir">' + (en ? "Back to contents" : "返回目錄") + "</span>" +
            '<span class="nv-ttl">' + esc(bookLinkText) + "</span></a>") +
      "</nav>";

    var meta = en
      ? "<span>" + c.minutes + " min read</span><span>" + fmtWords(c.words) + " words</span><span>Part " + (ci + 1) + " of " + b.chapters.length + "</span>"
      : "<span>" + c.minutes + " 分鐘</span><span>第 " + (ci + 1) + " 部／共 " + b.chapters.length + " 部</span>";

    app.innerHTML =
      '<article class="reader"><div class="article">' +
        '<header class="art-head">' +
          '<div class="art-eyebrow eyebrow">' + esc(eye) + "</div>" +
          '<a class="art-booklink" href="#/book/' + id + '">' + esc(bookLinkText) + "</a>" +
          headHtml("h1", "art-title", "ct/" + id + "/" + ci, c.title) + subHtml +
          '<div class="art-meta">' + meta + "</div>" +
        "</header>" +
        '<div class="prose' + (SET.lang === "zh" ? " zh" : "") + '">' + renderBlocks(c.blocks, "b/" + id + "/" + ci) + "</div>" +
      "</div>" + nav +
      '<div class="art-end"><div class="glyph">· · ·</div></div>' +
      "</article>";

    window.scrollTo(0, 0);

    // restore scroll if resuming this exact chapter
    var last = getLast();
    if (last && last.type !== "rec" && last.id === id && last.ch === ci && last.ratio > 0.02) {
      requestAnimationFrame(function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, max * last.ratio);
      });
    }

    attachReaderScroll(id, ci);
  }

  function attachReaderScroll(id, ci) {
    detachReaderScroll();
    scrollHandler = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? window.scrollY / max : 0;
      progressBar.style.width = (Math.min(1, Math.max(0, ratio)) * 100) + "%";
      if (window.scrollY > 4) topbar.classList.add("scrolled"); else topbar.classList.remove("scrolled");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        setLast({ type: "read", id: id, ch: ci, ratio: ratio });
        if (ratio > 0.9) markRead(id, ci);
      }, 250);
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });
    scrollHandler();
  }
  function detachReaderScroll() {
    if (scrollHandler) { window.removeEventListener("scroll", scrollHandler); scrollHandler = null; }
  }

  /* ---------- paragraph stepping (Space / margin click) ---------- */
  // distance from viewport top where a paragraph's first line should land
  var SNAP_TOP = 112;

  function stepParagraph(dir) {
    var prose = document.querySelector(".prose");
    if (!prose) return;
    // anchors = primary blocks only; never the .tr translation paragraphs
    var anchors = prose.querySelectorAll(":scope > p:not(.tr), :scope > .dialogue");
    if (!anchors.length) return;
    var cur = window.scrollY;
    var EPS = 6;
    // absolute scroll position that would place each anchor at the snap line
    var dests = [];
    anchors.forEach(function (a) {
      dests.push(a.getBoundingClientRect().top + window.scrollY - SNAP_TOP);
    });
    var dest = null;
    if (dir > 0) {
      for (var i = 0; i < dests.length; i++) {
        if (dests[i] > cur + EPS) { dest = dests[i]; break; }
      }
      if (dest === null) dest = document.documentElement.scrollHeight; // past last → end
    } else {
      for (var j = dests.length - 1; j >= 0; j--) {
        if (dests[j] < cur - EPS) { dest = dests[j]; break; }
      }
      if (dest === null) dest = 0;
    }
    window.scrollTo({ top: Math.max(0, dest), behavior: "smooth" });
  }

  function inReaderView() { return topbar.getAttribute("data-context") === "reader"; }
  function overlayOpen() {
    return drawer.classList.contains("open") || pop.classList.contains("open");
  }

  /* ---------- recordings ---------- */
  function recTitle(r) {
    var t = (r.title || "").replace(/^U\.?G\.?\s*KRISHNAMURTI\s*[—–-]\s*/i, "").replace(/^"|"$/g, "").trim();
    return t || "Recording";
  }

  function viewRecording(idx) {
    var r = RECS[idx];
    if (!r) return viewLibrary();
    setContext("reader");
    topbarTitle.textContent = "Recording";
    tocBtn.hidden = true;

    var en = SET.lang === "en";
    var linkHtml = r.url ? '<span><a class="art-booklink" href="' + esc(r.url) + '" target="_blank" rel="noopener">' + (en ? "Watch source ↗" : "觀看來源 ↗") + "</a></span>" : "";
    var rmeta = en
      ? "<span>" + r.minutes + " min read</span><span>" + fmtWords(r.words) + " words</span>"
      : "<span>" + r.minutes + " 分鐘</span>";

    app.innerHTML =
      '<article class="reader"><div class="article">' +
        '<header class="art-head">' +
          '<div class="art-eyebrow eyebrow">' + (en ? "Recording · Transcript" : "錄音 · 逐字稿") + "</div>" +
          '<a class="art-booklink" href="#/">' + (en ? "The Collected Works" : "全集") + "</a>" +
          '<h1 class="art-title">' + esc(recTitle(r)) + "</h1>" +
          (r.subtitle ? '<p class="art-subt">' + esc(r.subtitle) + "</p>" : "") +
          '<div class="art-meta">' + rmeta + linkHtml + "</div>" +
        "</header>" +
        '<div class="prose' + (SET.lang === "zh" ? " zh" : "") + '">' + renderBlocks(r.blocks, "rb/" + idx) + "</div>" +
      "</div>" +
      '<nav class="art-nav">' +
        (idx > 0 ? '<a class="prev" href="#/rec/' + (idx - 1) + '"><span class="nv-dir">← Previous</span><span class="nv-ttl">' + esc(recTitle(RECS[idx - 1])) + "</span></a>"
                 : '<a class="prev" href="#/"><span class="nv-dir">← Library</span><span class="nv-ttl">The Collected Works</span></a>') +
        (idx < RECS.length - 1 ? '<a class="next" href="#/rec/' + (idx + 1) + '"><span class="nv-dir">Next →</span><span class="nv-ttl">' + esc(recTitle(RECS[idx + 1])) + "</span></a>"
                 : '<a class="next" href="#/"><span class="nv-dir">Back to</span><span class="nv-ttl">Library</span></a>') +
      "</nav>" +
      '<div class="art-end"><div class="glyph">· · ·</div></div>' +
      "</article>";

    window.scrollTo(0, 0);
    detachReaderScroll();
    scrollHandler = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? window.scrollY / max : 0;
      progressBar.style.width = (Math.min(1, Math.max(0, ratio)) * 100) + "%";
      if (window.scrollY > 4) topbar.classList.add("scrolled"); else topbar.classList.remove("scrolled");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { setLast({ type: "rec", id: idx, ratio: ratio }); }, 250);
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });
    scrollHandler();
  }

  /* ============================================================
     Contents drawer
     ============================================================ */
  var drawer = document.getElementById("toc-drawer");
  var tocList = document.getElementById("toc-list");
  var scrim = document.getElementById("scrim");

  function buildToc(b, activeCi) {
    var bookTitle = SET.lang === "zh" ? (T("bt/" + b.id) || b.title) : b.title;
    var html = '<div class="toc-book' + (SET.lang === "zh" && T("bt/" + b.id) ? " cjk" : "") + '">' + esc(bookTitle) + "</div>";
    html += b.chapters.map(function (c, i) {
      var eye = eyebrowDisp(c.eyebrow || (i === 0 ? "Opening" : "Part " + i));
      var t = headParts("ct/" + b.id + "/" + i, c.title);
      var ttl = SET.lang === "zh" ? t.text : c.title;
      var cjk = SET.lang === "zh" && t.cjk;
      return '<a class="toc-link ' + (i === activeCi ? "active" : "") + '" href="#/read/' + b.id + "/" + i + '">' +
        '<span class="tl-eye">' + esc(eye) + "</span>" +
        '<span class="tl-ttl' + (cjk ? " cjk" : "") + '">' + esc(ttl) + "</span>" +
        '<span class="tl-min">' + c.minutes + "′</span>" +
      "</a>";
    }).join("");
    tocList.innerHTML = html;
  }

  function openDrawer() { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); showScrim("drawer"); }
  function closeDrawer() { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); maybeHideScrim(); }

  /* ---------- settings popover ---------- */
  var pop = document.getElementById("settings-panel");
  function openPop() { pop.classList.add("open"); pop.setAttribute("aria-hidden", "false"); showScrim("pop"); }
  function closePop() { pop.classList.remove("open"); pop.setAttribute("aria-hidden", "true"); maybeHideScrim(); }

  var scrimFor = {};
  function showScrim(who) { scrimFor[who] = true; scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add("show"); }); }
  function maybeHideScrim() {
    if (!drawer.classList.contains("open") && !pop.classList.contains("open")) {
      scrim.classList.remove("show");
      setTimeout(function () { if (!scrim.classList.contains("show")) scrim.hidden = true; }, 350);
    }
  }

  function syncSegs() {
    setSeg("lang-seg", "lang", SET.lang);
    setSeg("theme-seg", "theme", SET.theme);
    setSeg("size-seg", "size", String(SET.size));
    setSeg("face-seg", "face", SET.face);
    setSeg("measure-seg", "measure", SET.measure);
  }
  function setSeg(segId, attr, val) {
    var seg = document.getElementById(segId);
    if (!seg) return;
    seg.querySelectorAll("button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-" + attr) === val);
    });
  }

  /* ============================================================
     Wiring
     ============================================================ */
  function setContext(ctx) {
    topbar.setAttribute("data-context", ctx);
    if (ctx !== "reader") { tocBtn.hidden = true; topbarTitle.textContent = ""; detachReaderScroll(); progressBar.style.width = "0%"; }
  }

  document.getElementById("toc-btn").addEventListener("click", openDrawer);
  document.getElementById("toc-close").addEventListener("click", closeDrawer);
  document.getElementById("settings-btn").addEventListener("click", function () {
    pop.classList.contains("open") ? closePop() : openPop();
  });
  scrim.addEventListener("click", function () { closeDrawer(); closePop(); });
  drawer.addEventListener("click", function (e) { if (e.target.closest(".toc-link")) closeDrawer(); });

  document.getElementById("lang-seg").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-lang]");
    if (!btn) return;
    SET.lang = btn.getAttribute("data-lang");
    save("ug.lang", SET.lang);
    applySettings();
    render();   // re-render current view in the new language; keep panel open
  });
  document.getElementById("theme-seg").addEventListener("click", segClick("theme", function (v) { SET.theme = v; save("ug.theme", v); }));
  document.getElementById("size-seg").addEventListener("click", segClick("size", function (v) { SET.size = parseInt(v, 10); save("ug.size", v); }));
  document.getElementById("face-seg").addEventListener("click", segClick("face", function (v) { SET.face = v; save("ug.face", v); }));
  document.getElementById("measure-seg").addEventListener("click", segClick("measure", function (v) { SET.measure = v; save("ug.measure", v); }));

  function segClick(attr, fn) {
    return function (e) {
      var btn = e.target.closest("button[data-" + attr + "]");
      if (!btn) return;
      fn(btn.getAttribute("data-" + attr));
      applySettings();
    };
  }

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "Escape") { closeDrawer(); closePop(); return; }
    // Space / Shift+Space → step English paragraphs to the snap line
    if ((e.code === "Space" || e.key === " ") && inReaderView()) {
      if (overlayOpen()) return;
      e.preventDefault();
      stepParagraph(e.shiftKey ? -1 : 1);
      return;
    }
    var m = (location.hash || "").match(/^#\/read\/([^/]+)\/(\d+)/);
    if (e.key === "t" && topbar.getAttribute("data-context") === "reader") { e.preventDefault(); drawer.classList.contains("open") ? closeDrawer() : openDrawer(); return; }
    if (!m) return;
    var b = byId[m[1]], ci = parseInt(m[2], 10);
    if (!b) return;
    if (e.key === "ArrowRight" && ci < b.chapters.length - 1) location.hash = "#/read/" + b.id + "/" + (ci + 1);
    if (e.key === "ArrowLeft" && ci > 0) location.hash = "#/read/" + b.id + "/" + (ci - 1);
  });

  /* left-click the empty space beside the text → next paragraph */
  document.addEventListener("click", function (e) {
    if (!inReaderView() || overlayOpen()) return;
    var t = e.target;
    if (!t || !t.classList) return;
    var onEmpty = t.classList.contains("reader") || t.classList.contains("article") || t.classList.contains("prose");
    if (!onEmpty) return;
    if (!window.getSelection().isCollapsed) return; // don't hijack text selection
    stepParagraph(1);
  });

  /* non-reader scroll: just toggle topbar border */
  window.addEventListener("scroll", function () {
    if (topbar.getAttribute("data-context") === "reader") return;
    if (window.scrollY > 4) topbar.classList.add("scrolled"); else topbar.classList.remove("scrolled");
  }, { passive: true });

  /* ---------- router ---------- */
  function render() {
    var h = location.hash || "#/";
    var parts = h.replace(/^#\//, "").split("/").filter(Boolean);
    if (parts.length === 0) return viewLibrary();
    if (parts[0] === "book") return viewBook(parts[1]);
    if (parts[0] === "read") return viewReader(parts[1], parseInt(parts[2] || "0", 10));
    if (parts[0] === "rec") return viewRecording(parseInt(parts[1] || "0", 10));
    return viewLibrary();
  }
  function route() {
    closeDrawer(); closePop();
    render();
  }

  window.addEventListener("hashchange", route);
  applySettings();
  route();
})();
