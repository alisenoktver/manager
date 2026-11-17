/* ============================================================
   CARTADGT · single-file personal page — application logic
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const nf = new Intl.NumberFormat('ru-RU');
  const money = v => nf.format(Math.round(v)) + ' ₽';
  const num = v => nf.format(Math.round(v));
  const pct = v => (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('cartadgt:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cartadgt:' + k, JSON.stringify(v)); } catch (e) { /* sandboxed */ } }
  };

  /* ---------------- toasts ---------------- */
  const toastHost = $('#toasts');
  function toast(msg, kind) {
    kind = kind || 'ok';
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    const icon = kind === 'ok' ? 'i-check' : kind === 'warn' ? 'i-alert' : 'i-info';
    el.innerHTML = '<svg aria-hidden="true"><use href="#' + icon + '"/></svg><span></span>';
    el.querySelector('span').textContent = msg;
    toastHost.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3200);
    while (toastHost.children.length > 3) toastHost.firstChild.remove();
  }

  async function copyText(text, okMsg) {
    let done = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); done = true; }
    } catch (e) { done = false; }
    if (!done) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        done = document.execCommand('copy'); ta.remove();
      } catch (e) { done = false; }
    }
    if (done) { toast(okMsg || 'Скопировано в буфер обмена', 'ok'); sfx.success(); }
    else { toast('Браузер не дал доступ к буферу — выделите текст вручную', 'warn'); sfx.err(); }
    return done;
  }

  function download(name, text) {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Файл ' + name + ' сохранён', 'ok'); sfx.success();
    } catch (e) { toast('Не удалось сохранить файл', 'warn'); }
  }

  function openTelegram() {
    try {
      const w = window.open('https://t.me/Cartadgt', '_blank', 'noopener');
      if (!w) toast('Откройте вручную: t.me/Cartadgt', 'info');
    } catch (e) { toast('Откройте вручную: t.me/Cartadgt', 'info'); }
  }

  /* ---------------- sound engine ---------------- */
  const sfx = (function () {
    let ctx = null, master = null, ready = false;
    let on = store.get('sound', true);
    const btn = $('#soundBtn'), lbl = $('#soundLbl');
    let lastTick = 0;

    function paint() {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      lbl.textContent = on ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ';
      btn.title = on ? 'Звук интерфейса включён — нажмите, чтобы выключить' : 'Звук интерфейса выключен — нажмите, чтобы включить';
    }
    function init() {
      if (ready) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        ready = true;
      } catch (e) { ready = false; }
    }
    function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
    function tone(freq, dur, type, gain, slideTo) {
      if (!on) return;
      init(); if (!ready) return; resume();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    const api = {
      hover() { const n = performance.now(); if (n - lastTick < 70) return; lastTick = n; tone(2100, 0.035, 'triangle', 0.012); },
      click() { tone(660, 0.09, 'triangle', 0.05, 1180); },
      tick(v) { const n = performance.now(); if (n - lastTick < 45) return; lastTick = n; tone(420 + v * 900, 0.03, 'square', 0.014); },
      success() { tone(880, 0.1, 'sine', 0.045); setTimeout(() => tone(1320, 0.16, 'sine', 0.038), 80); },
      err() { tone(220, 0.18, 'sawtooth', 0.03, 130); },
      section() { tone(320, 0.22, 'sine', 0.022, 520); },
      open() { tone(520, 0.14, 'triangle', 0.04, 900); },
      close() { tone(700, 0.12, 'triangle', 0.03, 320); },
      toggle() {
        on = !on; store.set('sound', on); paint();
        if (on) { init(); resume(); api.success(); toast('Звук интерфейса включён', 'info'); }
        else { toast('Звук выключен', 'info'); }
      },
      get on() { return on; }
    };
    btn.addEventListener('click', api.toggle);
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, function once() {
      init(); resume(); window.removeEventListener(ev, once);
    }, { once: true, passive: true }));
    paint();
    return api;
  })();

  document.addEventListener('pointerover', e => {
    const t = e.target.closest('a,button,.svc li,.gitem,summary,.preset,.pick');
    if (t) sfx.hover();
  }, { passive: true });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-sfx="click"]');
    if (t) sfx.click();
  });

  /* ---------------- starfield ---------------- */
  (function starfield() {
    const cv = $('#stars');
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d', { alpha: true });
    let w = 0, h = 0, dpr = 1, pts = [], raf = 0, running = true, visible = true;
    const pointer = { x: -999, y: -999 };
    const HUES = ['33,243,198', '255,46,126', '61,123,255', '139,92,246', '255,176,32'];

    function build() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = w < 760 ? 13000 : 9000;
      const count = clamp(Math.round((w * h) / density), 34, 120);
      pts = new Array(count).fill(0).map(() => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .16, vy: (Math.random() - .5) * .16,
        r: Math.random() * 1.5 + .45,
        c: HUES[(Math.random() * HUES.length) | 0],
        tw: Math.random() * Math.PI * 2,
        d: Math.random() * .6 + .4
      }));
    }
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (!running || !visible) return;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy; p.tw += 0.02;
        if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
        const dx = p.x - pointer.x, dy = p.y - pointer.y;
        const dist2 = dx * dx + dy * dy;
        let alpha = (0.32 + Math.sin(p.tw) * 0.24) * p.d;
        if (dist2 < 26000) {
          const f = 1 - dist2 / 26000;
          alpha += f * 0.55;
          ctx.strokeStyle = 'rgba(' + p.c + ',' + (f * 0.22).toFixed(3) + ')';
          ctx.lineWidth = .7;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(' + p.c + ',' + clamp(alpha, 0, 1).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
    }
    function start() { if (!raf) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    build();
    if (reduced) { running = false; ctx.clearRect(0, 0, w, h); pts.forEach(p => { ctx.fillStyle = 'rgba(' + p.c + ',.5)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }); }
    else start();

    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { build(); if (reduced) { ctx.clearRect(0, 0, w, h); pts.forEach(p => { ctx.fillStyle = 'rgba(' + p.c + ',.5)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }); } }, 180); }, { passive: true });
    window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    window.addEventListener('pointerleave', () => { pointer.x = pointer.y = -999; }, { passive: true });
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) start(); else stop(); });
  })();

  /* ---------------- nav, scrollspy, accents ---------------- */
  const nav = $('#nav'), progress = $('#navProgress'), burger = $('#burger'), panel = $('#mobilePanel'), toTop = $('#toTop');
  const sections = $$('main section[id]');
  const navLinks = $$('.nav-links a');
  let currentId = '';

  function setAccent(sec) {
    const a = sec.getAttribute('data-accent'), b = sec.getAttribute('data-accent2');
    if (a) document.documentElement.style.setProperty('--accent', a);
    if (b) document.documentElement.style.setProperty('--accent-2', b);
  }
  function closePanel() {
    panel.classList.remove('open'); burger.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('locked');
  }
  burger.addEventListener('click', () => {
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open); burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('locked', open);
    sfx.click();
  });
  $$('#mobilePanel a').forEach(a => a.addEventListener('click', () => { closePanel(); sfx.click(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  const tl = $('#timeline'), tlFill = $('#tlFill'), steps = $$('.step');
  function onScroll() {
    const y = window.scrollY || window.pageYOffset;
    const doc = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (doc > 0 ? clamp(y / doc, 0, 1) * 100 : 0) + '%';
    nav.classList.toggle('scrolled', y > 12);
    toTop.classList.toggle('show', y > 700);

    const probe = y + parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) + 90;
    let active = sections[0];
    for (const s of sections) { if (s.offsetTop <= probe) active = s; }
    if (active && active.id !== currentId) {
      currentId = active.id;
      setAccent(active);
      navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('data-nav') === currentId));
      if (y > 200) sfx.section();
    }
    if (tl) {
      const r = tl.getBoundingClientRect();
      const center = window.innerHeight * 0.62;
      const p = clamp((center - r.top) / Math.max(1, r.height), 0, 1);
      tlFill.style.height = (p * (r.height - 16)) + 'px';
      steps.forEach(st => {
        const sr = st.getBoundingClientRect();
        st.classList.toggle('on', sr.top < center);
      });
    }
  }
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  toTop.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); sfx.click(); });

  /* ---------------- reveal ---------------- */
  const revealables = $$('.rv');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealables.forEach(el => { if (!el.closest('.hero')) io.observe(el); });
  } else revealables.forEach(el => el.classList.add('in'));

  /* ---------------- hero ---------------- */
  (function hero() {
    const h = $('#hero');
    setTimeout(() => h.classList.add('ready'), 90);

    // ticker
    const words = ['КАРТОЧКИ WB', 'SEO-ТЕКСТЫ', 'ИНФОГРАФИКА', 'НЕЙРОФОТО', 'ОЖИВЛЕНИЕ ФОТО', 'FIGMA', 'АРК · РЕКЛАМА',
      'ЮНИТ-ЭКОНОМИКА', 'КОНКУРЕНТНЫЙ АНАЛИЗ', 'ПОСТАВКИ', 'НЕЙРОФОТОСЕССИИ', 'E-COMMERCE VISUAL', 'ПЕСНИ НА ЗАКАЗ'];
    const track = $('#tickerTrack');
    const html = words.map(w => '<span>◆ <b>' + w + '</b></span>').join('');
    track.innerHTML = html + html;

    // counters
    $$('[data-count]').forEach(el => {
      const target = parseFloat(el.getAttribute('data-count'));
      const pad = parseInt(el.getAttribute('data-pad') || '0', 10);
      const suffix = el.getAttribute('data-suffix') || '';
      const dur = 1300, t0 = performance.now() + 380;
      function step(t) {
        const p = clamp((t - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        let v = Math.round(target * e).toString();
        if (pad) v = v.padStart(pad, '0');
        el.textContent = v + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      if (reduced) { let v = String(target); if (pad) v = v.padStart(pad, '0'); el.textContent = v + suffix; }
      else requestAnimationFrame(step);
    });

    // medallion parallax
    const med = $('#medallion');
    if (med && !reduced && window.matchMedia('(hover:hover)').matches) {
      const chips = $$('.chip-float', med);
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      function loop() {
        cx += (tx - cx) * .08; cy += (ty - cy) * .08;
        med.style.transform = 'rotateY(' + (cx * 7).toFixed(2) + 'deg) rotateX(' + (-cy * 7).toFixed(2) + 'deg)';
        chips.forEach(c => {
          const k = parseFloat(c.getAttribute('data-par')) || 0;
          c.style.transform = 'translate3d(' + (cx * k * 320).toFixed(1) + 'px,' + (cy * k * 320).toFixed(1) + 'px,0)';
        });
        if (Math.abs(tx - cx) > .001 || Math.abs(ty - cy) > .001) raf = requestAnimationFrame(loop);
        else raf = 0;
      }
      h.addEventListener('pointermove', e => {
        const r = h.getBoundingClientRect();
        tx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
        ty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
        if (!raf) raf = requestAnimationFrame(loop);
      }, { passive: true });
      h.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); }, { passive: true });
    }
  })();

  /* ---------------- unit economics calculator ---------------- */
  const CALC = (function () {
    const CFG = [
      { k: 'price', label: 'Цена продажи', unit: '₽', min: 200, max: 12000, step: 10, hint: 'Итоговая цена для покупателя после скидок' },
      { k: 'cost', label: 'Себестоимость', unit: '₽', min: 20, max: 6000, step: 10, hint: 'Закупка, упаковка и доставка до склада WB' },
      { k: 'commission', label: 'Комиссия WB', unit: '%', min: 5, max: 35, step: 0.5, hint: 'Зависит от категории и схемы работы' },
      { k: 'logistics', label: 'Логистика до покупателя', unit: '₽', min: 20, max: 250, step: 1, hint: 'Платится за каждую доставку, включая невыкуп' },
      { k: 'buyout', label: 'Выкуп', unit: '%', min: 20, max: 100, step: 1, hint: 'Доля заказов, которые покупатель забирает' },
      { k: 'returnLog', label: 'Обратная логистика', unit: '₽', min: 0, max: 150, step: 5, hint: 'Возврат невыкупленного товара на склад' },
      { k: 'storage', label: 'Хранение и приёмка', unit: '₽', min: 0, max: 150, step: 1, hint: 'В пересчёте на отправленную единицу' },
      { k: 'drr', label: 'Реклама (ДРР)', unit: '%', min: 0, max: 40, step: 0.5, hint: 'Доля рекламных расходов от выручки' },
      { k: 'tax', label: 'Налог', unit: '%', min: 0, max: 20, step: 0.5, hint: 'Например, 6% УСН «Доходы»' },
      { k: 'other', label: 'Прочее: брак, упаковка', unit: '₽', min: 0, max: 300, step: 5, hint: 'Резерв на потери и расходники' }
    ];
    const PRESETS = {
      cosmetics: { price: 1490, cost: 320, commission: 17, logistics: 55, buyout: 92, returnLog: 50, storage: 12, drr: 14, tax: 6, other: 20 },
      clothes: { price: 2490, cost: 780, commission: 25, logistics: 75, buyout: 45, returnLog: 50, storage: 20, drr: 18, tax: 6, other: 35 },
      home: { price: 1190, cost: 340, commission: 20, logistics: 60, buyout: 88, returnLog: 50, storage: 15, drr: 10, tax: 6, other: 25 }
    };
    const SEG = [
      { k: 'cost', n: 'Себестоимость', c: 'var(--ch-1)', pat: 0 },
      { k: 'commission', n: 'Комиссия WB', c: 'var(--ch-2)', pat: .35 },
      { k: 'logistics', n: 'Логистика', c: 'var(--ch-3)', pat: 0 },
      { k: 'storage', n: 'Хранение', c: 'var(--ch-4)', pat: .35 },
      { k: 'ads', n: 'Реклама', c: 'var(--ch-5)', pat: 0 },
      { k: 'tax', n: 'Налог', c: 'var(--ch-6)', pat: .35 },
      { k: 'other', n: 'Прочее', c: 'var(--ch-7)', pat: 0 },
      { k: 'profit', n: 'Прибыль', c: 'var(--ch-8)', pat: 0 }
    ];

    const state = Object.assign({}, PRESETS.cosmetics, store.get('calc', {}));
    const host = $('#controls');
    const inputs = {};

    CFG.forEach(c => {
      const wrap = document.createElement('div');
      wrap.className = 'ctrl';
      wrap.innerHTML =
        '<div class="ctrl-top">' +
        '<label for="r_' + c.k + '">' + c.label + '<span class="q" title="' + c.hint + '">?</span></label>' +
        '<span class="num-wrap"><input type="number" id="n_' + c.k + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" aria-label="' + c.label + ', число"><span>' + c.unit + '</span></span>' +
        '</div>' +
        '<input type="range" id="r_' + c.k + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" aria-label="' + c.label + '">' +
        '<div class="ctrl-scale"><span>' + nf.format(c.min) + '</span><span>' + nf.format(c.max) + '</span></div>';
      host.appendChild(wrap);
      const range = $('#r_' + c.k, wrap), number = $('#n_' + c.k, wrap);
      inputs[c.k] = { range, number, cfg: c };
      const apply = (val, from) => {
        let v = parseFloat(val);
        if (!isFinite(v)) v = c.min;
        v = clamp(v, c.min, c.max);
        v = Math.round(v / c.step) * c.step;
        v = Math.round(v * 100) / 100;
        state[c.k] = v;
        if (from !== 'range') range.value = v;
        if (from !== 'number') number.value = v;
        range.style.setProperty('--p', ((v - c.min) / (c.max - c.min) * 100) + '%');
        markPreset();
        render();
        store.set('calc', state);
      };
      range.addEventListener('input', e => { apply(e.target.value, 'range'); sfx.tick((state[c.k] - c.min) / (c.max - c.min)); });
      number.addEventListener('input', e => {
        const raw = parseFloat(e.target.value);
        if (!isFinite(raw)) return;
        const v = clamp(raw, c.min, c.max);
        state[c.k] = v; range.value = v;
        range.style.setProperty('--p', ((v - c.min) / (c.max - c.min) * 100) + '%');
        markPreset(); render(); store.set('calc', state);
      });
      number.addEventListener('blur', e => apply(e.target.value, 'number'));
      number.addEventListener('keydown', e => { if (e.key === 'Enter') { apply(e.target.value, 'number'); e.target.blur(); } });
    });

    function sync() {
      CFG.forEach(c => {
        const v = clamp(state[c.k], c.min, c.max);
        state[c.k] = v;
        inputs[c.k].range.value = v;
        inputs[c.k].number.value = v;
        inputs[c.k].range.style.setProperty('--p', ((v - c.min) / (c.max - c.min) * 100) + '%');
      });
    }
    function markPreset() {
      $$('.preset').forEach(b => {
        const p = PRESETS[b.getAttribute('data-preset')];
        const same = Object.keys(p).every(k => Math.abs(p[k] - state[k]) < 0.01);
        b.classList.toggle('active', same);
      });
    }

    function compute(s) {
      const b = s.buyout / 100, k = s.commission / 100, a = s.drr / 100, t = s.tax / 100;
      const perSoldLog = (s.logistics + s.returnLog * (1 - b)) / b;
      const perSoldStorage = s.storage / b;
      const parts = {
        cost: s.cost,
        commission: s.price * k,
        logistics: perSoldLog,
        storage: perSoldStorage,
        ads: s.price * a,
        tax: s.price * t,
        other: s.other
      };
      const costs = Object.values(parts).reduce((x, y) => x + y, 0);
      const profit = s.price - costs;
      const margin = profit / s.price;
      const roi = s.cost > 0 ? profit / s.cost : 0;
      const fixed = s.cost + s.other + perSoldLog + perSoldStorage;
      const denom = 1 - k - a - t;
      const breakEven = denom > 0.01 ? fixed / denom : Infinity;
      const maxDrr = 1 - k - t - fixed / s.price;
      return { parts, costs, profit, margin, roi, breakEven, maxDrr, b, k, a, t, fixed };
    }

    const stackBar = $('#stackBar'), legend = $('#legend');
    SEG.forEach(s => {
      const i = document.createElement('i');
      i.style.background = s.c; i.style.setProperty('--pat', s.pat);
      i.setAttribute('data-k', s.k); i.title = s.n;
      stackBar.appendChild(i);
      const row = document.createElement('div');
      row.innerHTML = '<span class="sw" style="background:' + s.c + ';color:' + s.c + '"></span><span class="nm">' + s.n + '</span><b data-v="' + s.k + '">—</b><em data-p="' + s.k + '">—</em>';
      legend.appendChild(row);
    });

    const spark = $('#spark');
    function drawSpark(res) {
      const w = Math.max(240, spark.clientWidth || 320), h = 132;
      spark.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      const padL = 6, padR = 6, padT = 12, padB = 22;
      const xs = [], ys = [];
      const bMin = 0.2, bMax = 1;
      const profitAt = b => {
        const s = state;
        const fixed = s.cost + s.other + (s.logistics + s.returnLog * (1 - b)) / b + s.storage / b;
        return s.price * (1 - s.commission / 100 - s.drr / 100 - s.tax / 100) - fixed;
      };
      const N = 60;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= N; i++) {
        const b = bMin + (bMax - bMin) * i / N;
        const v = profitAt(b);
        xs.push(b); ys.push(v);
        if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
      lo = Math.min(lo, 0); hi = Math.max(hi, 0);
      const span = Math.max(1, hi - lo);
      lo -= span * .12; hi += span * .12;
      const X = b => padL + (b - bMin) / (bMax - bMin) * (w - padL - padR);
      const Y = v => padT + (hi - v) / (hi - lo) * (h - padT - padB);
      let d = '', area = '';
      for (let i = 0; i <= N; i++) {
        const x = X(xs[i]).toFixed(1), y = Y(ys[i]).toFixed(1);
        d += (i ? 'L' : 'M') + x + ' ' + y + ' ';
      }
      area = d + 'L' + X(bMax).toFixed(1) + ' ' + Y(Math.max(lo, 0)).toFixed(1) + ' L' + X(bMin).toFixed(1) + ' ' + Y(Math.max(lo, 0)).toFixed(1) + ' Z';
      const zeroY = Y(0).toFixed(1);
      const curB = clamp(state.buyout / 100, bMin, bMax);
      const curV = profitAt(curB);
      const cx = X(curB), cy = Y(curV);
      const col = curV >= 0 ? '#5ef08a' : '#ff3b5c';
      spark.innerHTML =
        '<defs>' +
        '<linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21f3c6" stop-opacity=".42"/><stop offset="1" stop-color="#21f3c6" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="sl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2e7e"/><stop offset=".55" stop-color="#ffb020"/><stop offset="1" stop-color="#5ef08a"/></linearGradient>' +
        '</defs>' +
        '<path d="' + area + '" fill="url(#sg)"/>' +
        '<line x1="' + padL + '" y1="' + zeroY + '" x2="' + (w - padR) + '" y2="' + zeroY + '" stroke="rgba(255,255,255,.28)" stroke-width="1" stroke-dasharray="4 4"/>' +
        '<text x="' + (padL + 2) + '" y="' + (parseFloat(zeroY) - 5) + '" fill="#948ac2" font-size="9" font-family="monospace">0 ₽</text>' +
        '<path d="' + d + '" fill="none" stroke="url(#sl)" stroke-width="2.4" stroke-linecap="round"/>' +
        '<line x1="' + cx.toFixed(1) + '" y1="' + padT + '" x2="' + cx.toFixed(1) + '" y2="' + (h - padB) + '" stroke="' + col + '" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>' +
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5" fill="' + col + '" stroke="#0b0520" stroke-width="2"/>' +
        '<text x="' + clamp(cx, 34, w - 40).toFixed(1) + '" y="' + clamp(cy - 12, 12, h - 26).toFixed(1) + '" fill="' + col + '" font-size="11" font-family="monospace" text-anchor="middle">' + money(curV) + '</text>' +
        '<text x="' + padL + '" y="' + (h - 6) + '" fill="#6f6796" font-size="9" font-family="monospace">выкуп 20%</text>' +
        '<text x="' + (w - padR) + '" y="' + (h - 6) + '" fill="#6f6796" font-size="9" font-family="monospace" text-anchor="end">100%</text>';
    }

    let stampTimer = 0;
    function render() {
      const r = compute(state);
      const cls = r.profit < 0 ? 'neg' : r.margin < 0.12 ? 'mid' : 'pos';
      const p = $('#mProfit');
      p.textContent = money(r.profit); p.className = cls;
      $('#mProfitSub').textContent = r.profit < 0 ? 'убыток на каждой продаже' : 'после всех расходов';
      const m = $('#mMargin'); m.textContent = pct(r.margin * 100); m.className = cls;
      const roi = $('#mRoi'); roi.textContent = pct(r.roi * 100); roi.className = cls;
      $('#mBreak').textContent = isFinite(r.breakEven) ? money(r.breakEven) : '—';
      $('#mMaxDrr').textContent = r.maxDrr > 0 ? pct(r.maxDrr * 100) : '0%';

      const v = $('#verdict'), vt = $('#verdictText');
      let kind, text;
      if (r.profit < 0) { kind = 'bad'; text = 'Убыток: цена не покрывает расходы. Поднимите цену или снизьте ДРР.'; }
      else if (r.margin < 0.12) { kind = 'warn'; text = 'Маржа тонкая — реклама или логистика съедает прибыль.'; }
      else if (r.margin < 0.25) { kind = 'ok'; text = 'Экономика сходится. Есть запас на рекламу и акции.'; }
      else { kind = 'ok'; text = 'Здоровая экономика: можно масштабировать рекламу.'; }
      v.className = 'verdict ' + kind;
      v.querySelector('use').setAttribute('href', kind === 'ok' ? '#i-check' : '#i-alert');
      vt.textContent = text;

      const denom = Math.max(state.price, r.costs);
      const values = Object.assign({}, r.parts, { profit: Math.max(0, r.profit) });
      SEG.forEach(s => {
        const val = values[s.k];
        const share = clamp(val / denom, 0, 1);
        const bar = stackBar.querySelector('[data-k="' + s.k + '"]');
        bar.style.width = (share * 100).toFixed(2) + '%';
        bar.title = s.n + ': ' + money(val);
        legend.querySelector('[data-v="' + s.k + '"]').textContent = money(val);
        legend.querySelector('[data-p="' + s.k + '"]').textContent = Math.round(val / state.price * 100) + '%';
      });
      $('#stackTotal').textContent = 'ЦЕНА ' + money(state.price);
      $('#sparkNow').textContent = 'ВЫКУП ' + state.buyout + '%';
      drawSpark(r);

      const stamp = $('#calcStamp');
      stamp.textContent = 'ПЕРЕСЧИТАНО ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      stamp.style.color = 'var(--cyan)';
      clearTimeout(stampTimer);
      stampTimer = setTimeout(() => { stamp.style.color = ''; }, 700);

      if (window.SEO) window.SEO.syncPrice(state.price);
    }

    $$('.preset').forEach(b => b.addEventListener('click', () => {
      Object.assign(state, PRESETS[b.getAttribute('data-preset')]);
      sync(); markPreset(); render(); store.set('calc', state); sfx.click();
      toast('Сценарий «' + b.textContent + '» загружен', 'info');
    }));
    $('#calcReset').addEventListener('click', () => {
      Object.assign(state, PRESETS.cosmetics); sync(); markPreset(); render(); store.set('calc', state);
      sfx.click(); toast('Параметры сброшены к базовому сценарию', 'info');
    });
    $('#calcRandom').addEventListener('click', () => {
      CFG.forEach(c => {
        const raw = c.min + Math.random() * (c.max - c.min);
        state[c.k] = Math.round(raw / c.step) * c.step;
      });
      state.buyout = Math.round(clamp(state.buyout, 35, 98));
      state.cost = Math.round(clamp(state.cost, 60, state.price * 0.55));
      sync(); markPreset(); render(); store.set('calc', state); sfx.click();
      toast('Случайный товар сгенерирован', 'info');
    });
    $('#calcCopy').addEventListener('click', () => {
      const r = compute(state);
      const lines = [
        'ЮНИТ-ЭКОНОМИКА WILDBERRIES · расчёт CARTADGT',
        '— — — — — — — — — —',
        'Цена продажи: ' + money(state.price),
        'Себестоимость: ' + money(state.cost),
        'Комиссия WB: ' + state.commission + '%  (' + money(r.parts.commission) + ')',
        'Логистика + обратная: ' + money(r.parts.logistics),
        'Хранение и приёмка: ' + money(r.parts.storage),
        'Реклама (ДРР ' + state.drr + '%): ' + money(r.parts.ads),
        'Налог ' + state.tax + '%: ' + money(r.parts.tax),
        'Прочее: ' + money(r.parts.other),
        'Выкуп: ' + state.buyout + '%',
        '— — — — — — — — — —',
        'Прибыль с единицы: ' + money(r.profit),
        'Маржа: ' + pct(r.margin * 100),
        'ROI: ' + pct(r.roi * 100),
        'Мин. цена без убытка: ' + (isFinite(r.breakEven) ? money(r.breakEven) : '—'),
        'Макс. ДРР без убытка: ' + (r.maxDrr > 0 ? pct(r.maxDrr * 100) : '0%'),
        '',
        'Обсудить: https://t.me/Cartadgt'
      ].join('\n');
      copyText(lines, 'Расчёт скопирован — можно отправить в чат');
    });

    if ('ResizeObserver' in window) {
      let rt2 = 0;
      new ResizeObserver(() => { clearTimeout(rt2); rt2 = setTimeout(() => drawSpark(compute(state)), 120); }).observe(spark);
    }
    sync(); markPreset(); render();
    return { state, compute };
  })();

  /* ---------------- SEO studio ---------------- */
  window.SEO = (function () {
    const CATS = {
      cosmetics: {
        img: $('#wbImg').getAttribute('src'),
        type: 'Сыворотка для лица', brand: 'LUMÉ',
        keys: ['сыворотка для лица', 'гиалуроновая кислота', 'увлажняющая сыворотка'],
        feats: ['увлажнение 24 часа', 'без парабенов', 'для чувствительной кожи', 'объём 30 мл'],
        suggest: ['уход за кожей лица', 'антивозрастной уход', 'сыворотка с ниацинамидом', 'корейская косметика'],
        line: 'лёгкая текстура быстро впитывается и не оставляет липкости',
        bullets: ['Активный комплекс работает с увлажнением и тонусом кожи', 'Подходит для утреннего и вечернего ухода', 'Флакон с пипеткой — точная дозировка без перерасхода']
      },
      home: {
        img: document.querySelector('.gitem[data-i="1"] img').getAttribute('src'),
        type: 'Ароматическая свеча', brand: 'HOME LAB',
        keys: ['ароматическая свеча', 'свеча в керамике', 'декор для дома'],
        feats: ['соевый воск', 'время горения 40 часов', 'ручная работа', 'аромат ванили и кедра'],
        suggest: ['подарок на новоселье', 'свеча для интерьера', 'уютный декор', 'набор для дома'],
        line: 'ровное горение без копоти и мягкий аромат, который заполняет комнату',
        bullets: ['Керамический сосуд можно использовать после выгорания воска', 'Устойчивое пламя и чистое горение', 'Готовый подарок — упаковка входит в комплект']
      },
      clothes: {
        img: document.querySelector('.gitem[data-i="2"] img').getAttribute('src'),
        type: 'Свитер оверсайз', brand: 'NORD KNIT',
        keys: ['свитер оверсайз', 'женский свитер', 'вязаный свитер'],
        feats: ['мягкая пряжа', 'свободный крой', 'размеры 42–52', 'не колется'],
        suggest: ['базовый гардероб', 'свитер на осень', 'одежда больших размеров', 'уютный трикотаж'],
        line: 'держит форму после стирки и не вытягивается в локтях',
        bullets: ['Свободная посадка — садится на любой тип фигуры', 'Плотная вязка держит тепло без объёма', 'Базовый цвет сочетается с джинсами и юбкой']
      },
      kids: {
        img: document.querySelector('.gitem[data-i="1"] img').getAttribute('src'),
        type: 'Развивающий набор', brand: 'KIDO',
        keys: ['развивающие игрушки', 'набор для творчества', 'подарок ребёнку'],
        feats: ['безопасные материалы', 'возраст 3+', 'сертификат ЕАС', 'крупные детали'],
        suggest: ['игрушки для мальчика', 'игрушки для девочки', 'развитие моторики', 'детский подарок'],
        line: 'детали крупные, без острых краёв — играть можно без присмотра взрослых',
        bullets: ['Развивает моторику, внимание и воображение', 'Прочный пластик выдерживает активную игру', 'Компактная коробка — удобно брать в поездку']
      },
      electronics: {
        img: $('#wbImg').getAttribute('src'),
        type: 'Беспроводные наушники', brand: 'SONIQ',
        keys: ['беспроводные наушники', 'наушники bluetooth', 'наушники с микрофоном'],
        feats: ['до 30 часов с кейсом', 'Bluetooth 5.3', 'шумоподавление', 'защита IPX5'],
        suggest: ['наушники для спорта', 'гарнитура для телефона', 'наушники вкладыши', 'подарок мужчине'],
        line: 'стабильное соединение без обрывов и задержки в видео',
        bullets: ['Быстрое подключение при открытии кейса', 'Чистый звук на звонках — микрофон с шумоподавлением', 'Кейс заряжается от USB-C за 1,5 часа']
      }
    };

    let cat = 'cosmetics';
    let keys = CATS[cat].keys.slice();
    let feats = CATS[cat].feats.slice();
    let variant = 0;
    let price = CALC.state.price;

    const keysHost = $('#seoKeys'), featsHost = $('#seoFeats'), sugHost = $('#seoSuggest');

    function renderChips() {
      keysHost.innerHTML = '';
      keys.forEach((k, i) => {
        const el = document.createElement('span');
        el.className = 'chip';
        el.innerHTML = '<span></span><button type="button" aria-label="Удалить ключ">×</button>';
        el.firstChild.textContent = k;
        el.querySelector('button').addEventListener('click', () => { keys.splice(i, 1); renderChips(); generate(); sfx.close(); });
        keysHost.appendChild(el);
      });
      if (!keys.length) keysHost.innerHTML = '<span style="font-size:12.5px;color:var(--muted-2)">Добавьте хотя бы один ключ — по нему строится текст</span>';
      featsHost.innerHTML = '';
      feats.forEach((f, i) => {
        const el = document.createElement('span');
        el.className = 'chip m';
        el.innerHTML = '<span></span><button type="button" aria-label="Удалить преимущество">×</button>';
        el.firstChild.textContent = f;
        el.querySelector('button').addEventListener('click', () => { feats.splice(i, 1); renderChips(); generate(); sfx.close(); });
        featsHost.appendChild(el);
      });
      if (!feats.length) featsHost.innerHTML = '<span style="font-size:12.5px;color:var(--muted-2)">Пара преимуществ сделает описание конкретнее</span>';
    }
    function renderSuggest() {
      sugHost.innerHTML = '';
      CATS[cat].suggest.filter(s => keys.indexOf(s) === -1).forEach(s => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = '+ ' + s;
        b.addEventListener('click', () => { keys.push(s); renderChips(); renderSuggest(); generate(); sfx.click(); });
        sugHost.appendChild(b);
      });
    }
    function addFrom(inputId, arr) {
      const inp = $('#' + inputId);
      const v = inp.value.trim().replace(/\s+/g, ' ');
      if (!v) { toast('Введите текст — поле пустое', 'warn'); return; }
      if (arr.length >= 8) { toast('Максимум 8 пунктов — иначе будет переспам', 'warn'); return; }
      if (arr.some(x => x.toLowerCase() === v.toLowerCase())) { toast('Такой пункт уже есть', 'info'); return; }
      arr.push(v); inp.value = '';
      renderChips(); renderSuggest(); generate(); sfx.click();
    }
    $('#seoKeyAdd').addEventListener('click', () => addFrom('seoKeyInput', keys));
    $('#seoFeatAdd').addEventListener('click', () => addFrom('seoFeatInput', feats));
    $('#seoKeyInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFrom('seoKeyInput', keys); } });
    $('#seoFeatInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFrom('seoFeatInput', feats); } });

    $('#seoCat').addEventListener('change', e => {
      cat = e.target.value;
      const c = CATS[cat];
      keys = c.keys.slice(); feats = c.feats.slice();
      $('#seoType').value = c.type; $('#seoBrand').value = c.brand;
      $('#wbImg').src = c.img;
      renderChips(); renderSuggest(); generate(); sfx.click();
      toast('Категория: ' + e.target.selectedOptions[0].textContent, 'info');
    });

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function buildTitle() {
      const type = ($('#seoType').value.trim() || CATS[cat].type);
      const brand = $('#seoBrand').value.trim();
      let t = cap(type);
      if (brand && (t + ' ' + brand).length <= 60) t += ' ' + brand;
      const sorted = keys.slice().sort((a, b) => a.length - b.length);
      for (const k of sorted) {
        if (t.toLowerCase().includes(k.toLowerCase())) continue;
        if ((t + ' ' + k).length <= 60) t += ' ' + k;
      }
      return t.slice(0, 60).trim();
    }
    function buildDesc(title) {
      const type = ($('#seoType').value.trim() || CATS[cat].type).toLowerCase();
      const brand = $('#seoBrand').value.trim() || 'нашего бренда';
      const c = CATS[cat];
      const f = feats.length ? feats : c.feats;
      const k = keys.length ? keys : c.keys;
      const featLine = f.slice(0, 4).join(', ');
      const openers = [
        cap(type) + ' ' + brand + ' — ' + c.line + '.',
        'Ищете ' + k[0] + '? ' + cap(type) + ' ' + brand + ' создан именно для этого: ' + c.line + '.',
        cap(type) + ' от ' + brand + ' — это ' + featLine + ' в одном товаре. Модель ' + c.line + '.'
      ];
      const bodies = [
        'Что важно: ' + featLine + '. Мы собрали характеристики, которые действительно влияют на выбор, и убрали всё лишнее — товар решает свою задачу с первого применения.',
        'Преимущества: ' + featLine + '. Каждый пункт проверен на практике, поэтому товар одинаково хорошо работает и дома, и в поездке.',
        'Коротко о товаре: ' + featLine + '. Продуманная упаковка защищает содержимое при доставке, а понятная инструкция помогает начать пользоваться сразу.'
      ];
      const closers = [
        'Товар отправляется со склада Wildberries — доставка быстрая, возврат по правилам площадки. Добавляйте в корзину, пока действует цена со скидкой.',
        'Отправляем со склада WB, проверяем каждую единицу перед поставкой. Если товар не подойдёт — оформить возврат можно прямо в приложении.',
        'Заказ приходит в фирменной упаковке, поэтому подойдёт и как подарок. Нажмите «В корзину» — и товар поедет к вам с ближайшего склада.'
      ];
      const tail = '\n\nПодойдёт, если вы ищете: ' + k.join(', ') + '.';
      return openers[variant % 3] + ' ' + bodies[variant % 3] + ' ' + closers[variant % 3] + tail;
    }
    function buildBullets() {
      const c = CATS[cat];
      const list = [];
      feats.slice(0, 3).forEach(f => list.push(cap(f)));
      c.bullets.forEach(b => { if (list.length < 5) list.push(b); });
      if (keys.length && list.length < 5) list.push('По запросу «' + keys[0] + '» — релевантный товар');
      return list.slice(0, 5);
    }

    let lastOut = { title: '', desc: '', bullets: [] };
    function generate() {
      const title = buildTitle();
      const desc = buildDesc(title);
      const bullets = buildBullets();
      lastOut = { title, desc, bullets };

      $('#seoTitle').textContent = title;
      const tc = $('#titleCount');
      tc.textContent = title.length + ' / 60';
      tc.className = 'counter' + (title.length > 60 ? ' bad' : title.length > 54 ? ' warn' : '');
      $('#seoDesc').textContent = desc;
      const dc = $('#descCount');
      dc.textContent = desc.length + ' симв.';
      dc.className = 'counter' + (desc.length > 1000 ? ' warn' : desc.length < 300 ? ' warn' : '');
      const bl = $('#seoBullets'); bl.innerHTML = '';
      bullets.forEach(b => { const li = document.createElement('li'); li.textContent = b; bl.appendChild(li); });

      const hay = (title + ' ' + desc).toLowerCase();
      const hit = keys.filter(k => hay.includes(k.toLowerCase())).length;
      const cov = keys.length ? hit / keys.length : 0;
      $('#covTxt').textContent = hit + ' / ' + keys.length + ' ключей в тексте';
      $('#covBar').style.width = (cov * 100) + '%';
      $('#covTxt').style.color = cov === 1 ? 'var(--green)' : cov >= .6 ? 'var(--amber)' : 'var(--red)';
      $('#seoVariant').textContent = 'ВАРИАНТ ' + (variant % 3 + 1) + ' / 3';

      $('#wbName').textContent = title;
      $('#serpQuery').textContent = keys[0] || 'запрос покупателя';
      $('#serpTitle').textContent = title.length > 56 ? title.slice(0, 56).trim() + '…' : title;
      $('#serpDesc').textContent = desc.slice(0, 130).trim() + '…';
      syncPrice(price);
    }
    function syncPrice(p) {
      price = p;
      $('#wbPrice').textContent = money(p);
      $('#wbOld').textContent = money(Math.round(p * 1.6 / 10) * 10);
    }

    let deb = 0;
    ['#seoType', '#seoBrand'].forEach(sel => $(sel).addEventListener('input', () => {
      clearTimeout(deb); deb = setTimeout(generate, 180);
    }));
    $('#seoGen').addEventListener('click', () => { variant++; generate(); sfx.click(); toast('Собран новый вариант текста', 'ok'); });
    $('#seoCopy').addEventListener('click', () => copyText(fullText(), 'Текст карточки скопирован'));
    $('#seoDownload').addEventListener('click', () => download('wb-card-text.txt', fullText()));
    $$('[data-copy]').forEach(b => b.addEventListener('click', () => {
      const what = b.getAttribute('data-copy');
      copyText(what === 'desc' ? lastOut.desc : lastOut.bullets.map(x => '• ' + x).join('\n'),
        what === 'desc' ? 'Описание скопировано' : 'Буллеты скопированы');
    }));
    function fullText() {
      return 'НАИМЕНОВАНИЕ (' + lastOut.title.length + '/60)\n' + lastOut.title +
        '\n\nОПИСАНИЕ (' + lastOut.desc.length + ' символов)\n' + lastOut.desc +
        '\n\nБУЛЛЕТЫ ДЛЯ ИНФОГРАФИКИ\n' + lastOut.bullets.map(x => '• ' + x).join('\n') +
        '\n\nКЛЮЧИ\n' + keys.join(', ') +
        '\n\n— — —\nСобрано на сайте CARTADGT · https://t.me/Cartadgt';
    }

    renderChips(); renderSuggest(); generate();
    return { syncPrice, generate };
  })();

  /* ---------------- before / after ---------------- */
  (function compare() {
    const box = $('#compare');
    if (!box) return;
    let dragging = false;
    function set(p, silent) {
      p = clamp(p, 0, 100);
      box.style.setProperty('--split', p + '%');
      box.setAttribute('aria-valuenow', Math.round(p));
      if (!silent) sfx.tick(p / 100);
    }
    function fromEvent(e) {
      const r = box.getBoundingClientRect();
      set((e.clientX - r.left) / r.width * 100);
    }
    box.addEventListener('pointerdown', e => {
      dragging = true; box.setPointerCapture(e.pointerId); fromEvent(e); e.preventDefault();
    });
    box.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
    const end = e => { if (dragging) { dragging = false; try { box.releasePointerCapture(e.pointerId); } catch (err) {} } };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('keydown', e => {
      const cur = parseFloat(box.getAttribute('aria-valuenow')) || 50;
      if (e.key === 'ArrowLeft') { set(cur - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(cur + 4); e.preventDefault(); }
      if (e.key === 'Home') { set(0); e.preventDefault(); }
      if (e.key === 'End') { set(100); e.preventDefault(); }
    });
    // gentle auto-demo once the block is first seen
    if ('IntersectionObserver' in window && !reduced) {
      const io = new IntersectionObserver(en => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        (function demo(t) {
          if (dragging) return;
          const p = clamp((t - t0) / 1500, 0, 1);
          const e = 1 - Math.pow(1 - p, 3);
          set(50 + Math.sin(e * Math.PI) * 26, true);
          if (p < 1) requestAnimationFrame(demo); else set(50, true);
        })(t0);
      }, { threshold: .45 });
      io.observe(box);
    }
  })();

  /* ---------------- gallery lightbox ---------------- */
  (function lightbox() {
    const items = $$('.gitem');
    const lb = $('#lightbox'), img = $('#lbImg'), t = $('#lbTitle'), d = $('#lbDesc'), idx = $('#lbIdx');
    const data = items.map(el => ({
      src: el.querySelector('img').getAttribute('src'),
      title: el.querySelector('.meta b').textContent,
      desc: el.querySelector('.meta span').textContent
    }));
    let cur = 0, lastFocus = null;
    function paint() {
      const it = data[cur];
      img.src = it.src; img.alt = it.title;
      t.textContent = it.title; d.textContent = it.desc;
      idx.textContent = (cur + 1) + '/' + data.length;
    }
    function open(i) {
      cur = i; paint(); lastFocus = document.activeElement;
      lb.classList.add('open'); document.body.classList.add('locked');
      $('#lbNext').focus(); sfx.open();
    }
    function close() {
      lb.classList.remove('open'); document.body.classList.remove('locked');
      if (lastFocus) lastFocus.focus();
      sfx.close();
    }
    function move(step) { cur = (cur + step + data.length) % data.length; paint(); sfx.tick(cur / data.length); }
    items.forEach((el, i) => el.addEventListener('click', () => open(i)));
    $$('[data-close]', lb).forEach(el => el.addEventListener('click', close));
    $('#lbPrev').addEventListener('click', () => move(-1));
    $('#lbNext').addEventListener('click', () => move(1));
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'Tab') {
        const f = $$('button', lb).filter(b => b.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    });
  })();

  /* ---------------- brief builder ---------------- */
  (function brief() {
    const SERVICES = [
      { id: 'cards', label: 'Карточки под ключ', m: false },
      { id: 'seo', label: 'SEO-тексты', m: false },
      { id: 'infographic', label: 'Инфографика в Figma', m: false },
      { id: 'ads', label: 'Реклама и АРК', m: false },
      { id: 'supply', label: 'Поставки и остатки', m: false },
      { id: 'analysis', label: 'Анализ конкурентов', m: false },
      { id: 'neuro', label: 'Нейровизуал товара', m: true },
      { id: 'session', label: 'Нейрофотосессия', m: true },
      { id: 'animate', label: 'Оживление фото', m: true },
      { id: 'music', label: 'Песня / поздравление', m: true }
    ];
    const picked = new Set(store.get('brief', ['cards', 'neuro']));
    const host = $('#svcPick');
    SERVICES.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick' + (s.m ? ' m' : '');
      b.setAttribute('aria-pressed', picked.has(s.id) ? 'true' : 'false');
      b.innerHTML = '<span class="box"><svg aria-hidden="true"><use href="#i-check"/></svg></span><span></span>';
      b.lastChild.textContent = s.label;
      b.addEventListener('click', () => {
        if (picked.has(s.id)) picked.delete(s.id); else picked.add(s.id);
        b.setAttribute('aria-pressed', picked.has(s.id) ? 'true' : 'false');
        store.set('brief', Array.from(picked));
        render(); sfx.click();
      });
      host.appendChild(b);
    });
    function message() {
      const chosen = SERVICES.filter(s => picked.has(s.id)).map(s => s.label);
      const name = $('#briefName').value.trim();
      const about = $('#briefAbout').value.trim();
      const lines = [
        'Здравствуйте! Пишу с сайта-визитки CARTADGT.',
        name ? 'Меня зовут ' + name + '.' : '',
        '',
        'Что нужно: ' + (chosen.length ? chosen.join(', ') : 'пока не определился — нужна консультация'),
        'Объём: ' + $('#briefVolume').value,
        'Срок: ' + $('#briefDeadline').value
      ];
      if (about) lines.push('', 'О товаре и задаче: ' + about);
      lines.push('', 'Подскажите, пожалуйста, стоимость и ближайшие свободные даты.');
      return lines.filter((l, i) => !(l === '' && lines[i - 1] === '')).join('\n');
    }
    function render() {
      $('#briefPreview').textContent = message();
      const n = picked.size;
      const word = n === 1 ? 'УСЛУГА ВЫБРАНА' : n >= 2 && n <= 4 ? 'УСЛУГИ ВЫБРАНЫ' : 'УСЛУГ ВЫБРАНО';
      $('#briefCount').textContent = n + ' ' + word;
    }
    ['#briefName', '#briefAbout', '#briefVolume', '#briefDeadline'].forEach(sel => {
      $(sel).addEventListener('input', render);
      $(sel).addEventListener('change', render);
    });
    $('#briefCopy').addEventListener('click', () => copyText(message(), 'Бриф скопирован — вставьте его в чат'));
    $('#briefDownload').addEventListener('click', () => download('brief-cartadgt.txt', message()));
    $('#briefSend').addEventListener('click', async () => {
      await copyText(message(), 'Бриф скопирован — вставьте его в чат Telegram');
    });
    $('#copyHandle').addEventListener('click', () => copyText('@Cartadgt', 'Ник @Cartadgt скопирован'));
    $$('[data-quick]').forEach(b => b.addEventListener('click', () => {
      const kind = b.getAttribute('data-quick');
      const msg = kind === 'wb'
        ? 'Здравствуйте! Интересует работа по Wildberries: карточки, SEO, реклама и поставки. Подскажите формат и стоимость ведения.'
        : 'Здравствуйте! Интересует нейровизуал: студийные фото товара, оживление и серия кадров под карточки. Подскажите сроки и стоимость.';
      copyText(msg, 'Сообщение скопировано — вставьте в чат').then(openTelegram);
    }));
    render();
  })();

  /* ---------------- misc ---------------- */
  $('#year').textContent = new Date().getFullYear();
  $$('#faqGrid details').forEach(d => d.addEventListener('toggle', () => { if (d.open) sfx.open(); }));
  onScroll();
  window.addEventListener('load', onScroll);
})();
