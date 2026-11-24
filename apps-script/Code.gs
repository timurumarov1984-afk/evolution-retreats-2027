/**
 * Приёмник заявок сайта «Эволюция · Ретриты с Мастером 2027» (Google Apps Script).
 * Ставится один раз, около 15 минут. Инструкция — apps-script/README.md.
 *
 * Что делает с каждой заявкой:
 *  1. записывает строку в Google-таблицу (лист «Заявки», столбец «Статус» — для отметок организатора);
 *  2. сразу присылает заявку в Telegram — Наталье и Изольде (каждой лично, от бота);
 *     в сообщении — сколько всего заявок на эту встречу и с какой стороны люди: Эволюция, ученики Мастера, новые;
 *  3. дублирует заявку письмом;
 *  4. сообщает сайту настоящий результат: «Спасибо» человек видит, только когда заявка сохранена.
 *
 * Итоги: каждый вечер в 20:00 (если были заявки) и в понедельник утром — сколько человек записалось на каждую встречу.
 * В любой момент: написать боту «итоги» (или нажать /itogi в меню бота).
 *
 * Таблица файлом Excel: написать боту «таблица» (или нажать /excel) — бот пришлёт все заявки одним файлом .xlsx.
 * Тот же файл приходит сам каждый понедельник: в Telegram и на почту.
 */

/* ======================= НАСТРОЙКИ: заполнить один раз ======================= */
var CONFIG = {
  // Таблица для заявок. Можно оставить пустым: при запуске setup скрипт сам создаст таблицу «Заявки — …»
  // на Google Диске этой почты и запомнит её. Если нужна своя таблица — вставьте её адрес из строки браузера.
  SHEET_URL: '',
  // Куда дублировать заявки письмом (можно несколько через запятую). Пусто — без писем.
  NOTIFY_EMAIL: 'nebazhenova@gmail.com, aks@evolution.place',
  // Название — в письмах и сообщениях
  TITLE: 'Ретриты с Мастером 2027',
  // Бот заявок — свой у Эволюции (@evolution_retreats_bot), отдельный от бота Мастера @master_retreats_bot
  // Адрес сайта — бот даст его тем, кто напишет ему случайно
  SITE_URL: 'https://evolution.retreatmaster.online/',

  // Telegram-бот: токен от @BotFather (выглядит как 1234567890:AAH…)
  TELEGRAM_TOKEN: '',
  // Кому бот присылает заявки — ники в Telegram без @. Каждый один раз открывает бота и нажимает «Начать».
  // Остальным бот заявки не покажет, даже если они его найдут.
  TELEGRAM_PEOPLE: ['nebazhenova', 'izoldaumarova'],

  // Итоги дня — во сколько (по Москве)
  SUMMARY_HOUR: 20,
  TIMEZONE: 'Europe/Moscow',

  SHEET_NAME: 'Заявки',
  STATUSES: ['Новая', 'Связались', 'Оплатил', 'Отказ'],

  // Встречи года. У каждой в таблице своя колонка: в строке человека его имя стоит там, куда он записался.
  // Названия — в точности как в анкете на сайте, по порядку дат. Если на сайте появится новая встреча,
  // её колонка добавится сама, в конце таблицы, с первой же заявкой.
  EVENTS: [
    'Интенсив в Стамбуле · 29–31 января 2027',
    'Ретрит в Чиралы · 6–14 марта 2027',
    'Интенсив в Стамбуле · 6–8 августа 2027',
    'Интенсив в Ясно Поле · 10–12 сентября 2027',
    'Ретрит в Чиралы · 31 октября – 8 ноября 2027'
  ],
  MARK: '✓'   // что поставить в колонку встречи, если человек не назвал имя
};
/* ============================================================================ */

/* Столбцы таблицы: «Когда», «Имя», дальше — по колонке на каждую встречу (CONFIG.EVENTS), дальше остальные ответы анкеты */
var COLUMNS_HEAD = [['time', 'Когда'], ['name', 'Имя']];
var COLUMNS_TAIL = [
  ['way', 'Как связаться'], ['contact', 'Контакт'],
  ['side', 'Откуда человек'], ['evo', 'Проходил Эволюцию'], ['before', 'Был у Мастера'], ['mode', 'Очно или онлайн'],
  ['plus1', '+1'], ['source', 'Откуда узнал'], ['comment', 'Комментарий'], ['status', 'Статус'],
  ['utm', 'Метки (utm)'], ['ref', 'Пришёл с'], ['page', 'Страница']
];
var COLUMNS = COLUMNS_HEAD.concat(COLUMNS_TAIL);
var SIDES = ['Эволюция', 'Мастер', 'Новые'];

/* ------------------------------ заявка с сайта ------------------------------ */
function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  if (data.website) return json_({ ok: true }); // спам-ловушка: люди это поле не видят

  var a = data.answers || {}, m = data.meta || {};
  var row = { time: new Date(), utm: m.utm || '', ref: m.ref || '', page: m.page || '', status: CONFIG.STATUSES[0] };
  Object.keys(a).forEach(function (k) { row[k] = String(a[k] || '').slice(0, 2000); });
  row.side = side_(row);

  var saved = false, told = false, mailed = false, note = '';
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    appendRow_(row);
    saved = true;
  } catch (err) {
    note = 'В таблицу заявка не попала: ' + err;
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }

  try { told = telegramAll_(applicationText_(row, saved, note)) > 0; } catch (err) { note += ' · Telegram: ' + err; }
  try { mailed = mail_(row, saved, note); } catch (err) { /* письмо не ушло */ }

  // Заявка не потеряна, если она есть в таблице, в Telegram или в письме
  return json_({ ok: saved || told || mailed });
}

function doGet() { return json_({ ok: true, service: 'evolution-master-applications' }); }

/* Откуда человек: Эволюция, ученики Мастера или новые. Первое — что человек сам ответил в анкете, потом метка ссылки. */
function side_(r) {
  var utm = String(r.utm || '').toLowerCase(), src = String(r.source || '');
  if (r.evo === 'Да' || /evolution|evo/.test(utm) || /Эволюц/.test(src)) return 'Эволюция';
  if (r.before === 'Да' || /master|мастер/.test(utm) || /Мастер/.test(src)) return 'Мастер';
  return 'Новые';
}

/* ------------------------------ таблица ------------------------------ */
/* Таблица заявок: своя (адрес в настройках) или созданная скриптом при первом запуске — её номер запомнен в свойствах скрипта */
function book_() {
  if (/\/d\/[A-Za-z0-9_-]{20,}/.test(CONFIG.SHEET_URL)) return SpreadsheetApp.openByUrl(CONFIG.SHEET_URL);
  var id = props_().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('Заявки — ' + CONFIG.TITLE);
  props_().setProperty('SHEET_ID', ss.getId());
  try { ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE); ss.getSheets()[0].setName(CONFIG.SHEET_NAME); } catch (err) { /* останется пустой первый лист — не страшно */ }
  return ss;
}
function bookUrl_() { try { return book_().getUrl(); } catch (err) { return ''; } }

/* Название встречи в одном виде: без неразрывных и двойных пробелов */
function norm_(s) { return String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim(); }
function splitEvents_(s) { return String(s || '').split(';').map(norm_).filter(String); }
function fieldTitles_() { return COLUMNS.map(function (c) { return c[1]; }); }
/* Колонка встречи — та, что не поле анкеты и названа как на сайте: «Название · даты» */
function isEventCol_(h) { return h.indexOf(' · ') > 0 && fieldTitles_().indexOf(h) < 0; }
function head_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_); }

function sheet_() {
  var ss = book_();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) { // в новой пустой таблице один пустой лист — берём его, а не добавляем второй
    try { var all = ss.getSheets(); if (all.length === 1 && all[0].getLastRow() === 0) sh = all[0].setName(CONFIG.SHEET_NAME); } catch (err) { sh = null; }
    if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  if (sh.getLastRow() === 0) {
    var events = CONFIG.EVENTS.map(norm_);
    var head = COLUMNS_HEAD.map(function (c) { return c[1]; }).concat(events, COLUMNS_TAIL.map(function (c) { return c[1]; }));
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUSES, true).setAllowInvalid(false).build();
    sh.getRange(2, head.indexOf('Статус') + 1, 2000, 1).setDataValidation(rule);
    try { // оформление: имя всегда на виду, названия встреч в шапке переносятся
      sh.setFrozenColumns(COLUMNS_HEAD.length);
      sh.getRange(1, 1, 1, head.length).setWrap(true).setVerticalAlignment('middle');
      for (var i = 0; i < events.length; i++) sh.setColumnWidth(COLUMNS_HEAD.length + 1 + i, 160);
    } catch (err) { /* без оформления таблица тоже работает */ }
  }
  return sh;
}

/* Записать заявку строкой: ответы анкеты — в свои столбцы, имя человека — в колонку каждой выбранной встречи */
function appendRow_(row) {
  var sh = sheet_(), head = head_(sh), evs = splitEvents_(row.events);
  evs.forEach(function (ev) {
    if (head.indexOf(ev) >= 0) return;
    sh.getRange(1, head.length + 1).setValue(ev).setFontWeight('bold'); // новая встреча на сайте — новая колонка в конце
    head.push(ev);
  });
  var key = {}; COLUMNS.forEach(function (c) { key[c[1]] = c[0]; });
  sh.appendRow(head.map(function (h) {
    if (key[h]) return row[key[h]] || '';
    return evs.indexOf(h) >= 0 ? (norm_(row.name) || CONFIG.MARK) : '';
  }));
}

/* Все заявки из таблицы: [{events:[...], side, status, contact, name, time}] — без тестовых («ТЕСТ» в имени).
   Встречи человека — колонки встреч, где в его строке что-то стоит (имя или любая пометка). Вписать или стереть можно руками: итоги это учтут. */
function rows_() {
  var sh = sheet_(), n = sh.getLastRow();
  if (n < 2) return [];
  var head = head_(sh);
  var idx = {}; COLUMNS.forEach(function (c) { idx[c[0]] = head.indexOf(c[1]); });
  var evCols = []; head.forEach(function (h, i) { if (isEventCol_(h)) evCols.push(i); });
  return sh.getRange(2, 1, n - 1, head.length).getValues().map(function (v) {
    var g = function (k) { return idx[k] >= 0 ? v[idx[k]] : ''; };
    return {
      time: g('time'), name: String(g('name')), contact: String(g('contact')).trim().toLowerCase(),
      events: evCols.filter(function (i) { var x = String(v[i]).trim(); return x !== '' && !/^(false|нет|-)$/i.test(x); }).map(function (i) { return head[i]; }),
      side: String(g('side')) || side_({ evo: g('evo'), before: g('before'), utm: g('utm'), source: g('source') }),
      status: String(g('status'))
    };
  }).filter(function (r) { return r.events.length && !/^тест/i.test(r.name.trim()); });
}

/* Сколько заявок на каждую встречу: { «Ретрит в Чиралы · 6–14 марта 2027»: {total, Эволюция, Мастер, Новые, paid} } */
function tally_(rows) {
  var t = {};
  rows.forEach(function (r) {
    r.events.forEach(function (ev) {
      var x = t[ev] || (t[ev] = { total: 0, paid: 0, 'Эволюция': 0, 'Мастер': 0, 'Новые': 0 });
      x.total++; x[r.side] = (x[r.side] || 0) + 1;
      if (r.status === 'Оплатил') x.paid++;
    });
  });
  return t;
}

/* ------------------------------ тексты сообщений ------------------------------ */
function plural_(n, a, b, c) { var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function contactHtml_(way, contact) {
  var c = String(contact || '').trim();
  if (way === 'Telegram') {
    var u = c.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
    if (/^[A-Za-z0-9_]{4,}$/.test(u)) return 'Telegram <a href="https://t.me/' + u + '">@' + u + '</a>';
  }
  if (way === 'WhatsApp') {
    var d = c.replace(/\D/g, '');
    if (d.length >= 10) return 'WhatsApp <a href="https://wa.me/' + d + '">' + esc_(c) + '</a>';
  }
  return esc_(way ? way + ' ' + c : c);
}

function sideLine_(x) {
  return SIDES.filter(function (s) { return x[s]; }).map(function (s) { return (s === 'Мастер' ? 'от Мастера' : s === 'Новые' ? 'новые' : s) + ' ' + x[s]; }).join(' · ');
}

function applicationText_(r, saved, note) {
  var lines = [];
  lines.push('<b>Новая заявка</b> · ' + (r.side === 'Мастер' ? 'от Мастера' : r.side === 'Новые' ? 'новый человек' : 'Эволюция'));
  splitEvents_(r.events).forEach(function (ev) { lines.push('<b>' + esc_(ev) + '</b>'); });
  lines.push('');
  lines.push(esc_(r.name));
  lines.push(contactHtml_(r.way, r.contact));
  var facts = [];
  if (r.mode) facts.push(esc_(r.mode).toLowerCase());
  if (r.plus1) facts.push('приедет с +1');
  if (r.evo === 'Да') facts.push('проходил(а) Эволюцию');
  if (r.before === 'Да') facts.push('уже был(а) у Мастера');
  if (r.before === 'Буду впервые' || r.before === 'Будет впервые') facts.push('у Мастера впервые');
  if (facts.length) lines.push(facts.join(' · '));
  if (r.evo_only && r.evo !== 'Да') lines.push('⚠ Не отметил(а), что проходил(а) Эволюцию, а ретрит — для выпускников. Стоит поговорить лично: может, лучше начать с интенсива.');
  if (r.source) lines.push('Откуда узнал(а): ' + esc_(r.source));
  if (r.comment) lines.push('«' + esc_(r.comment) + '»');

  if (saved) {
    try {
      var t = tally_(rows_());
      lines.push('');
      splitEvents_(r.events).forEach(function (ev) {
        var x = t[ev]; if (!x) return;
        lines.push('Всего на «' + esc_(shortEvent_(ev)) + '»: <b>' + x.total + '</b>' + (sideLine_(x) ? ' (' + sideLine_(x) + ')' : ''));
      });
    } catch (err) { /* без итогов */ }
    var url = bookUrl_();   // заявка уже в таблице — ссылка, чтобы открыть её в один тап
    if (url) lines.push('<a href="' + esc_(url) + '">Открыть таблицу заявок</a>');
  } else {
    lines.push('');
    lines.push('⚠ ' + esc_(note || 'В таблицу заявка не попала — сохраните её из этого сообщения.'));
  }
  return lines.join('\n');
}

/* «Ретрит в Чиралы · 6–14 марта 2027» → «Ретрит в Чиралы, 6–14 марта» */
function shortEvent_(ev) {
  var p = String(ev).split(' · ');
  return p[0] + (p[1] ? ', ' + p[1].replace(/\s*\d{4}\s*$/, '') : '');
}

var MONTHS_ = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/* Ключ сортировки по дате встречи из подписи «… · 29–31 января 2027» */
function eventOrder_(ev) {
  var d = String(ev).split(' · ')[1] || '';
  var y = (d.match(/(\d{4})\s*$/) || [0, 9999])[1];
  var day = (d.match(/^(\d{1,2})/) || [0, 0])[1];
  var mi = 99; for (var i = 0; i < MONTHS_.length; i++) { var k = d.indexOf(MONTHS_[i]); if (k >= 0 && (mi === 99 || k < d.indexOf(MONTHS_[mi]))) mi = i; }
  return y * 10000 + (mi + 1) * 100 + (+day);
}

function summaryText_(title) {
  var rows = rows_(), t = tally_(rows);
  var today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  var fresh = rows.filter(function (r) { return r.time && Utilities.formatDate(new Date(r.time), CONFIG.TIMEZONE, 'yyyy-MM-dd') === today; }).length;
  var people = {}; rows.forEach(function (r) { people[r.contact || r.name] = 1; });
  var keys = Object.keys(t).sort(function (a, b) { return eventOrder_(a) - eventOrder_(b); });
  var lines = ['<b>' + esc_(title || 'Итоги') + ' · ' + esc_(CONFIG.TITLE) + '</b>'];
  if (title === 'Итоги дня') lines.push('Новых заявок сегодня: <b>' + fresh + '</b>');
  lines.push('');
  if (!keys.length) lines.push('Заявок пока нет.');
  keys.forEach(function (ev) {
    var x = t[ev];
    lines.push('<b>' + esc_(ev) + '</b> — ' + x.total);
    var sub = sideLine_(x) + (x.paid ? ' · оплатили ' + x.paid : '');
    if (sub) lines.push('   ' + sub);
  });
  if (keys.length) { var np = Object.keys(people).length; lines.push(''); lines.push('Всего: ' + rows.length + ' ' + plural_(rows.length, 'заявка', 'заявки', 'заявок') + ', ' + np + ' ' + plural_(np, 'человек', 'человека', 'человек')); }
  return { text: lines.join('\n'), fresh: fresh };
}

/* ------------------------------ Telegram ------------------------------ */
function tg_(method, payload) {
  if (!CONFIG.TELEGRAM_TOKEN) throw new Error('не указан TELEGRAM_TOKEN');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_TOKEN + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}
function props_() { return PropertiesService.getScriptProperties(); }
function chats_() { try { return JSON.parse(props_().getProperty('TG_CHATS') || '{}'); } catch (e) { return {}; } }
function allowed_() { return CONFIG.TELEGRAM_PEOPLE.map(function (u) { return String(u).replace(/^@/, '').toLowerCase(); }); }

function telegram_(chatId, text) {
  var r = tg_('sendMessage', { chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true });
  return r && r.ok;
}
/* Отправить всем подключённым; вернуть, скольким дошло */
function telegramAll_(text) {
  if (!CONFIG.TELEGRAM_TOKEN) return 0;
  var chats = chats_(), n = 0;
  Object.keys(chats).forEach(function (u) { if (telegram_(chats[u], text)) n++; });
  return n;
}

/* ------------------------------ таблица файлом Excel ------------------------------ */
/* Вся таблица заявок одним файлом .xlsx — то же, что «Файл → Скачать → Microsoft Excel» в Google Таблицах */
function excelBlob_() {
  var ss = book_();
  SpreadsheetApp.flush();
  DriveApp.getFileById(ss.getId()); // с этой строкой Google разрешает скрипту скачивать таблицу файлом
  var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Google не отдал файл (код ' + res.getResponseCode() + ')');
  // Имя файла латиницей: русские буквы в имени Telegram может получить испорченными
  return res.getBlob()
    .setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .setName('Zayavki_' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MM-yyyy') + '.xlsx');
}

/* Подпись к файлу: на какой момент и сколько заявок (без тестовых) */
function excelCaption_() {
  var n = rows_().length;
  return 'Таблица заявок · ' + CONFIG.TITLE + '\n' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd.MM.yyyy, HH:mm') + ' · ' + n + ' ' + plural_(n, 'заявка', 'заявки', 'заявок');
}

function telegramFile_(chatId, blob, caption) {
  if (!CONFIG.TELEGRAM_TOKEN) throw new Error('не указан TELEGRAM_TOKEN');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_TOKEN + '/sendDocument', {
    method: 'post', payload: { chat_id: String(chatId), caption: caption || '', document: blob }, muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()).ok === true; } catch (err) { return false; }
}
/* Отправить файл всем подключённым; вернуть, скольким дошло */
function telegramFileAll_(blob, caption) {
  if (!CONFIG.TELEGRAM_TOKEN) return 0;
  var chats = chats_(), n = 0;
  Object.keys(chats).forEach(function (u) { if (telegramFile_(chats[u], blob, caption)) n++; });
  return n;
}

/* Раз в 5 минут: кто нажал «Начать» — подключить; кто написал «итоги» или «таблица» — ответить. */
function checkBot() {
  if (!CONFIG.TELEGRAM_TOKEN) return;
  var offset = +(props_().getProperty('TG_OFFSET') || 0);
  var r = tg_('getUpdates', { offset: offset, timeout: 0, allowed_updates: ['message'] });
  if (!r.ok) throw new Error('Telegram: ' + r.description);
  var chats = chats_(), allow = allowed_(), changed = false;
  (r.result || []).forEach(function (u) {
    offset = Math.max(offset, u.update_id + 1);
    var m = u.message; if (!m || !m.chat || m.chat.type !== 'private' || !m.from) return;
    var who = String(m.from.username || '').toLowerCase(), text = String(m.text || '').trim().toLowerCase();
    if (allow.indexOf(who) < 0) {
      telegram_(m.chat.id, 'Здравствуйте! Этот бот присылает заявки организаторам.\nЧтобы записаться на встречу с Мастером, ' + (CONFIG.SITE_URL ? 'оставьте заявку на сайте: ' + esc_(CONFIG.SITE_URL) + '\nили ' : '') + 'напишите Наталье: @nebazhenova');
      return;
    }
    if (chats[who] !== m.chat.id) {
      chats[who] = m.chat.id; changed = true;
      telegram_(m.chat.id, 'Готово! Сюда будут приходить заявки с сайта «' + esc_(CONFIG.TITLE) + '».\nНапишите «итоги» — пришлю, сколько человек записалось на каждую встречу.\nНапишите «таблица» — пришлю все заявки файлом Excel.');
    }
    if (/^\/?(itogi|итоги|stats)(?=$|\s|@)/.test(text)) telegram_(m.chat.id, summaryText_('Итоги').text);
    if (/^\/?(excel|xlsx|эксель|ексель|таблица|таблицу|файл)(?=$|\s|@)/.test(text)) {
      try {
        if (!telegramFile_(m.chat.id, excelBlob_(), excelCaption_())) telegram_(m.chat.id, 'Файл собран, но Telegram его не принял. Попробуйте ещё раз через несколько минут.');
      } catch (err) {
        telegram_(m.chat.id, 'Не получилось собрать таблицу файлом: ' + esc_(err) + '\nСама таблица на месте: ' + esc_(bookUrl_()));
      }
    }
  });
  if (changed) props_().setProperty('TG_CHATS', JSON.stringify(chats));
  props_().setProperty('TG_OFFSET', String(offset));
}

/* Каждый вечер: итоги дня — только если сегодня были заявки */
function dailySummary() {
  var s = summaryText_('Итоги дня');
  if (s.fresh > 0) telegramAll_(s.text);
}
/* Понедельник утром: итоги недели — всегда; следом вся таблица файлом Excel — в Telegram и на почту */
function weeklySummary() {
  telegramAll_(summaryText_('Итоги на понедельник').text);
  try {
    var blob = excelBlob_(), caption = excelCaption_();
    telegramFileAll_(blob, caption);
    if (CONFIG.NOTIFY_EMAIL) MailApp.sendEmail({
      to: CONFIG.NOTIFY_EMAIL, subject: 'Таблица заявок · ' + CONFIG.TITLE,
      body: caption + '\n\nВсе заявки — в приложенном файле, он открывается в Excel.', attachments: [blob]
    });
  } catch (err) {
    telegramAll_('⚠ Таблицу файлом Excel собрать не получилось: ' + esc_(err));
  }
}

/* ------------------------------ письмо ------------------------------ */
function mail_(r, saved, note) {
  if (!CONFIG.NOTIFY_EMAIL) return false;
  var body = ['Встречи: ' + (r.events || '')].concat(COLUMNS.filter(function (c) { return c[0] !== 'time' && c[0] !== 'status' && r[c[0]]; })
    .map(function (c) { return c[1] + ': ' + r[c[0]]; })).join('\n');
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: (saved ? '' : '⚠ НЕ В ТАБЛИЦЕ · ') + 'Заявка · ' + CONFIG.TITLE + ' · ' + (r.name || '') + ' · ' + (r.events || ''),
    body: body + '\n\n' + (saved ? 'Строка добавлена в таблицу.' : (note || 'В таблицу заявка не попала — сохраните её из этого письма.'))
  });
  return true;
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ======================= ЗАПУСТИТЬ ОДИН РАЗ: setup ======================= */
/**
 * Выполните setup из редактора (кнопка «Выполнить»). Google попросит разрешения — разрешите.
 *  - создаст таблицу заявок (если её адрес не вписан в настройки), лист «Заявки» и столбец «Статус» с выбором из списка;
 *    адрес таблицы будет внизу, в журнале выполнения;
 *  - включит расписание: проверка бота раз в 5 минут, итоги дня в 20:00, итоги недели в понедельник в 10:00;
 *  - добавит в меню бота команду /itogi;
 *  - подключит тех, кто уже нажал «Начать» в боте, и пришлёт им тестовое сообщение.
 * Кто нажмёт «Начать» позже — подключится сам в течение 5 минут.
 */
function setup() {
  sheet_();
  Logger.log('Таблица заявок: ' + bookUrl_());
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['checkBot', 'dailySummary', 'weeklySummary'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkBot').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('dailySummary').timeBased().atHour(CONFIG.SUMMARY_HOUR).everyDays(1).inTimezone(CONFIG.TIMEZONE).create();
  ScriptApp.newTrigger('weeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(10).inTimezone(CONFIG.TIMEZONE).create();
  if (CONFIG.TELEGRAM_TOKEN) {
    tg_('setMyCommands', { commands: [
      { command: 'itogi', description: 'Сколько человек записалось на каждую встречу' },
      { command: 'excel', description: 'Все заявки файлом Excel' }
    ] });
    checkBot();
    var chats = chats_(), missing = allowed_().filter(function (u) { return !chats[u]; });
    telegramAll_('Проверка связи: бот заявок «' + esc_(CONFIG.TITLE) + '» подключён.');
    Logger.log('Telegram подключены: ' + (Object.keys(chats).join(', ') || 'никто') + (missing.length ? '. Ещё не нажали «Начать» в боте: ' + missing.join(', ') : ''));
  } else {
    Logger.log('TELEGRAM_TOKEN пустой — заявки будут только в таблице и в письмах.');
  }
}

/** Пробная заявка на первую встречу года — проверить таблицу, Telegram и письмо. В итоги не попадает (имя начинается с «ТЕСТ»). */
function test() {
  var r = doPost({ postData: { contents: JSON.stringify({
    answers: { events: CONFIG.EVENTS[0], name: 'ТЕСТ Проверка', way: 'Telegram', contact: '@nebazhenova', evo: 'Да', before: 'Да', mode: 'Очно', comment: 'Это пробная заявка' },
    meta: { page: 'test', utm: '' }
  }) } });
  Logger.log(r.getContent());
}

/** Пробная выгрузка — всем подключённым придёт таблица заявок файлом Excel. */
function testExcel() {
  Logger.log('Файл Excel получили: ' + telegramFileAll_(excelBlob_(), excelCaption_()));
}
