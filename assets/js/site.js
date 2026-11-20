/* Эволюция · Ретриты с Мастером — поведение сайта.
   Прошедшие встречи, ранние цены, анкета, кнопка внизу экрана, «поделиться», календарь, высота блока для встраивания. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var parse = function (s) { if (!s) return null; var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var isPast = function (end) { var d = parse(end); return d && d < today; };
  var money = function (v, c) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + c; };

  /* 1. Прошедшие встречи: подпись «Встреча прошла», в конец списка, нет в анкете */
  $$('.ev[data-end]').forEach(function (card) {
    if (!isPast(card.dataset.end)) return;
    card.classList.add('is-past');
    var st = $('[data-status-text]', card);
    if (st) { st.className = 'ev-status st-past'; st.innerHTML = '<span class="dot" aria-hidden="true"></span>Встреча прошла'; }
    var list = card.parentNode; list.appendChild(card);
    var chip = $('[data-chip="' + card.dataset.event + '"]'); if (chip) chip.classList.add('is-past');
  });
  $$('.pick[data-end]').forEach(function (p) { if (isPast(p.dataset.end)) p.classList.add('is-past'); });
  /* 1а. Широкая первая карточка (нечётное число встреч): ей нужно фото побольше.
     После перестановки прошедших встреч или отбора ?show= первой может стать другая карточка. */
  var SIZES_WIDE = '(min-width: 1304px) 1176px, (min-width: 760px) calc(100vw - 64px), 100vw', SIZES_CARD = '(min-width: 1240px) 600px, (min-width: 760px) 50vw, 100vw';
  function syncWide() {
    $$('.events-top [data-ev-list], .embed [data-ev-list]').forEach(function (list) {
      var cards = $$('.ev', list), odd = cards.length % 2 === 1;
      cards.forEach(function (c, i) {
        var im = $('.ev-photo img[srcset]', c), want = odd && i === 0 ? SIZES_WIDE : SIZES_CARD;
        if (im && im.sizes !== want) im.sizes = want;
      });
    });
  }
  syncWide();
  var page = $('[data-event-page]');
  if (page && isPast(page.dataset.end)) {
    $$('.ev-hero [data-status-text]').forEach(function (st) { st.className = 'ev-status st-past'; st.innerHTML = '<span class="dot" aria-hidden="true"></span>Встреча прошла'; });
  }

  /* 2. Ранние цены: текущая ступень по сегодняшней дате */
  $$('[data-price][data-tiers]').forEach(function (el) {
    var tiers; try { tiers = JSON.parse(el.dataset.tiers); } catch (e) { return; }
    tiers.sort(function (a, b) { return a.until < b.until ? -1 : 1; });
    var cur = el.dataset.cur, now = null;
    for (var i = 0; i < tiers.length; i++) { if (!isPast(tiers[i].until)) { now = tiers[i]; break; } }
    var b = $('[data-price-now]', el), note = $('[data-price-note]', el);
    if (now) {
      var d = parse(now.until);
      b.innerHTML = (now.price < +el.dataset.base ? '<s>' + money(el.dataset.base, cur) + '</s>' : '') + money(now.price, cur);
      var days = Math.round((d - today) / 864e5);
      note.textContent = 'при оплате до ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (days <= 60 ? ' · ещё ' + days + ' ' + plural(days, 'день', 'дня', 'дней') : '');
    }
  });
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }

  /* 3. Шапка и кнопка внизу экрана */
  var top = $('[data-top]');
  var sticky = $('[data-sticky]');
  var applyEl = $('#apply');
  var heroEl = $('.events-top, .ev-hero'); // кнопка «Оставить заявку» появляется, когда встречи уже пролистаны
  var heroOut = false, applyIn = false;
  function syncSticky() { if (sticky) sticky.classList.toggle('is-on', heroOut && !applyIn); }
  if ('IntersectionObserver' in window) {
    if (heroEl) new IntersectionObserver(function (en) { heroOut = !en[0].isIntersecting; syncSticky(); }, { rootMargin: '0px 0px -30% 0px' }).observe(heroEl);
    if (applyEl) new IntersectionObserver(function (en) { applyIn = en[0].isIntersecting; syncSticky(); }).observe(applyEl);
    if (sticky) sticky.hidden = false;
  }
  if (top) window.addEventListener('scroll', function () { top.classList.toggle('is-scrolled', window.scrollY > 8); }, { passive: true });

  /* 4. Анкета */
  var form = $('#apply-form');
  if (form) setupForm(form);

  function setupForm(form) {
    var picks = $$('input[name=events]', form);
    var bySlug = function (slug) { return picks.filter(function (i) { return i.dataset.slug === slug; })[0]; };
    var onlineField = $('[data-online-field]', form);
    var contact = $('input[name=contact]', form), contactLabel = $('[data-contact-label]', form);
    var WAYS = {
      'Telegram': { label: 'Ник в Telegram', ph: '@username', type: 'text', mode: 'text', ac: 'off' },
      'Телефон': { label: 'Номер телефона', ph: '+7 900 000-00-00', type: 'tel', mode: 'tel', ac: 'tel' },
      'Почта': { label: 'Адрес почты', ph: 'name@mail.ru', type: 'email', mode: 'email', ac: 'email' },
      'WhatsApp': { label: 'Номер WhatsApp', ph: '+7 900 000-00-00', type: 'tel', mode: 'tel', ac: 'tel' }
    };
    function pick(slug, only) {
      var i = bySlug(slug); if (!i) return;
      if (only) picks.forEach(function (x) { x.checked = false; });
      i.checked = true; syncOnline();
    }
    // Вопрос «очно или онлайн» — только когда выбрана встреча с онлайн-участием (ретриты в Чиралы).
    // Если вместе с ней выбран интенсив, подсказываем, что онлайн относится только к ретриту.
    var modeHint = $('[data-mode-hint]', form);
    function syncOnline() {
      var on = picks.filter(function (i) { return i.checked; });
      var any = on.some(function (i) { return i.closest('.pick').dataset.online === '1'; });
      var mixed = any && on.some(function (i) { return i.closest('.pick').dataset.online !== '1'; });
      if (onlineField) onlineField.hidden = !any;
      if (modeHint) modeHint.hidden = !mixed;
    }
    var evoHint = $('[data-evo-hint]', form);
    function evoOnlyPicked() { return picks.filter(function (i) { return i.checked && i.closest('.pick').dataset.audience === 'evolution'; }); }
    function syncEvo() {
      var no = form.elements.evo && form.elements.evo.value === 'Нет';
      if (evoHint) evoHint.hidden = !(no && evoOnlyPicked().length);
    }
    $$('input[name=evo]', form).forEach(function (r) { r.addEventListener('change', syncEvo); });
    picks.forEach(function (i) { i.addEventListener('change', function () { syncOnline(); syncEvo(); clearErr('events'); }); });
    $$('input[name=way]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        var w = WAYS[r.value] || WAYS.Telegram;
        contactLabel.textContent = w.label; contact.placeholder = w.ph; contact.type = w.type; contact.inputMode = w.mode; contact.autocomplete = w.ac;
      });
    });
    // Встреча уже выбрана: на странице встречи, по ссылке ?event=…, по кнопке «Оставить заявку» на карточке
    if (form.dataset.pick) pick(form.dataset.pick);
    try { var q = new URLSearchParams(location.search).get('event'); if (q) pick(q, true); } catch (e) {}
    $$('[data-pick]').forEach(function (a) {
      if (a === form) return;
      a.addEventListener('click', function () { pick(a.dataset.pick, true); });
    });
    // utm и откуда пришли — сохраняем при первом заходе
    try {
      var sp = new URLSearchParams(location.search), utm = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) { if (sp.get(k)) utm[k] = sp.get(k); });
      if (Object.keys(utm).length) sessionStorage.setItem('evo_utm', JSON.stringify(utm));
      if (!sessionStorage.getItem('evo_ref')) sessionStorage.setItem('evo_ref', document.referrer || '');
    } catch (e) {}

    function err(name, on) {
      var e = $('[data-err=' + name + ']', form); if (e) e.hidden = !on;
      var f = form.elements[name]; if (f && f.closest && f.closest('.field')) f.closest('.field').classList.toggle('is-invalid', on);
    }
    function clearErr(name) { err(name, false); }
    ['name', 'contact'].forEach(function (n) { form.elements[n].addEventListener('input', function () { clearErr(n); }); });

    var status = $('.f-status', form), btn = $('[data-submit]', form);
    function say(html, isErr) { status.hidden = false; status.classList.toggle('is-error', !!isErr); status.innerHTML = html; }

    function collect() {
      var fd = new FormData(form), a = {};
      a.events = picks.filter(function (i) { return i.checked; }).map(function (i) { return i.value; }).join('; ');
      ['name', 'way', 'contact', 'evo', 'before', 'source', 'comment'].forEach(function (k) { a[k] = (fd.get(k) || '').toString().trim(); });
      a.mode = onlineField && !onlineField.hidden ? (fd.get('mode') || '') : '';
      a.plus1 = fd.get('plus1') ? 'Да' : '';
      a.evo_only = evoOnlyPicked().map(function (i) { return i.value; }).join('; '); // ретриты «для выпускников Эволюции» — бот подскажет Наталье
      return a;
    }
    function fallbackHtml(a, lead) {
      var c = window.EVO_CONTACTS || {};
      var text = 'Здравствуйте! Хочу на встречу с Мастером: ' + a.events + '. Меня зовут ' + a.name + ', связаться: ' + a.way + ' ' + a.contact + (a.evo === 'Да' ? '. Проходил(а) Эволюцию' : '') + (a.plus1 ? '. Приеду с +1' : '') + (a.comment ? '. ' + a.comment : '');
      var mail = 'mailto:' + (c.email || '') + '?subject=' + encodeURIComponent('Заявка: ' + a.events) + '&body=' + encodeURIComponent(text);
      return '<p>' + lead + '</p><p><a href="https://t.me/' + (c.telegram || '') + '" target="_blank" rel="noopener">Написать в Telegram @' + (c.telegram || '') + '</a> · <a href="' + mail + '">Отправить письмом</a></p>';
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var a = collect(), bad = false;
      if (!a.events) { err('events', true); bad = true; }
      if (!a.name) { err('name', true); bad = true; }
      if (!a.contact) { err('contact', true); bad = true; }
      if (bad) { var first = $('.f-err:not([hidden])', form); if (first) first.closest('fieldset, .field').scrollIntoView({ block: 'center' }); return; }
      if (form.elements.website.value) return; // спам-ловушка
      var endpoint = form.dataset.endpoint;

      if (!endpoint) {
        say(fallbackHtml(a, 'Это черновик сайта: заявки отсюда пока не отправляются. Чтобы записаться, напишите организатору — текст заявки уже готов:'), false);
        return;
      }
      btn.disabled = true; btn.textContent = 'Отправляем…'; status.hidden = true;
      var meta = { page: location.href, ref: sessionStorage.getItem('evo_ref') || '', utm: sessionStorage.getItem('evo_utm') || '', ua: navigator.userAgent };
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ answers: a, meta: meta, website: '' }), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          clearTimeout(timer);
          if (!res || !res.ok) throw new Error('not ok');
          form.hidden = true;
          var done = $('#apply-done'); done.hidden = false; done.focus(); done.scrollIntoView({ block: 'start' });
        })
        .catch(function () {
          clearTimeout(timer);
          btn.disabled = false; btn.textContent = 'Отправить ещё раз';
          say(fallbackHtml(a, 'Не получилось отправить заявку — возможно, пропал интернет. Ваши ответы сохранены на странице: попробуйте ещё раз или напишите организатору напрямую:'), true);
        });
    });
  }

  /* 5. Поделиться: на телефоне — системное меню, иначе — копировать ссылку */
  $$('[data-share]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = location.href.split('#')[0].split('?')[0];
      if (navigator.share) { navigator.share({ title: b.dataset.shareTitle, text: b.dataset.shareText, url: url }).catch(function () {}); return; }
      var done = function () { var t = b.textContent; b.textContent = 'Ссылка скопирована'; setTimeout(function () { b.textContent = t; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('Скопируйте ссылку:', url); });
      else prompt('Скопируйте ссылку:', url);
    });
  });

  /* 6. Календарь одной встречи (Apple, Outlook) */
  $$('[data-ics]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      var d = a.dataset, esc = function (s) { return String(s).replace(/([,;\\])/g, '\\$1'); };
      var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Evolution//Master//RU', 'BEGIN:VEVENT', 'UID:' + d.slug + '@evolution-master',
        'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z', 'DTSTART;VALUE=DATE:' + d.start, 'DTEND;VALUE=DATE:' + d.end,
        'SUMMARY:' + esc(d.title), 'LOCATION:' + esc(d.place), 'URL:' + location.href.split('#')[0], 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = d.slug + '.ics';
      document.body.appendChild(link); link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
    });
  });

  /* 7а. Коллаж: видео подгружаются и играют, только когда видны на экране (экономит трафик и батарею) */
  var vids = $$('video[data-src]');
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (vids.length && !calm && 'IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        var v = x.target;
        if (x.isIntersecting) {
          if (!v.getAttribute('src')) v.src = v.dataset.src;
          var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
        } else if (!v.paused) v.pause();
      });
    }, { rootMargin: '120px 0px', threshold: 0.2 });
    vids.forEach(function (v) { vio.observe(v); });
  }

  /* 7. Блок для встраивания: ?show=slug,slug · ?title=0 · сообщаем высоту родительской странице */
  var embed = $('[data-embed]');
  if (embed) {
    try {
      var sp2 = new URLSearchParams(location.search), show = sp2.get('show');
      if (show) { var keep = show.split(','); $$('.ev', embed).forEach(function (c) { if (keep.indexOf(c.dataset.event) < 0) c.remove(); }); }
      if (sp2.get('title') === '0') $('[data-embed-title]', embed).remove();
    } catch (e) {}
    syncWide();
    var post = function () { try { parent.postMessage({ evoEmbedHeight: Math.ceil(document.documentElement.scrollHeight) }, '*'); } catch (e) {} };
    window.addEventListener('load', post); window.addEventListener('resize', post);
    if ('ResizeObserver' in window) new ResizeObserver(post).observe(embed);
    post();
  }

  /* 8. Переключатель «Ретрит / Интенсив» в блоке «Как проходит практика».
     Кнопки — вкладки: клик или стрелки влево-вправо. Показана одна карточка, вторая скрыта. */
  $$('[data-tabs]').forEach(function (box) {
    var list = $('[role="tablist"]', box), tabs = $$('[role="tab"]', box);
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    if (!list || tabs.length < 2 || panels.indexOf(null) >= 0) return;
    function select(i, byUser, focus) {
      tabs.forEach(function (t, k) {
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
        t.tabIndex = k === i ? 0 : -1;
        panels[k].classList.toggle('is-in', !!byUser && k === i && panels[k].hidden); /* плавное появление — только при переключении */
        panels[k].hidden = k !== i;
      });
      if (focus) tabs[i].focus();
    }
    panels.forEach(function (p, k) { p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', tabs[k].id); });
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i, true); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (n === null) return;
        e.preventDefault(); select((n + tabs.length) % tabs.length, true, true);
      });
    });
    list.hidden = false; box.classList.add('tabs-on'); select(0);
  });
})();
