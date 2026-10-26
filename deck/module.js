/*
 * Presenter card deck: the micromodule card engine (copied from annual-planning-and-review/module/)
 * in a wide, slide-like layout for screen sharing.
 *
 * Content comes from window.MODULE (content.js, which build.py writes from content.json).
 * No SCORM tracking, no blocking cards: the presenter navigates freely.
 *
 * Keys: Right / Space / PageDown next, Left / PageUp back, Home first, End last,
 *       F fullscreen, N speaker notes (hidden by default), T timer (hidden by default),
 *       R restart the session timer, O open the card's first link, P presenter window,
 *       Enter press the card's big button (the hand-over card), ? help.
 *
 * Presenter view: the same page with ?presenter (P opens it; or open that address yourself in a
 * second window of the same browser). It shows each card's "say" talking points and "act" cues,
 * a thumbnail, the next card, the session timer against the 60-minute plan and a countdown of
 * the card's "seconds" budget; it drives the deck. Both windows share a clock in localStorage and
 * talk over BroadcastChannel (with localStorage events as a fallback), so they must share an origin.
 *
 * Hand-over: the card with "goto" shows a big button. Inside an LMS frame (a SCORM API in a parent
 * window, e.g. Moodle's player) it fades to white and sends the top window to M.revealUrl (set at
 * build time); anywhere else it opens that URL in a new tab. The deck remembers the next card, so
 * coming back (browser Back) resumes after the hand-over.
 */
(function () {
  'use strict';
  var M = window.MODULE;
  var PRESENTER = /[?&]presenter\b/.test(location.search);
  var CHANNEL = 'mm-deck-' + M.id;
  var RESUME_KEY = 'mm_deck_resume_' + M.id;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bus = null;
  try { bus = new BroadcastChannel(CHANNEL); } catch (e) { /* not supported: presenter window unavailable */ }

  var SEG = {};
  M.segments.forEach(function (s) { SEG[s.id] = s; });

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function add(parent, tag, cls, html) { var e = el(tag, cls, html); parent.appendChild(e); return e; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function mins(t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s).slice(-2);
  }
  function windowOf(c) {
    var s = SEG[c.segment];
    if (c.at) { var p = c.at.split('–'); return { start: p[0], end: p[1] }; }
    return { start: s.start, end: s.end };
  }

  var ICON = {
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.8 8.2l2.1 2.1 4.3-4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    box: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10.2l2.8 2.8L14.5 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    out: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3h6v6M17 3l-8 8M14 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  // A simple waveform tile for the podcast (no artwork exists for it)
  function waveTile() {
    var h = [10, 22, 34, 18, 44, 30, 56, 38, 24, 48, 62, 40, 28, 52, 36, 20, 44, 58, 32, 18, 40, 26, 14];
    var svg = '<svg viewBox="0 0 240 135" aria-hidden="true"><rect width="240" height="135" fill="#0D3C61"/>';
    h.forEach(function (v, k) {
      var x = 32 + k * 8;
      svg += '<rect x="' + x + '" y="' + (67.5 - v / 2) + '" width="4.4" height="' + v + '" rx="2.2" fill="' + (k < 9 ? '#C9A882' : 'rgba(255,255,255,.55)') + '"/>';
    });
    return svg + '</svg>';
  }
  function img(name, alt) {
    var f = el('div', 'still');
    if (name === '@audio') { f.classList.add('wave'); f.innerHTML = waveTile(); return f; }
    var i = add(f, 'img');
    i.src = M.images[name];
    i.alt = alt || '';
    i.decoding = 'async';
    return f;
  }
  // Prompt text: [slots] highlighted, {{changed words}} underlined, "LABEL:" line starts tagged
  function promptHtml(text, tagLabels) {
    return text.split('\n').map(function (line) {
      var h = esc(line)
        .replace(/\{\{(.+?)\}\}/g, '<span class="changed">$1</span>')
        .replace(/\[([^\]]+)\]/g, '<span class="slot">[$1]</span>');
      if (tagLabels) h = h.replace(/^([A-Z][A-Z ]+):/, '<b class="tag">$1</b>');
      return '<span class="pl' + (/^- /.test(line) ? ' bullet' : '') + '">' + h + '</span>';
    }).join('');
  }
  function linkRow(sec, links) {
    if (!links || !links.length) return;
    var row = add(sec, 'div', 'btn-row');
    links.forEach(function (l, k) {
      var a = add(row, 'a', 'btn' + (l.ghost ? ' ghost' : '') + (k === 0 ? ' primary' : ''), esc(l.text) + ICON.out);
      a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
    });
  }
  function header(sec, c) {
    if (c.eyebrow) add(sec, 'p', 'eyebrow', esc(c.eyebrow));
    if (c.title) add(sec, 'h2', '', esc(c.title));
  }
  function paragraphs(sec, list, cls) { (list || []).forEach(function (t) { add(sec, 'p', cls || 'body', esc(t)); }); }
  function callout(sec, text) { if (text) add(sec, 'div', 'callout', esc(text)); }
  function items(sec, list, reveal) {
    var ol = add(sec, 'ol', 'items' + (list.length > 3 ? ' many' : ''));
    list.forEach(function (it, k) {
      var li = add(ol, 'li', reveal ? 'step' : '', '<span class="n" aria-hidden="true">' + (k + 1) + '</span><div><b>' + esc(it.head) + '</b> <span>' + esc(it.text) + '</span></div>');
      li.style.setProperty('--i', k);
    });
    return ol;
  }

  // ---- Renderers, one per card type ----
  var render = {
    cover: function (c, sec, i) {
      sec.classList.add('cover');
      add(sec, 'p', 'eyebrow', esc(c.eyebrow));
      add(sec, 'h1', '', esc(c.title));
      add(sec, 'p', 'lead', esc(c.lead));
      linkRow(sec, c.links);
      if (i === 0) add(sec, 'p', 'tap-hint', 'Press &rarr; to go on &middot; &larr; to go back');
    },
    divider: function (c, sec) {
      sec.classList.add('divider');
      if (c.plain) { sec.classList.add('plain'); add(sec, 'h1', '', esc(c.title)); return; }
      var s = SEG[c.segment];
      add(sec, 'p', 'time', esc(s.start + '–' + s.end));
      add(sec, 'h1', '', esc(c.title));
      if (c.lead) add(sec, 'p', 'lead', esc(c.lead));
    },
    statement: function (c, sec) {
      sec.classList.add('statement');
      add(sec, 'p', 'lead', esc(c.lead));
      add(sec, 'h1', '', esc(c.title));
      if (c.goto) {
        var row = add(sec, 'div', 'btn-row');
        var b = add(row, 'button', 'btn go', '<span>' + esc(c.goto) + '</span>' + ICON.arrow);
        b.type = 'button';
        b.addEventListener('click', function () { handOver(); });
      }
    },
    ask: function (c, sec) {
      sec.classList.add('ask');
      add(sec, 'p', 'eyebrow', ICON.chat + '<span>' + esc(c.eyebrow) + '</span>');
      add(sec, 'h1', '', esc(c.title));
      if (c.sub) add(sec, 'p', 'sub', esc(c.sub));
      if (c.how) add(sec, 'p', 'how', esc(c.how));
    },
    lesson: function (c, sec) {
      header(sec, c);
      paragraphs(sec, c.body);
      if (c.chips) {
        var ul = add(sec, 'ul', 'chips');
        c.chips.forEach(function (t, k) { var li = add(ul, 'li', '', ICON.check + '<span>' + esc(t) + '</span>'); li.style.setProperty('--i', k); });
      }
      if (c.items) items(sec, c.items, c.reveal);
      callout(sec, c.callout);
      linkRow(sec, c.links);
    },
    compare: function (c, sec) {
      header(sec, c);
      var w = add(sec, 'div', 'compare');
      c.panels.forEach(function (p) {
        var d = add(w, 'div', 'panel' + (p.dark ? ' dark' : ''));
        add(d, 'h3', '', esc(p.head));
        add(d, 'p', '', esc(p.text));
      });
      callout(sec, c.callout);
    },
    rule: function (c, sec) {
      sec.classList.add('rule');
      add(sec, 'p', 'eyebrow', 'How AI works · ' + c.n + ' of 3');
      var g = add(sec, 'div', 'rule-grid');
      var f = add(g, 'div', 'fact');
      add(f, 'span', 'big-n', String(c.n)).setAttribute('aria-hidden', 'true');
      add(f, 'h1', '', esc(c.fact));
      add(f, 'p', 'lead', esc(c.detail));
      add(g, 'div', 'arrow', ICON.arrow).setAttribute('aria-hidden', 'true');
      var h = add(g, 'div', 'habit');
      add(h, 'p', 'habit-label', 'Habit:');
      add(h, 'p', 'habit-text', esc(c.habit.charAt(0).toUpperCase() + c.habit.slice(1)));
      h.setAttribute('aria-label', 'Habit: ' + c.habit);
    },
    ingredients: function (c, sec) {
      header(sec, c);
      var ol = add(sec, 'ol', 'ingredients');
      c.items.forEach(function (it, k) {
        var li = add(ol, 'li', '', '<span class="n" aria-hidden="true">' + (k + 1) + '</span><b>' + esc(it.name) + '</b><span>' + esc(it.text) + '</span>');
        li.style.setProperty('--i', k);
      });
    },
    prompt: function (c, sec) {
      sec.classList.add('prompt-card', c.kind);
      header(sec, c);
      add(sec, 'div', 'prompt-box ' + c.kind, promptHtml(c.text, c.kind === 'strong'));
      if (c.caption) add(sec, 'p', 'caption', esc(c.caption));
    },
    practice: function (c, sec) {
      sec.classList.add('practice');
      var head = add(sec, 'div', 'practice-head');
      add(head, 'div', 'badge', '<small>Practice</small><b>' + c.n + '</b>');
      var t = add(head, 'div', 'practice-title');
      add(t, 'h2', '', esc(c.title));
      var meta = add(t, 'div', 'practice-meta');
      add(meta, 'span', 'pill', esc(c.minutes + ' minutes' + (c.minutesNote ? ', ' + c.minutesNote : '')));
      var a = add(meta, 'a', 'pill pack', 'Open the practice pack, section ' + c.section + ICON.out);
      a.href = M.packUrl; a.target = '_blank'; a.rel = 'noopener';
      add(sec, 'p', 'body', promptHtml(c.intro, false));
      var w = add(sec, 'div', 'prompts' + (c.prompts.length > 1 ? ' two' : ''));
      c.prompts.forEach(function (p) {
        var d = add(w, 'div', 'prompt-item');
        add(d, 'p', 'prompt-label', esc(p.label));
        add(d, 'div', 'prompt-box', promptHtml(p.text, false));
      });
      if (c.after) add(sec, 'p', 'after', esc(c.after));
    },
    demo: function (c, sec) {
      sec.classList.add('demo');
      var g = add(sec, 'div', 'demo-grid');
      var left = add(g, 'div', 'demo-text');
      header(left, c);
      if (c.points) {
        var ul = add(left, 'ul', 'points');
        c.points.forEach(function (t) { add(ul, 'li', '', esc(t)); });
      }
      if (c.steps) {
        var ol = add(left, 'ol', 'mini-steps');
        c.steps.forEach(function (t, k) { add(ol, 'li', '', '<span>' + (k + 1) + '</span>' + esc(t)); });
      }
      linkRow(left, c.links);
      var right = add(g, 'div', 'demo-media');
      right.appendChild(img(c.audio ? '@audio' : c.image, c.alt));
      if (c.ask) add(right, 'p', 'demo-ask', ICON.chat + '<span>' + esc(c.ask) + '</span>');
    },
    showcase: function (c, sec) {
      header(sec, c);
      var w = add(sec, 'div', 'tiles');
      c.tiles.forEach(function (t) {
        var d = add(w, 'div', 'tile');
        d.appendChild(img(t.audio ? '@audio' : t.image, t.alt));
        add(d, 'p', 'kind', esc(t.kind));
        add(d, 'h3', '', esc(t.name));
        linkRow(d, [t.link]);
      });
    },
    gallery: function (c, sec) {
      sec.classList.add('gallery');
      // One image or the 3x3 grid: words on the left, pictures on the right
      var split = c.grid || c.images.length === 1;
      var host = split ? add(sec, 'div', 'split' + (c.grid ? ' wide' : '')) : sec;
      var words = split ? add(host, 'div', 'split-text') : sec;
      header(words, c);
      paragraphs(words, c.body, 'lead');
      if (split) { callout(words, c.callout); c = Object.assign({}, c, { callout: null }); }
      var w = add(host, 'div', 'gal' + (c.grid ? ' grid9' : ' n' + c.images.length));
      c.images.forEach(function (im, k) {
        var f = img(im.src, im.alt);
        if (c.grid) { add(f, 'span', 'num', String(k + 1)).setAttribute('aria-hidden', 'true'); f.style.setProperty('--i', k); }
        w.appendChild(f);
      });
      callout(sec, c.callout);
    },
    flow: function (c, sec) {
      header(sec, c);
      var ol = add(sec, 'ol', 'flow');
      c.steps.forEach(function (t, k) {
        var li = add(ol, 'li', k === c.steps.length - 1 ? 'last' : '', '<span class="dot">' + (k + 1) + '</span><span class="t">' + esc(t) + '</span>');
        li.style.setProperty('--i', k);
      });
    },
    checklist: function (c, sec) {
      header(sec, c);
      add(sec, 'p', 'lead', esc(c.lead));
      var ul = add(sec, 'ul', 'checklist');
      c.items.forEach(function (t) { add(ul, 'li', '', ICON.box + '<span>' + esc(t) + '</span>'); });
    },
    asks: function (c, sec) {
      header(sec, c);
      var ol = add(sec, 'ol', 'asks');
      c.items.forEach(function (it, k) {
        add(ol, 'li', '', '<span class="n" aria-hidden="true">' + (k + 1) + '</span><div><b>' + esc(it.q) + '</b>' + (it.hint ? '<span>' + esc(it.hint) + '</span>' : '') + '</div>');
      });
    }
  };
  var THEME = {
    cover: 'blue', divider: 'blue', statement: 'blue', ask: 'blue', practice: 'sand', checklist: 'sand', asks: 'sand'
  };

  // ---- Build the cards ----
  var cards = M.cards.map(function (c, i) {
    var sec = el('section', 'card t-' + c.type + ' theme-' + (THEME[c.type] || 'cream'));
    sec.dataset.label = c.label || c.title;
    sec.setAttribute('aria-roledescription', 'slide');
    var inner = add(sec, 'div', 'inner');
    render[c.type](c, inner, i);
    return { def: c, sec: sec, steps: sec.querySelectorAll('.step'), shown: 0 };
  });

  // ---- Shared clock and messages (deck <-> presenter window, same origin) ----
  // The clock lives in localStorage, so both windows read the same numbers: the session timer
  // (base + time since start while running) and the current card's countdown (cbase + time since
  // the card was shown). Messages go over BroadcastChannel and, as a fallback, localStorage events.
  var BUDGET = M.cards.map(function (c) { return c.seconds || 0; });
  var PLAN_START = [];
  var TOTAL = BUDGET.reduce(function (sum, s, k) { PLAN_START[k] = sum; return sum + s; }, 0);
  var CLOCK_KEY = 'mm_deck_clock_' + M.id;
  var MSG_KEY = 'mm_deck_msg_' + M.id;
  var STALE_MS = 8 * 3600 * 1000;     // a clock untouched for 8 hours is yesterday's rehearsal: start fresh
  var myId = Math.random().toString(36).slice(2);
  var memClock = null;
  var handlers = [];
  var seen = {};
  function freshClock() { return { run: false, base: 0, since: 0, ci: -1, cbase: 0, csince: 0, touched: Date.now() }; }
  function readClock() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(CLOCK_KEY)); } catch (e) { /* storage blocked */ }
    if (!s) s = memClock;
    if (!s || Date.now() - (s.touched || 0) > STALE_MS) s = freshClock();
    return s;
  }
  function writeClock(s) {
    s.touched = Date.now();
    memClock = s;
    try { localStorage.setItem(CLOCK_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: messages carry it */ }
    send({ type: 'clock', s: s });
  }
  function send(msg) {
    msg.from = myId;
    msg.n = myId + Math.random().toString(36).slice(2);
    if (bus) { try { bus.postMessage(msg); } catch (e) { /* closed */ } }
    try { localStorage.setItem(MSG_KEY, JSON.stringify(msg)); } catch (e) { /* storage blocked */ }
  }
  function receive(msg) {
    if (!msg || msg.from === myId || seen[msg.n]) return;
    seen[msg.n] = 1;
    if (msg.type === 'clock' && msg.s) memClock = msg.s;
    handlers.forEach(function (h) { h(msg); });
  }
  if (bus) bus.onmessage = function (e) { receive(e.data); };
  window.addEventListener('storage', function (e) {
    if (e.key === MSG_KEY && e.newValue) { try { receive(JSON.parse(e.newValue)); } catch (x) { /* ignore */ } }
  });
  function elapsedMs(s, t) { return s.base + (s.run ? t - s.since : 0); }
  function cardMs(s, t) { return s.cbase + (s.run ? t - s.csince : 0); }
  function clockStart() {
    var s = readClock(), t = Date.now();
    if (!s.run) { s.run = true; s.since = t; s.csince = t; }
    writeClock(s);
  }
  function clockPause() {
    var s = readClock(), t = Date.now();
    if (s.run) { s.base += t - s.since; s.cbase += t - s.csince; s.run = false; }
    writeClock(s);
  }
  function clockReset(run) {
    var s = readClock(), t = Date.now();
    s.base = 0; s.cbase = 0; s.since = t; s.csince = t; s.run = !!run;
    writeClock(s);
  }
  // A new card restarts its countdown (going back to a card restarts it too). The session timer
  // starts by itself when you leave the title card (counting the title card's budget as done).
  function clockCard(i) {
    var s = readClock(), t = Date.now();
    if (s.ci === i) return;
    var from = s.ci;
    s.ci = i; s.cbase = 0; s.csince = t;
    if (!s.run && s.base === 0 && i > 0) { s.run = true; s.since = t; if (from === 0) s.base = BUDGET[0] * 1000; }
    writeClock(s);
  }
  function mmss(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
  function presenterUrl() { return location.href.split('#')[0].split('?')[0] + '?presenter'; }

  // ---- Presenter window (index.html?presenter): talking points, timers, drives the deck ----
  if (PRESENTER) { presenterView(); return; }

  var deck = document.getElementById('deck');
  var topbar = document.getElementById('topbar');
  var segBox = document.getElementById('segments');
  var series = document.getElementById('series');
  var counter = document.getElementById('counter');
  var live = document.getElementById('live');
  var notesEl = document.getElementById('notes');
  var timerEl = document.getElementById('timer');
  var helpEl = document.getElementById('help');
  var toastEl = document.getElementById('toast');
  var veil = document.getElementById('veil');
  cards.forEach(function (c) { deck.appendChild(c.sec); });
  // Story progress: one segment per card, as in the micromodules
  var segs = cards.map(function () { var s = add(segBox, 'span', 'seg'); add(s, 'span'); return s; });
  document.title = M.title;

  var current = -1;
  function setSteps(i, n) {
    var c = cards[i];
    c.shown = Math.max(0, Math.min(c.steps.length, n));
    c.steps.forEach(function (s, k) { s.classList.toggle('on', k < c.shown); });
  }
  function show(i, fromEnd) {
    if (i < 0 || i >= cards.length) return;
    current = i;
    cards.forEach(function (c, k) {
      c.sec.classList.toggle('active', k === i);
      c.sec.classList.toggle('before', k < i);
      c.sec.setAttribute('aria-hidden', k === i ? 'false' : 'true');
      c.sec.inert = k !== i;
    });
    setSteps(i, fromEnd ? cards[i].steps.length : 0);
    var c = cards[i];
    var dark = c.sec.classList.contains('theme-blue');
    document.body.classList.toggle('on-dark', dark);
    topbar.classList.toggle('on-sand', c.sec.classList.contains('theme-sand'));
    segs.forEach(function (s, k) { s.classList.toggle('done', k < i); s.classList.toggle('current', k === i); });
    series.textContent = M.title + ' · ' + SEG[c.def.segment].name;
    counter.textContent = (i + 1) + ' / ' + cards.length;
    live.textContent = 'Slide ' + (i + 1) + ' of ' + cards.length + ': ' + c.sec.dataset.label;
    renderNotes(notesEl, i);
    clockCard(i);
    tick();
    announce();
    try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* file: or sandbox */ }
  }
  function next() {
    var c = cards[current];
    if (c.shown < c.steps.length) { setSteps(current, c.shown + 1); announce(); return; }
    show(current + 1);
  }
  function prev() {
    var c = cards[current];
    if (c.shown > 0) { setSteps(current, c.shown - 1); announce(); return; }
    show(current - 1, true);
  }
  function announce() {
    send({ type: 'at', i: current, shown: cards[current].shown, build: M.build || '' });
  }

  // ---- Notes on this screen (N; hidden by default, never needed with the presenter window) ----
  function renderNotes(box, i) {
    var c = cards[i].def;
    var w = windowOf(c);
    var html = '<div class="notes-head"><b>' + (i + 1) + '. ' + esc(c.label || c.title) + '</b><span>' + esc(SEG[c.segment].name) + ' · plan ' + esc(w.start + '–' + w.end) + ' · <i data-elapsed></i></span></div>';
    if (c.cue) html += '<p class="cue">' + esc(c.cue) + '</p>';
    (c.act || []).forEach(function (a) { html += '<p class="cue">' + esc(a) + '</p>'; });
    if (c.say && c.say.length) html += '<ul>' + c.say.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    var nx = cards[i + 1];
    html += '<p class="next-up">Next: ' + (nx ? esc(nx.def.label || nx.def.title) : 'end of deck') + '</p>';
    box.innerHTML = html;
  }
  function toggleNotes() {
    var on = notesEl.hidden;
    notesEl.hidden = !on;
    document.body.classList.toggle('notes-on', on);
  }

  // ---- Timer on this screen: hidden by default (T shows it); R restarts the session timer ----
  function tick() {
    if (current < 0) return;
    var s = readClock(), t = Date.now();
    var sec = elapsedMs(s, t) / 1000;
    var started = s.run || s.base > 0;
    var w = windowOf(cards[current].def);
    timerEl.innerHTML = '<b>' + clock(sec) + '</b><span>plan ' + esc(w.start + '–' + w.end) + '</span>';
    timerEl.classList.toggle('late', started && sec > mins(w.end) * 60);
    timerEl.classList.toggle('idle', !started);
    var e = notesEl.querySelector('[data-elapsed]');
    if (e) e.textContent = started ? 'elapsed ' + clock(sec) : 'timer not started';
  }
  setInterval(tick, 1000);

  // ---- Fullscreen ----
  // Inside an LMS the deck runs in the SCORM player's iframe, which has allowfullscreen. Where a
  // frame doesn't allow it, say how to get browser full screen instead.
  var toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function toggleFull() {
    var d = document, root = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      return;
    }
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    var enabled = d.fullscreenEnabled || d.webkitFullscreenEnabled;
    if (!req || !enabled) { toast('Press F11 for browser full screen'); return; }
    var r = req.call(root);
    if (r && r.catch) r.catch(function () { toast('Press F11 for browser full screen'); });
  }

  // ---- Hand-over to the LMS (the reveal) ----
  function hasApi(w) {
    try { return !!(w && (w.API || w.API_1484_11)); } catch (e) { return false; /* cross-origin */ }
  }
  function findApi() {
    var w = window;
    for (var k = 0; k < 10; k++) {
      if (hasApi(w)) return true;
      if (w.parent === w) break;
      w = w.parent;
    }
    return hasApi(window.opener);
  }
  var IN_LMS = window.top !== window.self && findApi();
  var handing = false;
  function handOver() {
    var url = M.revealUrl;
    if (!url || handing) return;
    if (!IN_LMS) { window.open(url, '_blank', 'noopener'); return; }
    // Coming back to the deck in this tab (browser Back) resumes on the card after this one
    try { sessionStorage.setItem(RESUME_KEY, String(Math.min(current + 1, cards.length - 1))); } catch (e) { /* storage blocked */ }
    handing = true;
    function go() {
      try { window.top.location.href = url; } catch (e) {
        handing = false;
        veil.classList.remove('on');
        window.open(url, '_blank', 'noopener');
      }
    }
    if (REDUCED) { go(); return; }
    veil.classList.add('on');
    setTimeout(go, 650);
  }
  // Coming back from the LMS with browser Back: drop the veil
  function takeResume() {
    var r = null;
    try { r = sessionStorage.getItem(RESUME_KEY); sessionStorage.removeItem(RESUME_KEY); } catch (e) { /* storage blocked */ }
    r = parseInt(r, 10);
    return r >= 0 && r < cards.length ? r : null;
  }
  window.addEventListener('pageshow', function (e) {
    handing = false;
    veil.classList.remove('on');
    if (e.persisted) { var r = takeResume(); if (r !== null) show(r); } // restored from the back/forward cache
  });
  function openFirstLink() {
    var a = cards[current].sec.querySelector('a[href]');
    if (a) window.open(a.href, '_blank', 'noopener');
  }

  // ---- Presenter window: P opens it; if the browser blocks the pop-up, a small toast (only after
  // P, gone after 15 s) gives the address to open in another window, with a copy button ----
  var pvToastEl = null, pvToastTimer = null;
  function copyText(text, btn) {
    function done(ok) { btn.textContent = ok ? 'Copied' : 'Select and copy'; }
    function legacy() {
      var ta = el('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* unsupported */ }
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
    else legacy();
  }
  function hidePvToast() { if (pvToastEl) pvToastEl.hidden = true; clearTimeout(pvToastTimer); }
  function pvToast(url) {
    if (!pvToastEl) {
      pvToastEl = add(document.body, 'div', 'pv-toast');
      pvToastEl.setAttribute('role', 'status');
    }
    pvToastEl.innerHTML = '<p>Pop-up blocked. Open the presenter view in another window:</p><code></code><div><button type="button" class="pv-copy">Copy address</button><button type="button" class="pv-x" aria-label="Close">&times;</button></div>';
    pvToastEl.querySelector('code').textContent = url;
    var copyBtn = pvToastEl.querySelector('.pv-copy');
    copyBtn.addEventListener('click', function () { copyText(url, copyBtn); });
    pvToastEl.querySelector('.pv-x').addEventListener('click', hidePvToast);
    pvToastEl.hidden = false;
    clearTimeout(pvToastTimer);
    pvToastTimer = setTimeout(hidePvToast, 15000);
  }
  function openPresenter() {
    var url = presenterUrl(), w = null;
    try { w = window.open(url, 'mm-deck-presenter', 'popup,width=1280,height=800'); } catch (e) { w = null; }
    if (w) { try { w.focus(); } catch (e) { /* ignore */ } hidePvToast(); return; }
    pvToast(url);
  }

  // Help (?): learners in an LMS only see the moving keys; elsewhere it also gives the presenter
  // view's address with a copy button
  (function () {
    helpEl.querySelectorAll('[data-presenter]').forEach(function (n) { n.hidden = IN_LMS; });
    var box = document.getElementById('helpPv');
    if (!box || IN_LMS) return;
    box.querySelector('code').textContent = presenterUrl();
    var b = box.querySelector('button');
    b.addEventListener('click', function () { copyText(presenterUrl(), b); });
  })();

  // ---- Input ----
  deck.addEventListener('click', function (e) {
    if (e.target.closest('a, button')) return;
    if (window.getSelection && String(window.getSelection())) return;
    if (e.clientX < window.innerWidth / 4) prev(); else next();
  });
  var sx = null;
  deck.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 60) { if (dx < 0) next(); else prev(); }
  });
  function onKey(k, e) {
    if (e && (e.ctrlKey || e.metaKey || e.altKey)) return false;
    switch (k) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Spacebar': next(); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace': prev(); break;
      case 'Home': show(0); break;
      case 'End': show(cards.length - 1); break;
      case 'f': case 'F': toggleFull(); break;
      case 'n': case 'N': toggleNotes(); break;
      case 't': case 'T': timerEl.hidden = !timerEl.hidden; tick(); break;
      case 'r': case 'R': clockReset(true); tick(); break;
      case 'o': case 'O': openFirstLink(); break;
      case 'Enter':
        var goBtn = cards[current].sec.querySelector('.btn.go');
        if (!goBtn) return false;
        goBtn.click();
        break;
      case 'p': case 'P': openPresenter(); break;
      case '?': case 'h': case 'H': helpEl.hidden = !helpEl.hidden; break;
      case 'Escape': helpEl.hidden = true; hidePvToast(); break;
      default: return false;
    }
    return true;
  }
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    // Let Enter/Space activate a focused link or button
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest && e.target.closest('a, button')) return;
    if (onKey(e.key, e)) e.preventDefault();
  });
  handlers.push(function (d) {
    if (d.type === 'key') onKey(d.key);
    else if (d.type === 'hello') announce();
    else if (d.type === 'clock') tick();
  });
  document.getElementById('helpClose').addEventListener('click', function () { helpEl.hidden = true; });

  var start = parseInt((location.hash || '').slice(1), 10);
  // Back from the hand-over: the resume point wins over the hash the frame's history kept
  var resume = takeResume();
  if (resume !== null) start = resume + 1;
  show(start >= 1 && start <= cards.length ? start - 1 : 0);
  // In a frame (the LMS player), take the keyboard so the keys work straight away
  if (window.top !== window.self) { try { window.focus(); } catch (e) { /* ignore */ } }

  // ---- Presenter view ----
  function presenterView() {
    var body = document.body;
    body.className = 'pv';
    document.title = 'Presenter view: ' + M.title;
    body.innerHTML =
      '<header class="pv-head">' +
        '<section class="pv-clock" aria-label="Session timer">' +
          '<p class="pv-k">Session</p>' +
          '<p class="pv-big"><span id="pvEl">0:00</span> <small>elapsed</small></p>' +
          '<p class="pv-sub"><span id="pvPlan"></span> <b class="pv-chip" id="pvDiff"></b></p>' +
          '<div class="pv-ctl"><button type="button" id="pvRun">Start</button><button type="button" id="pvReset">Reset</button></div>' +
        '</section>' +
        '<section class="pv-count" id="pvCount" aria-label="Time left for this card">' +
          '<p class="pv-k">This card</p>' +
          '<p class="pv-big" id="pvLeft"></p>' +
          '<div class="pv-track"><span id="pvFill"></span></div>' +
          '<p class="pv-sub" id="pvOf"></p>' +
        '</section>' +
      '</header>' +
      '<main class="pv-main">' +
        '<div class="pv-left">' +
          '<p class="pv-where" id="pvWhere"></p>' +
          '<h1 id="pvTitle"></h1>' +
          '<ul class="pv-act" id="pvAct"></ul>' +
          '<section class="pv-share" id="pvShare" aria-label="Paste into the Zoom chat"></section>' +
          '<ul class="pv-say" id="pvSay"></ul>' +
          '<p class="pv-cue" id="pvCue"></p>' +
          '<details class="pv-notes"><summary>Full notes</summary><div id="pvNotes"></div></details>' +
        '</div>' +
        '<aside class="pv-right">' +
          '<div class="pv-thumb" id="pvThumb"></div>' +
          '<p class="pv-next"><span>Next</span> <b id="pvNext"></b></p>' +
          '<div class="pv-nav"><button type="button" id="pvPrev">&larr; Back</button><button type="button" id="pvFwd">Next &rarr;</button></div>' +
          '<p class="pv-link" id="pvLink"></p>' +
          '<p class="pv-keys">Keys here: &larr; &rarr; move the deck &middot; S start or pause the session timer. ' +
            'The timer starts by itself when the deck leaves the title card. Each card’s countdown restarts whenever that card is shown, also when you go back to it.</p>' +
        '</aside>' +
      '</main>';
    function $(id) { return document.getElementById(id); }
    var at = Math.max(0, Math.min(cards.length - 1, readClock().ci)), shown = 0, lastSeen = 0, deckBuild = '';
    var thumb = $('pvThumb');
    var stage = add(thumb, 'div', 'stage');
    var tdeck = add(stage, 'div', 'deck');

    function fitThumb() { stage.style.setProperty('--u', (thumb.clientWidth / 1920) + 'px'); }
    function render() {
      var c = cards[at].def;
      var w = windowOf(c);
      $('pvWhere').textContent = (at + 1) + ' / ' + cards.length + ' · ' + SEG[c.segment].name + ' · plan ' + w.start + '–' + w.end;
      $('pvTitle').textContent = c.label || c.title || c.type;
      $('pvAct').innerHTML = (c.act || []).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
      $('pvAct').hidden = !(c.act && c.act.length);
      renderShare(c.share || []);
      $('pvSay').innerHTML = (c.say || []).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
      $('pvCue').textContent = c.cue || '';
      $('pvCue').hidden = !c.cue;
      var steps = cards[at].steps.length;
      $('pvNotes').innerHTML = (steps ? '<p><b>Points shown on the deck: ' + shown + ' of ' + steps + '</b></p>' : '') +
        ((c.notes && c.notes.length) ? '<ul>' + c.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<p>No notes for this card.</p>');
      var nx = cards[at + 1];
      $('pvNext').textContent = nx ? (at + 2) + '. ' + (nx.def.label || nx.def.title) : 'End of deck';
      // Thumbnail: a copy of the card itself in a small card frame
      var copy = cards[at].sec.cloneNode(true);
      copy.classList.add('active'); copy.classList.remove('before');
      copy.removeAttribute('aria-hidden'); copy.inert = true;
      copy.querySelectorAll('.step').forEach(function (s, k) { s.classList.toggle('on', k < shown); });
      tdeck.innerHTML = '';
      tdeck.appendChild(copy);
      stage.classList.toggle('pv-dark', copy.classList.contains('theme-blue'));
      fitThumb();
      ptick();
    }
    // "Share" items: the exact text to paste into the Zoom chat, in order, each with a Copy button.
    // Only this presenter window renders them; the shared deck never does.
    function renderShare(items) {
      var box = $('pvShare');
      box.innerHTML = '';
      box.hidden = !items.length;
      if (!items.length) return;
      add(box, 'p', 'pv-share-k', items.length > 1 ? 'Paste into the Zoom chat, in this order' : 'Paste into the Zoom chat');
      items.forEach(function (it, k) {
        var item = add(box, 'div', 'pv-share-item' + (it.optional ? ' optional' : ''));
        var head = add(item, 'div', 'pv-share-head');
        if (items.length > 1) add(head, 'span', 'pv-share-n', (k + 1) + ' of ' + items.length);
        add(head, 'b', 'pv-share-label', esc(it.label));
        if (it.optional) add(head, 'span', 'pv-share-opt', 'Optional');
        var btn = add(head, 'button', 'pv-share-copy', 'Copy');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Copy: ' + it.label);
        var pre = add(item, 'pre', 'pv-share-text');
        pre.textContent = it.text;
        pre.tabIndex = 0;
        btn.addEventListener('click', function () { copyShare(it.text, pre, btn); });
      });
    }
    function copyShare(text, pre, btn) {
      function done(ok) {
        btn.textContent = ok ? 'Copied' : 'Selected: press Ctrl+C';
        btn.classList.toggle('done', ok);
        clearTimeout(btn._t);
        btn._t = setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 2500);
      }
      function fallback() {
        // Select the visible text, so Ctrl+C works even if the copy command is refused
        var ok = false;
        try {
          var r = document.createRange();
          r.selectNodeContents(pre);
          var sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(r);
          ok = document.execCommand('copy');
        } catch (e) { ok = false; }
        done(ok);
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
        else fallback();
      } catch (e) { fallback(); }
    }
    function ptick() {
      var s = readClock(), t = Date.now();
      var started = s.run || s.base > 0;
      var e = elapsedMs(s, t) / 1000;
      var st = PLAN_START[at], en = st + BUDGET[at];
      $('pvEl').textContent = clock(e);
      $('pvPlan').textContent = 'plan here ' + mmss(st) + '–' + mmss(en) + ' of ' + mmss(TOTAL);
      var diff = $('pvDiff');
      if (!started) { diff.textContent = 'not started'; diff.className = 'pv-chip idle'; }
      else if (e < st) { diff.textContent = clock(st - e) + ' ahead'; diff.className = 'pv-chip ahead'; }
      else if (e > en) { diff.textContent = clock(e - en) + ' behind'; diff.className = 'pv-chip behind'; }
      else { diff.textContent = 'on time'; diff.className = 'pv-chip ontime'; }
      $('pvRun').textContent = s.run ? 'Pause' : (started ? 'Resume' : 'Start');
      // This card: counts down from its budget; amber in the last 20 %, red when over
      var budget = BUDGET[at];
      var used = s.ci === at ? cardMs(s, t) / 1000 : 0;
      var left = budget - used;
      var box = $('pvCount');
      box.classList.toggle('amber', left >= 0 && left <= budget * 0.2);
      box.classList.toggle('over', left < 0);
      $('pvLeft').innerHTML = left < 0 ? '+' + clock(-left) + ' <small>over</small>' : clock(Math.ceil(left)) + ' <small>left</small>';
      $('pvFill').style.width = Math.min(100, used / budget * 100) + '%';
      $('pvOf').textContent = 'budget ' + clock(budget) + (s.run ? '' : ' · paused');
      var link = $('pvLink');
      if (deckBuild && M.build && deckBuild !== M.build) {
        link.textContent = 'The deck has a newer build: press Ctrl+F5 in this window.'; link.className = 'pv-link warn';
      } else if (Date.now() - lastSeen < 7000) {
        link.textContent = 'Linked to the deck'; link.className = 'pv-link ok';
      } else {
        link.textContent = 'Waiting for the deck: open it in another tab or window of this browser.'; link.className = 'pv-link warn';
      }
    }
    handlers.push(function (d) {
      if (d.type === 'at') {
        lastSeen = Date.now();
        deckBuild = d.build || '';
        if (d.i !== at || d.shown !== shown) { at = Math.max(0, Math.min(cards.length - 1, d.i)); shown = d.shown || 0; render(); }
      } else if (d.type === 'clock') ptick();
    });
    function key(k) { send({ type: 'key', key: k }); }
    $('pvPrev').addEventListener('click', function () { key('ArrowLeft'); });
    $('pvFwd').addEventListener('click', function () { key('ArrowRight'); });
    function toggleRun() { if (readClock().run) clockPause(); else clockStart(); ptick(); }
    $('pvRun').addEventListener('click', toggleRun);
    $('pvReset').addEventListener('click', function () {
      var s = readClock();
      if (elapsedMs(s, Date.now()) > 10000 && !window.confirm('Reset the session timer to 0:00?')) return;
      clockReset(false); ptick();
    });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('button, summary') && (e.key === ' ' || e.key === 'Enter')) return;
      var map = { ArrowRight: 'ArrowRight', PageDown: 'ArrowRight', ' ': 'ArrowRight', ArrowLeft: 'ArrowLeft', PageUp: 'ArrowLeft', Home: 'Home', End: 'End' };
      if (map[e.key]) { e.preventDefault(); key(map[e.key]); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleRun(); }
    });
    window.addEventListener('resize', fitThumb);
    render();
    // Ask the deck where it is now, and again while it can't be found
    send({ type: 'hello' });
    setInterval(function () { if (Date.now() - lastSeen > 5000) send({ type: 'hello' }); }, 2000);
    setInterval(ptick, 250);
  }
})();
