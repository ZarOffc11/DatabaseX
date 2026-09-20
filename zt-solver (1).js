(function () {
  if (window.__ztSolver) return;
  window.__ztSolver = true;

  // ===== Config =====
  var MODEL = 'qwen/qwen3.8-27b:free';
  var KEY_STORE = 'zt_or_key';

  var enabled = true;
  var busy = false;
  var lastId = '';
  var timer = null;

  // ===== API key (diminta sekali, disimpan di localStorage) =====
  function getKey() {
    var k = '';
    try { k = localStorage.getItem(KEY_STORE) || ''; } catch (e) {}
    if (!k) {
      k = (prompt('OpenRouter API key:') || '').trim();
      if (k) { try { localStorage.setItem(KEY_STORE, k); } catch (e) {} }
    }
    return k;
  }

  // ===== Tombol toggle =====
  var btn = document.createElement('button');
  btn.id = 'zt-toggle-btn';
  btn.style.cssText =
    'position:fixed;bottom:80px;right:12px;width:46px;height:46px;border-radius:50%;' +
    'background:#2563eb;color:#fff;border:none;font-size:20px;z-index:2147483647;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.4);opacity:.85';
  function setState(s) {
    var map = { on: '🤖', off: '⏸', think: '⏳', err: '⚠️', skip: '⏭' };
    btn.textContent = map[s] || '🤖';
    btn.title = s;
  }
  btn.onclick = function () {
    enabled = !enabled;
    lastId = '';
    setState(enabled ? 'on' : 'off');
    if (enabled) run();
  };
  document.body.appendChild(btn);
  setState('on');

  // ===== Baca soal dari DOM =====
  function readQuestion() {
    var q = document.querySelector('[data-testid="quiz-container"]');
    if (!q) return null;

    var numEl = q.querySelector('[data-testid="current-question-number"]');
    var textEl = q.querySelector('#questionText');
    var imgEl = q.querySelector('img[data-testid="question-container-image"]');
    var opts = Array.prototype.slice.call(
      q.querySelectorAll('button.option[data-cy^="option-"]')
    );

    var optTexts = opts.map(function (o) {
      var p = o.querySelector('#optionText');
      return ((p ? p.innerText : o.innerText) || '').trim();
    });

    var img = '';
    if (imgEl) {
      img = (imgEl.currentSrc || imgEl.src || '').replace(/([?&]w=)\d+/, '$1800');
    }

    return {
      id: (q.getAttribute('data-quesid') || '') + '#' + (numEl ? numEl.textContent : ''),
      text: textEl ? textEl.innerText.trim() : '',
      img: img,
      hasVideo: !!q.querySelector('video, iframe'),
      opts: opts,
      optTexts: optTexts
    };
  }

  // ===== Tanya AI =====
  function ask(q, key) {
    var prompt =
      'Answer this multiple-choice quiz question.\n' +
      'Question: ' + q.text + '\n' +
      'Options:\n' +
      q.optTexts.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n') +
      '\nReply ONLY with the correct option number(s), comma-separated if more than one. No explanation.';

    var content = [];
    if (q.img) content.push({ type: 'image_url', image_url: { url: q.img } });
    content.push({ type: 'text', text: prompt });

    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [{ role: 'user', content: content }]
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.choices) throw new Error(JSON.stringify(j.error || j));
        return j.choices[0].message.content || '';
      });
  }

  function parseAnswer(text, n) {
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    var nums = (text.match(/\d+/g) || []).map(Number);
    var out = [];
    nums.forEach(function (x) {
      if (x >= 1 && x <= n && out.indexOf(x) === -1) out.push(x);
    });
    return out;
  }

  // ===== Sorot jawaban =====
  function mark(opts, idxs) {
    opts.forEach(function (o) {
      o.style.outline = '';
      o.style.boxShadow = '';
    });
    idxs.forEach(function (i) {
      var o = opts[i - 1];
      if (!o) return;
      o.style.outline = '4px solid #22c55e';
      o.style.outlineOffset = '-2px';
      o.style.boxShadow = '0 0 18px #22c55e';
    });
  }

  // ===== Main loop =====
  function run() {
    if (!enabled || busy) return;
    var q = readQuestion();
    if (!q || q.opts.length < 2 || !q.optTexts.some(Boolean)) return;
    if (q.id === lastId) return;
    lastId = q.id;

    if (q.hasVideo) { setState('skip'); return; }

    var key = getKey();
    if (!key) { enabled = false; setState('off'); return; }

    busy = true;
    setState('think');
    ask(q, key)
      .then(function (raw) {
        var cur = readQuestion();
        if (!cur || cur.id !== q.id) return; // soal sudah ganti
        var idxs = parseAnswer(raw, q.opts.length);
        console.log('[zt-solver]', q.text, '=>', raw, idxs);
        mark(cur.opts, idxs);
        setState(idxs.length ? 'on' : 'err');
      })
      .catch(function (e) {
        console.error('[zt-solver]', e);
        setState('err');
      })
      .then(function () { busy = false; });
  }

  new MutationObserver(function () {
    clearTimeout(timer);
    timer = setTimeout(run, 500);
  }).observe(document.body, { childList: true, subtree: true });

  run();
})();
