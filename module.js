/*
 * Make your first micromodule with AI: take-home card deck (variant 9 family, engine adapted from
 * annual-planning-and-review/module, without the video player).
 *
 * Content comes from window.MODULE (content.js, which build.py writes from content.json).
 *
 * Tracking (window.ModuleTracker from scorm-bridge.js; without an LMS every call is a no-op):
 *  - Quick checks must be answered before moving past them; answers lock after the first try.
 *  - Score = checks answered correctly first time, as a percentage.
 *  - "completed" is sent on the last card, once every check is answered.
 *  - suspend_data: "1|card|answers", e.g. 1|9|1,2,-,-
 * Reflections and checklist ticks are kept only in this browser (localStorage), never sent.
 */
(function () {
  'use strict';
  var M = window.MODULE;
  var STORE = 'sil_takehome_';
  var tracker = window.ModuleTracker || {
    start: function () { return null; }, progress: function () {}, complete: function () {}
  };

  var deck = document.getElementById('deck');
  var segWrap = document.getElementById('segments');
  var topbar = document.getElementById('topbar');
  var counter = document.getElementById('counter');
  var live = document.getElementById('live');
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  document.getElementById('series').textContent = M.series;
  document.getElementById('stage').setAttribute('aria-label', M.title + ' micromodule');

  var THEME = {
    cover: 'blue', method: 'cream', rules: 'cream', ingredients: 'cream', quiz: 'blue', prompts: 'sand',
    style: 'cream', risks: 'cream', checklist: 'sand', reflect: 'sand', value: 'cream', complete: 'blue'
  };
  var ICON = {
    check: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    arrow: '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chev: '<svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 4.6V4.2A1.7 1.7 0 0 0 11.3 2.5H4.2A1.7 1.7 0 0 0 2.5 4.2v7.1A1.7 1.7 0 0 0 4.2 13h.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    sparkle: '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8c.5 3.9 2.3 5.7 6.2 6.2-3.9.5-5.7 2.3-6.2 6.2-.5-3.9-2.3-5.7-6.2-6.2 3.9-.5 5.7-2.3 6.2-6.2z" fill="currentColor"/><path d="M16 13.2c.2 1.6 1 2.4 2.6 2.6-1.6.2-2.4 1-2.6 2.6-.2-1.6-1-2.4-2.6-2.6 1.6-.2 2.4-1 2.6-2.6z" fill="currentColor"/></svg>'
  };
  // Small line icons (24 x 24, stroke = currentColor)
  function icon(paths) {
    return '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var GLYPH = {
    source: icon('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    prompt: icon('<path d="M4 6h16M4 10h12M4 14h14M4 18h9"/>'),
    ai: icon('<path d="M12 3c.6 4.6 2.7 6.7 7.3 7.3-4.6.6-6.7 2.7-7.3 7.3-.6-4.6-2.7-6.7-7.3-7.3C9.3 9.7 11.4 7.6 12 3z"/>'),
    review: icon('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8.3 11.2l1.9 1.9 3.6-3.8"/>'),
    ship: icon('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>'),
    words: icon('<path d="M4 6.5C4 5.1 5.1 4 6.5 4h11C18.9 4 20 5.1 20 6.5v7c0 1.4-1.1 2.5-2.5 2.5H11l-4.5 4v-4h0C5.1 16 4 14.9 4 13.5z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" stroke-width="2.6"/>'),
    chat: icon('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
    reset: icon('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 3.5v4h4"/>'),
    role: icon('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>'),
    audience: icon('<circle cx="8.5" cy="9" r="3"/><circle cx="16.5" cy="9" r="3"/><path d="M3 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M13.5 14.6c.9-.3 1.9-.4 3-.4 2.7 0 4.9 1.8 5.5 4.8"/>'),
    task: icon('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'),
    constraints: icon('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    change: icon('<circle cx="8" cy="9" r="3"/><path d="M3 19c.5-3 2.5-4.6 5-4.6"/><path d="M15 6.5c3.2 0 5.5 2 5.5 5" stroke-dasharray="2 2.6"/><circle cx="16" cy="14.5" r="2.4"/><path d="M12.5 21c.4-2 1.8-3.2 3.5-3.2s3.1 1.2 3.5 3.2"/>'),
    globe: icon('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>'),
    person: icon('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9.5" cy="11" r="2.4"/><path d="M5.8 17c.5-1.8 1.9-2.8 3.7-2.8s3.2 1 3.7 2.8M15 10h3M15 13h3"/>'),
    text: icon('<path d="M4 18L8.5 6l4.5 12M5.7 14h5.6"/><path d="M15 15.5c1-1.4 2-1.4 3 0s2 1.4 3 0" /><path d="M15 11.5c1-1.4 2-1.4 3 0s2 1.4 3 0"/>'),
    shield: icon('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.3-4.6"/>'),
    publish: icon('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 14v4.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V14"/>'),
    reuse: icon('<path d="M17 4l3 3-3 3"/><path d="M20 7H9a5 5 0 0 0-5 5"/><path d="M7 20l-3-3 3-3"/><path d="M4 17h11a5 5 0 0 0 5-5"/>')
  };
  var INGREDIENT_GLYPH = ['role', 'audience', 'source', 'task', 'constraints'];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function add(parent, tag, cls, html) { var e = el(tag, cls, html); parent.appendChild(e); return e; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function header(sec, c) {
    if (c.eyebrow) add(sec, 'p', 'eyebrow', c.eyebrow);
    if (c.title) add(sec, 'h2', '', c.title);
  }
  function callout(sec, text) { if (text) add(sec, 'div', 'callout', text); }
  function tapHint(sec, text) { add(sec, 'p', 'tap-hint', text || 'Tap to continue'); }
  function stored(key) { try { return window.localStorage.getItem(STORE + key); } catch (e) { return null; } }
  function store(key, value) { try { window.localStorage.setItem(STORE + key, value); } catch (e) { /* storage blocked */ } }

  // ---- Copy-to-clipboard prompt box ----
  function promptBox(parent, label, text, long) {
    var box = add(parent, 'div', 'prompt' + (long ? ' long' : ''));
    var head = add(box, 'div', 'prompt-head');
    add(head, 'span', 'prompt-label', esc(label));
    var btn = add(head, 'button', 'copy', ICON.copy + '<span>Copy</span>');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Copy ' + label);
    var body = add(box, 'div', 'prompt-body');
    var pre = add(body, 'pre', 'prompt-text', esc(text).replace(/\[[^\]]+\]/g, '<mark>$&</mark>'));
    pre.tabIndex = 0;
    if (long) {
      var more = add(box, 'button', 'more', '<span>Show the full prompt</span>' + ICON.chev);
      more.type = 'button';
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', function () {
        var open = box.classList.toggle('open');
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
        more.firstChild.textContent = open ? 'Show less' : 'Show the full prompt';
      });
    }
    btn.addEventListener('click', function () { copyText(text, pre, btn); });
    return box;
  }
  function selectNode(node) {
    var sel = window.getSelection(), range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function copied(btn, ok) {
    btn.classList.toggle('done', ok);
    btn.classList.toggle('manual', !ok);
    btn.lastChild.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    btn.firstChild.outerHTML = ok ? ICON.check : ICON.copy;
    live.textContent = ok ? 'Prompt copied to the clipboard.' : 'The prompt is selected. Press Ctrl+C, or Command+C on a Mac, to copy it.';
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      btn.classList.remove('done', 'manual');
      btn.lastChild.textContent = 'Copy';
      btn.firstChild.outerHTML = ICON.copy;
    }, ok ? 2200 : 5000);
  }
  function legacyCopy(pre) {
    try {
      selectNode(pre);
      return document.execCommand('copy');
    } catch (e) { return false; }
  }
  function copyText(text, pre, btn) {
    var box = pre.closest('.prompt');
    function fallback() {
      if (box.classList.contains('long') && !box.classList.contains('open')) box.querySelector('.more').click();
      var ok = legacyCopy(pre);
      if (ok) window.getSelection().removeAllRanges();
      copied(btn, ok);
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { copied(btn, true); }, fallback);
        return;
      }
    } catch (e) { /* clipboard API blocked, e.g. in a frame without permission */ }
    fallback();
  }

  // ---- State ----
  var cards = [];          // { def, sec }
  var quizIdx = [];        // card index of each quick check, in order
  var state = { card: 0, answers: [] };
  var current = -1;
  var completedSent = false;

  // ---- Renderers, one per card type ----
  var render = {
    cover: function (c, sec) {
      sec.classList.add('cover');
      add(sec, 'div', 'cover-art', coverArt());
      add(sec, 'p', 'eyebrow', c.eyebrow + ' &middot; about ' + M.minutes + ' minutes');
      add(sec, 'h1', '', c.title);
      add(sec, 'p', 'lead muted', c.lead);
      var prompts = M.cards.reduce(function (n, x) { return n + (x.prompts ? x.prompts.length : 0) + (x.example ? 1 : 0); }, 0);
      var facts = add(sec, 'ul', 'cover-facts');
      [quizIdx.length + ' quick checks', prompts + ' prompts to copy', '1 review checklist'].forEach(function (t) { add(facts, 'li', '', t); });
      add(sec, 'div', 'btn-row', '<button class="btn light" type="button" data-next>' + c.start + ' ' + ICON.arrow + '</button>');
      tapHint(sec, 'Tap right to go on &middot; left to go back');
    },
    method: function (c, sec) {
      header(sec, c);
      (c.body || []).forEach(function (t) { add(sec, 'p', '', esc(t)); });
      add(sec, 'p', 'mini-title', c.stepsTitle);
      var ol = add(sec, 'ol', 'method');
      var glyphs = ['source', 'prompt', 'ai', 'review', 'ship'];
      c.steps.forEach(function (s, k) {
        var ai = s.who === 'AI';
        var li = add(ol, 'li', ai ? 'ai' : '');
        li.style.setProperty('--i', k);
        add(li, 'span', 'ico', GLYPH[glyphs[k % glyphs.length]]);
        add(li, 'span', 'name', esc(s.name));
        add(li, 'span', 'who', s.who === 'AI' ? ICON.sparkle + 'AI' : 'You');
      });
      callout(sec, c.callout);
      tapHint(sec);
    },
    rules: function (c, sec) {
      header(sec, c);
      add(sec, 'p', 'muted', c.intro);
      var glyphs = ['words', 'chat', 'reset'];
      var wrap = add(sec, 'ol', 'rules');
      c.rules.forEach(function (r, k) {
        var li = add(wrap, 'li', 'rule');
        li.style.setProperty('--i', k);
        var top = add(li, 'div', 'rule-top');
        add(top, 'span', 'ico', GLYPH[glyphs[k]]);
        var t = add(top, 'div');
        add(t, 'h3', '', esc(r.fact));
        add(t, 'p', '', esc(r.detail));
        add(li, 'p', 'habit', ICON.arrow + '<span><b>Habit:</b> ' + esc(r.habit) + '</span>');
      });
      tapHint(sec);
    },
    ingredients: function (c, sec) {
      header(sec, c);
      add(sec, 'p', '', esc(c.intro));
      var ol = add(sec, 'ol', 'ingredients');
      c.items.forEach(function (it, k) {
        var li = add(ol, 'li', '');
        li.style.setProperty('--i', k);
        add(li, 'span', 'ico', GLYPH[INGREDIENT_GLYPH[k % 5]]);
        var t = add(li, 'span', 't');
        add(t, 'b', '', (k + 1) + '. ' + esc(it.name));
        add(t, 'span', '', esc(it.text));
      });
      if (c.example) {
        var d = add(sec, 'details', 'example');
        add(d, 'summary', '', '<span>' + esc(c.example.summary) + '</span>' + ICON.chev);
        add(d, 'p', 'muted small', esc(c.example.note));
        promptBox(d, c.example.label, c.example.text, false);
      }
      tapHint(sec);
    },
    prompts: function (c, sec) {
      header(sec, c);
      add(sec, 'p', '', esc(c.intro).replace(/\[slots\]/, '<mark>[slots]</mark>'));
      c.prompts.forEach(function (p) { promptBox(sec, p.label, p.text, p.long); });
      if (c.note) add(sec, 'p', 'note', c.note);
      callout(sec, c.callout);
      tapHint(sec);
    },
    style: function (c, sec) {
      header(sec, c);
      var fig = add(sec, 'div', 'style-fig');
      add(fig, 'p', 'scene', '<span class="tag">Same scene</span>' + esc(c.scene));
      var row = add(fig, 'div', 'style-row');
      c.styles.forEach(function (s) {
        var col = add(row, 'div', 'style-col ' + s.kind);
        add(col, 'span', 'branch');
        add(col, 'p', 'words', '<span class="tag">Style words</span>' + esc(s.words));
        add(col, 'div', 'result', styleArt(s.kind));
        add(col, 'p', 'result-label', esc(s.result));
      });
      add(sec, 'p', 'tight', esc(c.body));
      var pl = add(sec, 'ul', 'points');
      c.points.forEach(function (t) { add(pl, 'li', '', t); });
      tapHint(sec);
    },
    risks: function (c, sec) {
      header(sec, c);
      add(sec, 'p', 'muted', esc(c.intro));
      var ul = add(sec, 'ul', 'risks');
      c.risks.forEach(function (r) {
        var li = add(ul, 'li');
        add(li, 'span', 'ico', GLYPH[r.icon]);
        add(li, 'span', 't', '<b>' + esc(r.name) + '</b> ' + esc(r.text));
      });
      if (c.image) {
        var f = add(sec, 'figure', 'figure');
        var frame = add(f, 'div', 'frame');
        var img = add(frame, 'img');
        img.src = M.images[c.image.src];
        img.alt = c.image.alt;
        img.loading = 'lazy';
        add(f, 'figcaption', '', esc(c.image.caption));
      }
      callout(sec, c.callout);
      tapHint(sec);
    },
    checklist: function (c, sec, i) {
      header(sec, c);
      add(sec, 'p', '', esc(c.intro));
      var meter = add(sec, 'div', 'meter', '<div class="bar"><span></span></div><span class="count"></span>');
      var ul = add(sec, 'ul', 'checklist');
      var ticks = (stored('check_' + i) || '').split('');
      function update() {
        var boxes = ul.querySelectorAll('input');
        var n = 0, bits = '';
        boxes.forEach(function (b) { if (b.checked) n++; bits += b.checked ? '1' : '0'; });
        meter.querySelector('.bar span').style.width = (n / boxes.length * 100) + '%';
        meter.querySelector('.count').textContent = n === boxes.length ? 'All ' + n + ' ticked. Ready to go live.' : n + ' of ' + boxes.length + ' ticked';
        meter.classList.toggle('full', n === boxes.length);
        store('check_' + i, bits);
      }
      c.items.forEach(function (t, k) {
        var li = add(ul, 'li');
        var id = 'chk-' + i + '-' + k;
        var input = add(li, 'input');
        input.type = 'checkbox';
        input.id = id;
        input.checked = ticks[k] === '1';
        input.addEventListener('change', update);
        var label = add(li, 'label', '', '<span class="box" aria-hidden="true">' + ICON.check + '</span><span>' + esc(t) + '</span>');
        label.setAttribute('for', id);
      });
      update();
      add(sec, 'p', 'muted small', 'Your ticks are saved only on this device. Use the list again for every module.');
      tapHint(sec);
    },
    quiz: function (c, sec) {
      header(sec, c);
      add(sec, 'h2', '', esc(c.prompt));
      if (c.quote) add(sec, 'div', 'quote', '<span class="tag">The prompt</span>' + esc(c.quote));
      var opts = add(sec, 'div', 'options' + (c.options.length > 3 && c.options.every(function (o) { return o.length < 24; }) ? ' compact' : ''));
      opts.setAttribute('role', 'group');
      opts.setAttribute('aria-label', 'Answers');
      c.options.forEach(function (t, k) {
        var b = add(opts, 'button', 'option', '<span class="mark" aria-hidden="true">' + 'ABCDEF'.charAt(k) + '</span><span class="txt">' + esc(t) + '</span>');
        b.type = 'button';
        b.dataset.k = k;
      });
      var fb = add(sec, 'div', 'feedback', '');
      fb.hidden = true;
      fb.setAttribute('aria-live', 'polite');
      add(sec, 'p', 'tap-hint', 'Answer to continue');
    },
    reflect: function (c, sec, i) {
      header(sec, c);
      add(sec, 'p', 'mini-title', esc(c.choicesLabel));
      var group = add(sec, 'div', 'choices');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', c.choicesLabel);
      var picked = stored('format_' + i);
      c.choices.forEach(function (t) {
        var b = add(group, 'button', 'choice', esc(t));
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', t === picked ? 'true' : 'false');
        b.addEventListener('click', function () {
          group.querySelectorAll('.choice').forEach(function (o) { o.setAttribute('aria-checked', o === b ? 'true' : 'false'); });
          store('format_' + i, t);
        });
      });
      var id = 'reflect-' + i;
      add(sec, 'label', 'mini-title', esc(c.prompt)).setAttribute('for', id);
      var ta = add(sec, 'textarea');
      ta.id = id;
      ta.rows = 4;
      ta.value = stored('reflection_' + i) || '';
      ta.addEventListener('input', function () { store('reflection_' + i, ta.value); });
      add(sec, 'p', 'muted small', 'Saved only on this device, just for you.');
      if (c.after) add(sec, 'div', 'callout after', esc(c.after));
      add(sec, 'div', 'btn-row', '<button class="btn" type="button" data-next>Continue ' + ICON.arrow + '</button>');
    },
    value: function (c, sec) {
      header(sec, c);
      add(sec, 'p', 'muted', esc(c.intro));
      var path = add(sec, 'div', 'path');
      c.stages.forEach(function (s, k) {
        if (k) add(path, 'span', 'path-line', '<svg viewBox="0 0 60 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 6h52M48 1.5L55 6l-7 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>');
        var d = add(path, 'div', 'stage-box' + (k ? ' up' : ''));
        add(d, 'span', 'tag', esc(s.tag));
        add(d, 'b', '', esc(s.name));
      });
      add(sec, 'p', 'mini-title', 'Why upgrade for production');
      var ul = add(sec, 'ul', 'reasons');
      c.reasons.forEach(function (r) {
        var li = add(ul, 'li');
        add(li, 'span', 'ico', GLYPH[r.icon]);
        add(li, 'span', 't', '<b>' + esc(r.name) + '</b>' + esc(r.text));
      });
      callout(sec, c.callout);
      tapHint(sec);
    },
    complete: function (c, sec) {
      sec.classList.add('center');
      var ring = add(sec, 'div', 'score-ring', '<div><span data-score></span><small data-score-label></small></div>');
      ring.style.setProperty('--pct', 0);
      add(sec, 'p', 'eyebrow', '').setAttribute('data-eyebrow', '');
      add(sec, 'h2', '', '').setAttribute('data-title', '');
      add(sec, 'p', 'lead muted', '').setAttribute('data-msg', '');
      add(sec, 'ul', 'todo').setAttribute('data-todo', '');
      var done = add(sec, 'div', 'done-extra');
      done.setAttribute('data-done', '');
      add(done, 'p', 'mini-title', esc(c.recapTitle));
      var chips = add(done, 'ul', 'recap');
      c.recap.forEach(function (t, k) { add(chips, 'li', '', ICON.check + '<span>' + esc(t) + '</span>').style.setProperty('--i', k); });
      var res = add(done, 'ul', 'resources');
      c.resources.forEach(function (r) {
        var li = add(res, 'li', '', esc(r.text));
        if (r.link) {
          li.appendChild(document.createTextNode(' '));
          var a = add(li, 'a', '', esc(r.linkText));
          a.href = r.link; a.target = '_blank'; a.rel = 'noopener';
        }
      });
      add(sec, 'div', 'btn-row', '<button class="btn ghost" type="button" data-review>Review from the start</button>');
    }
  };

  // ---- Inline illustrations ----
  function coverArt() {
    var lines = function (x, y, w) {
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="6" rx="3" fill="#2B2723" opacity=".14"/>' +
        '<rect x="' + x + '" y="' + (y + 13) + '" width="' + (w * 0.78) + '" height="6" rx="3" fill="#2B2723" opacity=".14"/>';
    };
    return '<svg viewBox="0 0 340 210" role="img" aria-label="A small stack of phone cards: an AI draft behind, the finished card in front with a tick.">' +
      '<circle cx="170" cy="112" r="98" fill="#fff" opacity=".06"/><circle cx="170" cy="112" r="66" fill="#fff" opacity=".05"/>' +
      '<g transform="rotate(-13 150 118)"><rect x="96" y="42" width="104" height="150" rx="16" fill="#1A5A8F"/>' +
      '<rect x="110" y="60" width="50" height="7" rx="3.5" fill="#fff" opacity=".35"/><rect x="110" y="76" width="74" height="6" rx="3" fill="#fff" opacity=".2"/><rect x="110" y="89" width="60" height="6" rx="3" fill="#fff" opacity=".2"/></g>' +
      '<g transform="rotate(7 196 116)"><rect x="140" y="40" width="104" height="152" rx="16" fill="#F3EFE9"/>' +
      '<rect x="154" y="58" width="76" height="40" rx="9" fill="none" stroke="#C9A882" stroke-width="2" stroke-dasharray="5 5"/>' +
      lines(154, 110, 72) + '</g>' +
      '<g class="front"><rect x="118" y="34" width="112" height="162" rx="18" fill="#FCFBF8"/>' +
      '<rect x="118" y="34" width="112" height="162" rx="18" fill="none" stroke="#2B2723" stroke-opacity=".08"/>' +
      '<rect x="132" y="50" width="84" height="48" rx="10" fill="#E8DFD2"/>' +
      '<circle cx="152" cy="74" r="9" fill="#C9A882"/><path d="M168 90l12-16 12 16z" fill="#0D3C61" opacity=".8"/><path d="M182 90l9-11 9 11z" fill="#1A5A8F" opacity=".6"/>' +
      lines(132, 110, 80) + '<rect x="132" y="138" width="56" height="6" rx="3" fill="#2B2723" opacity=".14"/>' +
      '<rect x="132" y="160" width="84" height="22" rx="11" fill="#0D3C61"/><rect x="146" y="168" width="40" height="6" rx="3" fill="#fff" opacity=".85"/></g>' +
      '<g class="tick"><circle cx="230" cy="44" r="21" fill="#C9A882"/><path d="M220 44.5l7 7 13.5-14" fill="none" stroke="#0D3C61" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<g class="spark" fill="#C9A882"><path d="M88 58c.9 7 4 10.1 11 11-7 .9-10.1 4-11 11-.9-7-4-10.1-11-11 7-.9 10.1-4 11-11z"/><path d="M262 150c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z" opacity=".75"/><circle cx="72" cy="150" r="3" opacity=".6"/><circle cx="276" cy="86" r="2.5" opacity=".6"/></g>' +
      '</svg>';
  }
  function styleArt(kind) {
    if (kind === 'photo') {
      return '<svg viewBox="0 0 160 96" aria-hidden="true"><defs><linearGradient id="ph" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8E9AA6"/><stop offset=".55" stop-color="#5C6670"/><stop offset="1" stop-color="#3B3F45"/></linearGradient>' +
        '<radialGradient id="glow" cx=".72" cy=".25" r=".6"><stop offset="0" stop-color="#F5E9D6" stop-opacity=".9"/><stop offset="1" stop-color="#F5E9D6" stop-opacity="0"/></radialGradient>' +
        '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>' +
        '<rect width="160" height="96" rx="10" fill="url(#ph)"/><rect width="160" height="96" rx="10" fill="url(#glow)"/>' +
        '<g filter="url(#soft)" opacity=".85"><ellipse cx="52" cy="48" rx="13" ry="15" fill="#C7A68A"/><path d="M28 96c2-20 12-30 24-30s22 10 24 30z" fill="#2F3A46"/>' +
        '<ellipse cx="110" cy="50" rx="12" ry="14" fill="#B48B6E"/><path d="M88 96c2-19 11-28 22-28s20 9 22 28z" fill="#6A4E3E"/></g>' +
        '<g transform="translate(130 12)"><circle cx="9" cy="9" r="9" fill="#fff" opacity=".9"/><circle cx="9" cy="9" r="4.2" fill="none" stroke="#3B3F45" stroke-width="1.6"/><circle cx="9" cy="9" r="1.4" fill="#3B3F45"/></g></svg>';
    }
    return '<svg viewBox="0 0 160 96" aria-hidden="true"><rect width="160" height="96" rx="10" fill="#F3EFE9"/><circle cx="128" cy="22" r="11" fill="#C9A882" opacity=".7"/>' +
      '<rect x="20" y="66" width="120" height="7" rx="3.5" fill="#C9A882"/><rect x="74" y="73" width="12" height="23" fill="#C9A882"/>' +
      '<circle cx="48" cy="38" r="10" fill="#E8C9A8"/><path d="M38 37a10 10 0 0 1 20 0c-5-3-14-3-20 0z" fill="#2B2723"/><path d="M31 66c0-14 7-20 17-20s17 6 17 20z" fill="#0D3C61"/>' +
      '<circle cx="112" cy="38" r="10" fill="#B9875F"/><path d="M101.5 39a10.5 11 0 0 1 21 0c-1-4-3-6-4-6-5 2-12 2-17 6z" fill="#2B2723"/><path d="M95 66c0-14 7-20 17-20s17 6 17 20z" fill="#9C7A52"/></svg>';
  }

  // ---- Quick checks ----
  function applyAnswer(i, k, fresh) {
    var c = cards[i].def, sec = cards[i].sec;
    var opts = sec.querySelectorAll('.option');
    sec.dataset.answered = '1';
    var right = k === c.answer;
    opts.forEach(function (o, j) {
      o.disabled = true;
      var mark = o.querySelector('.mark');
      var txt = o.querySelector('.txt').textContent;
      if (j === c.answer) { o.classList.add('correct'); mark.innerHTML = ICON.check; o.setAttribute('aria-label', txt + ' (correct answer)'); }
      else if (j === k) { o.classList.add('wrong'); mark.innerHTML = ICON.cross; o.setAttribute('aria-label', txt + ' (your answer, not correct)'); }
      else o.classList.add('dim');
    });
    var fb = sec.querySelector('.feedback');
    fb.innerHTML = '<strong>' + (right ? 'Correct.' : 'Not quite.') + '</strong> ' + esc(c.explain);
    fb.hidden = false;
    var hint = sec.querySelector('.tap-hint');
    if (hint) hint.remove();
    if (!sec.querySelector('.continue')) {
      var row = add(sec, 'div', 'btn-row', '<button class="btn light continue" type="button" data-next>Continue ' + ICON.arrow + '</button>');
      if (fresh) row.querySelector('button').focus({ preventScroll: true });
    }
    if (fresh) fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---- suspend_data ----
  function serialise() {
    return ['1', state.card, state.answers.map(function (a) { return a < 0 ? '-' : a; }).join(',')].join('|');
  }
  function restore(saved) {
    if (!saved || !saved.data) return;
    var p = String(saved.data).split('|');
    if (p[0] !== '1' || p.length < 3) return;
    state.card = Math.min(cards.length - 1, Math.max(0, parseInt(p[1], 10) || 0));
    p[2].split(',').forEach(function (a, k) {
      var n = parseInt(a, 10);
      if (k < state.answers.length && n >= 0 && n < cards[quizIdx[k]].def.options.length) state.answers[k] = n;
    });
  }
  function save() { tracker.progress(String(state.card), serialise(), true); }

  // ---- Score and completion ----
  function score() {
    return quizIdx.reduce(function (n, i, k) { return n + (state.answers[k] === cards[i].def.answer ? 1 : 0); }, 0);
  }
  function renderComplete(sec) {
    var missing = quizIdx.filter(function (i, k) { return state.answers[k] < 0; });
    var done = !missing.length;
    var total = quizIdx.length, s = score();
    var answered = total - missing.length;
    sec.querySelector('.score-ring').style.setProperty('--pct', done ? (total ? Math.round(s / total * 100) : 100) : Math.round(answered / total * 100));
    sec.querySelector('[data-score]').textContent = done ? s + '/' + total : answered + '/' + total;
    sec.querySelector('[data-score-label]').textContent = done ? 'first try' : 'answered';
    sec.querySelector('[data-eyebrow]').textContent = done ? 'Module complete' : 'Almost there';
    sec.querySelector('[data-title]').textContent = done ? cards[cards.length - 1].def.title : 'A few checks left';
    sec.querySelector('[data-msg]').textContent = done
      ? (s === total ? 'You answered every quick check correctly first time.' : 'You answered ' + s + ' of ' + total + ' quick checks correctly first time. Go back through any card to review.')
      : 'Answer these to complete the module:';
    var todo = sec.querySelector('[data-todo]');
    todo.innerHTML = '';
    missing.forEach(function (i) {
      var b = add(add(todo, 'li'), 'button', '', 'Answer: ' + esc(cards[i].def.prompt));
      b.type = 'button';
      b.addEventListener('click', function () { show(i); });
    });
    todo.hidden = done;
    sec.querySelector('[data-done]').hidden = !done;
    return done;
  }

  // ---- Navigation ----
  function isBlocked(i) { return cards[i].def.type === 'quiz' && !cards[i].sec.dataset.answered; }
  function refreshNav() {
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === cards.length - 1;
    nextBtn.setAttribute('aria-disabled', isBlocked(current) ? 'true' : 'false');
  }
  function show(i) {
    if (i < 0 || i >= cards.length) return;
    current = i;
    state.card = i;
    cards.forEach(function (c, k) {
      c.sec.classList.toggle('active', k === i);
      c.sec.classList.toggle('before', k < i);
      c.sec.setAttribute('aria-hidden', k === i ? 'false' : 'true');
      c.sec.inert = k !== i;
    });
    for (var k = 0; k < segWrap.children.length; k++) {
      segWrap.children[k].classList.toggle('done', k < i);
      segWrap.children[k].classList.toggle('current', k === i);
    }
    var sec = cards[i].sec;
    topbar.classList.toggle('on-dark', sec.classList.contains('theme-blue'));
    topbar.classList.toggle('on-sand', sec.classList.contains('theme-sand'));
    counter.textContent = (i + 1) + ' / ' + cards.length;
    live.textContent = 'Card ' + (i + 1) + ' of ' + cards.length + ': ' + sec.dataset.label;
    sec.scrollTop = 0;
    refreshNav();
    var img = cards[i + 1] && cards[i + 1].sec.querySelector('img');
    if (img) img.loading = 'eager';
    save();
    if (cards[i].def.type === 'complete' && renderComplete(sec) && !completedSent) {
      completedSent = true;
      tracker.complete(score(), quizIdx.length, serialise());
    }
  }
  function nudge(i) {
    var target = cards[i].sec.querySelector('.options');
    target.classList.remove('nudge');
    void target.offsetWidth;
    target.classList.add('nudge');
    live.textContent = 'Choose an answer to continue.';
  }
  function next() {
    if (isBlocked(current)) { nudge(current); return; }
    show(current + 1);
  }
  function prev() { show(current - 1); }

  // ---- Build the deck ----
  M.cards.forEach(function (c, i) {
    if (c.type === 'quiz') { quizIdx.push(i); state.answers.push(-1); }
  });
  M.cards.forEach(function (c, i) {
    var sec = el('section', 'card theme-' + THEME[c.type] + ' type-' + c.type);
    sec.dataset.label = c.label || c.title;
    sec.setAttribute('aria-roledescription', 'card');
    cards.push({ def: c, sec: sec });
    render[c.type](c, sec, i);
    deck.appendChild(sec);
    add(add(segWrap, 'div', 'seg'), 'span');
  });

  quizIdx.forEach(function (i, k) {
    cards[i].sec.querySelectorAll('.option').forEach(function (o) {
      o.addEventListener('click', function () {
        if (state.answers[k] >= 0) return;
        state.answers[k] = Number(o.dataset.k);
        applyAnswer(i, state.answers[k], true);
        refreshNav();
        save();
      });
    });
  });

  // Tap zones: left third goes back, the rest goes forward, unless the tap hit a control or a prompt
  deck.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-next]')) { next(); return; }
    if (t.closest('[data-review]')) { show(0); return; }
    if (t.closest('button, a, textarea, input, label, details, .prompt, .quote, .checklist, figure')) return;
    if (window.getSelection && String(window.getSelection())) return;
    var rect = cards[current].sec.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 3) prev(); else next();
  });

  // Swipe (not inside a prompt, where people select text)
  var sx = null, sy = null;
  deck.addEventListener('touchstart', function (e) {
    if (e.target.closest('.prompt, textarea')) { sx = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  deck.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx;
    var dy = e.changedTouches[0].clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      e.preventDefault();
      if (dx < 0) next(); else prev();
    }
  });

  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'PRE') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
  });
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  window.addEventListener('pagehide', save);

  // Resume where the learner left off
  restore(tracker.start());
  quizIdx.forEach(function (i, k) { if (state.answers[k] >= 0) applyAnswer(i, state.answers[k], false); });
  // Never resume past a check that still blocks
  var start = state.card;
  for (var b = 0; b < start; b++) { if (isBlocked(b)) { start = b; break; } }
  show(start);
})();
