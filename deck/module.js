/*
 * Presenter card deck: the micromodule card engine (copied from annual-planning-and-review/module/)
 * in a wide, slide-like layout for screen sharing.
 *
 * Content comes from window.MODULE (content.js, which build.py writes from content.json).
 * No SCORM tracking, no blocking cards: the presenter navigates freely.
 *
 * Keys: Right / Space / PageDown next, Left / PageUp back, Home first, End last,
 *       F fullscreen, N speaker notes (hidden by default), T timer, R restart timer,
 *       O open the card's first link, P presenter window (notes in a separate window).
 * The presenter window (index.html?presenter) follows the deck and can drive it.
 */
(function () {
  'use strict';
  var M = window.MODULE;
  var PRESENTER = /[?&]presenter\b/.test(location.search);
  var CHANNEL = 'mm-deck-' + M.id;
  var TIMER_KEY = 'mm_deck_timer_' + M.id;
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
    cover: function (c, sec) {
      sec.classList.add('cover');
      add(sec, 'p', 'eyebrow', esc(c.eyebrow));
      add(sec, 'h1', '', esc(c.title));
      add(sec, 'p', 'lead', esc(c.lead));
      linkRow(sec, c.links);
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
    cover: 'blue', divider: 'blue', statement: 'blue', ask: 'sand', practice: 'sand', checklist: 'sand', asks: 'sand'
  };

  // ---- Build the cards ----
  var cards = M.cards.map(function (c, i) {
    var sec = el('section', 'card theme-' + (THEME[c.type] || 'cream'));
    sec.dataset.label = c.label || c.title;
    sec.setAttribute('aria-roledescription', 'slide');
    var inner = add(sec, 'div', 'inner');
    render[c.type](c, inner, i);
    return { def: c, sec: sec, steps: sec.querySelectorAll('.step'), shown: 0 };
  });

  // ---- Presenter window: notes only, follows the deck ----
  if (PRESENTER) { presenterView(); return; }

  var deck = document.getElementById('deck');
  var bar = document.getElementById('progress');
  var segName = document.getElementById('segname');
  var counter = document.getElementById('counter');
  var live = document.getElementById('live');
  var notesEl = document.getElementById('notes');
  var timerEl = document.getElementById('timer');
  var helpEl = document.getElementById('help');
  cards.forEach(function (c) { deck.appendChild(c.sec); });
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
    bar.style.width = (cards.length > 1 ? i / (cards.length - 1) * 100 : 100) + '%';
    segName.textContent = SEG[c.def.segment].name;
    counter.textContent = (i + 1) + ' / ' + cards.length;
    live.textContent = 'Slide ' + (i + 1) + ' of ' + cards.length + ': ' + c.sec.dataset.label;
    renderNotes(notesEl, i);
    if (i > 0) startTimer();
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
    if (bus) bus.postMessage({ type: 'at', i: current, shown: cards[current].shown, t0: t0 });
  }

  // ---- Notes ----
  function renderNotes(box, i) {
    var c = cards[i].def;
    var w = windowOf(c);
    var html = '<div class="notes-head"><b>' + (i + 1) + '. ' + esc(c.label || c.title) + '</b><span>' + esc(SEG[c.segment].name) + ' · plan ' + esc(w.start + '–' + w.end) + ' · <i data-elapsed></i></span></div>';
    if (c.cue) html += '<p class="cue">' + esc(c.cue) + '</p>';
    if (c.notes && c.notes.length) html += '<ul>' + c.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    var nx = cards[i + 1];
    html += '<p class="next-up">Next: ' + (nx ? esc(nx.def.label || nx.def.title) : 'end of deck') + '</p>';
    box.innerHTML = html;
  }
  function toggleNotes() {
    var on = notesEl.hidden;
    notesEl.hidden = !on;
    document.body.classList.toggle('notes-on', on);
  }

  // ---- Timer: starts when you leave the title card; R restarts it ----
  var t0 = null;
  try { t0 = parseInt(sessionStorage.getItem(TIMER_KEY), 10) || null; } catch (e) { /* storage blocked */ }
  function startTimer() {
    if (t0) return;
    t0 = Date.now();
    try { sessionStorage.setItem(TIMER_KEY, String(t0)); } catch (e) { /* storage blocked */ }
  }
  function resetTimer() {
    t0 = current > 0 ? Date.now() : null;
    try { if (t0) sessionStorage.setItem(TIMER_KEY, String(t0)); else sessionStorage.removeItem(TIMER_KEY); } catch (e) { /* storage blocked */ }
    tick();
    announce();
  }
  function timerState(i) {
    var w = windowOf(cards[i].def);
    var el2 = t0 ? (Date.now() - t0) / 1000 : 0;
    var late = t0 && el2 > mins(w.end) * 60;
    return { text: clock(el2), plan: w.start + '–' + w.end, late: late };
  }
  function tick() {
    if (current < 0) return;
    var s = timerState(current);
    timerEl.innerHTML = '<b>' + s.text + '</b><span>plan ' + esc(s.plan) + '</span>';
    timerEl.classList.toggle('late', !!s.late);
    timerEl.classList.toggle('idle', !t0);
    var e = notesEl.querySelector('[data-elapsed]');
    if (e) e.textContent = t0 ? 'elapsed ' + s.text : 'timer not started';
  }
  setInterval(tick, 1000);

  // ---- Fullscreen ----
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }
  function openFirstLink() {
    var a = cards[current].sec.querySelector('a[href]');
    if (a) window.open(a.href, '_blank', 'noopener');
  }
  function openPresenter() {
    window.open(location.pathname + '?presenter', 'mm-deck-presenter', 'width=900,height=700');
  }

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
      case 't': case 'T': timerEl.hidden = !timerEl.hidden; break;
      case 'r': case 'R': resetTimer(); break;
      case 'o': case 'O': openFirstLink(); break;
      case 'p': case 'P': openPresenter(); break;
      case '?': case 'h': case 'H': helpEl.hidden = !helpEl.hidden; break;
      case 'Escape': helpEl.hidden = true; break;
      default: return false;
    }
    return true;
  }
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    // Let Enter/Space activate a focused link or button
    if (e.key === ' ' && e.target.closest && e.target.closest('a, button')) return;
    if (onKey(e.key, e)) e.preventDefault();
  });
  if (bus) bus.onmessage = function (m) {
    var d = m.data || {};
    if (d.type === 'key') onKey(d.key);
    else if (d.type === 'hello') announce();
  };
  document.getElementById('helpClose').addEventListener('click', function () { helpEl.hidden = true; });

  var start = parseInt((location.hash || '').slice(1), 10);
  show(start >= 1 && start <= cards.length ? start - 1 : 0);

  // ---- Presenter window ----
  function presenterView() {
    document.body.className = 'presenter-view';
    document.body.innerHTML = '';
    document.title = 'Notes: ' + M.title;
    var top = add(document.body, 'div', 'pv-top');
    var timer = add(top, 'div', 'pv-timer');
    var keys = add(top, 'p', 'pv-keys', '&larr; &rarr; move the deck from here &middot; R restart timer');
    keys.setAttribute('aria-hidden', 'true');
    var box = add(document.body, 'div', 'notes pv-notes');
    var at = 0;
    function renderAt(i, shown) {
      at = i;
      renderNotesP(box, i, shown);
    }
    function renderNotesP(b, i, shown) {
      var c = cards[i].def;
      var w = windowOf(c);
      var html = '<div class="notes-head"><b>' + (i + 1) + ' / ' + cards.length + '. ' + esc(c.label || c.title) + '</b><span>' + esc(SEG[c.segment].name) + ' · plan ' + esc(w.start + '–' + w.end) + '</span></div>';
      if (cards[i].steps.length) html += '<p class="cue">Points shown: ' + shown + ' of ' + cards[i].steps.length + '</p>';
      if (c.cue) html += '<p class="cue">' + esc(c.cue) + '</p>';
      if (c.notes && c.notes.length) html += '<ul>' + c.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
      var nx = cards[i + 1];
      html += '<p class="next-up">Next: ' + (nx ? esc(nx.def.label || nx.def.title) : 'end of deck') + '</p>';
      b.innerHTML = html;
    }
    // The deck sends its timer start with each update (sessionStorage is per window)
    var deckT0 = null;
    function ptick2() {
      var w = windowOf(cards[at].def);
      var s = deckT0 ? (Date.now() - deckT0) / 1000 : 0;
      timer.innerHTML = '<b>' + (deckT0 ? clock(s) : 'not started') + '</b><span>plan ' + esc(w.start + '–' + w.end) + '</span>';
      timer.classList.toggle('late', !!(deckT0 && s > mins(w.end) * 60));
    }
    renderAt(0, 0);
    if (!bus) { box.innerHTML = '<p>This browser cannot link windows. Use N in the deck instead.</p>'; return; }
    bus.onmessage = function (m) {
      var d = m.data || {};
      if (d.type === 'at') { if ('t0' in d) deckT0 = d.t0; renderAt(d.i, d.shown); ptick2(); }
    };
    bus.postMessage({ type: 'hello' });
    document.addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ', 'Home', 'End', 'r', 'R'].indexOf(e.key) >= 0) {
        e.preventDefault();
        bus.postMessage({ type: 'key', key: e.key });
      }
    });
    setInterval(ptick2, 1000);
  }
})();
