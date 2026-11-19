/**
 * Hirata Cleaning Plan - views/magazines.js
 * Magazine cleaning and repair (PLAN.md 13f): one row per magazine with its
 * last check, a Repair needed flag and a "check due" reminder. Anyone logs a
 * check or a finished repair with their name; the Admin adds or archives magazines.
 */
window.HCP = window.HCP || {};
window.HCP.views = window.HCP.views || {};
window.HCP.views.magazines = (function () {
  'use strict';

  var R = window.HCP.rules, S = window.HCP.store, U = window.HCP.ui, h = U.h, I = window.HCP.icon;
  var filter = 'all';
  var mode = 'list';       // 'list' | 'week'
  var week = null;
  var onlyDue = true;
  var drag = null;
  var query = '';
  var PILL = { repair: ['s-overdue', 'Repair needed'], never: ['s-projected', 'Never checked'], due: ['s-postponed', 'Check due'], ok: ['s-done', 'OK'] };
  var MED = { repair: ['m-overdue', 'wrench'], never: ['m-projected', 'dashed'], due: ['m-postponed', 'clock'], ok: ['m-done', 'check'] };

  function med(st, px) {
    return h('span', { class: 'med ' + MED[st][0], style: 'width:' + px + 'px;height:' + px + 'px' }, I(MED[st][1], Math.round(px * 0.6)));
  }
  function dd(d) { return d ? R.dayName(d).slice(0, 3) + ' ' + R.shortDate(d) : '–'; }
  function ago(d, today) {
    if (!d) return '';
    var n = R.diffDays(d, today);
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago';
  }

  function tile(key, st, label, value, sub, app) {
    return h('button', { class: 'tile' + (filter === key ? ' on' : '') + (value ? '' : ' zero'), title: 'Show only these',
      onclick: function () { filter = filter === key ? 'all' : key; app.render(); } }, [
      h('span', { class: 'tile-ico' }, st === 'all' ? h('span', { class: 'med m-upcoming', style: 'width:38px;height:38px' }, I('magazine', 22)) : med(st, 38)),
      h('span', { class: 'tile-num', text: String(value) }),
      h('span', { class: 'tile-label', text: label }),
      sub ? h('span', { class: 'tile-sub', text: sub }) : null
    ]);
  }

  function modeSwitch(app) {
    return h('div', { class: 'segmented' }, [['list', 'List'], ['week', 'Week plan']].map(function (o) {
      return h('button', { class: mode === o[0] ? 'on' : '', text: o[1], onclick: function () { mode = o[0]; app.render(); } });
    }));
  }

  function render(root, app) {
    if (mode === 'week') return renderWeek(root, app);
    var today = R.today();
    var weeks = S.magCheckWeeks();
    var all = S.magazines(false);
    var c = { repair: 0, due: 0, never: 0, ok: 0 };
    all.forEach(function (m) { c[m.status]++; });
    var thisWeek = all.filter(function (m) { return m.last_check && m.last_check >= R.mondayOf(today); }).length;

    var q = query.trim().toUpperCase();
    var list = all.filter(function (m) {
      if (filter === 'repair' && m.status !== 'repair') return false;
      if (filter === 'due' && m.status !== 'due' && m.status !== 'never') return false;
      if (filter === 'ok' && m.status !== 'ok') return false;
      if (filter === 'prod' && !/^yes/i.test(m.prod_use)) return false;
      if (q && (m.sn + ' ' + m.cr_type + ' ' + m.location + ' ' + m.lot_status).toUpperCase().indexOf(q) < 0) return false;
      return true;
    });
    // repairs first, then never/due, then OK (within: Excel order)
    var rank = { repair: 0, never: 1, due: 2, ok: 3 };
    list.sort(function (a, b) { return rank[a.status] - rank[b.status]; });

    var search = h('input', { type: 'search', class: 'mag-search', placeholder: 'Search S/N, CR type, location, lot…', value: query });
    search.addEventListener('input', function () {
      query = search.value;
      var pos = search.selectionStart;
      app.render();
      var s2 = document.querySelector('.mag-search');
      if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
    });

    var bar = h('div', { class: 'board-bar' }, [
      h('div', { class: 'week-title' }, [
        h('div', { class: 'week-kicker', text: 'Magazines · cleaning and repair' }),
        h('h2', { class: 'week-label' }, [h('span', { class: 'wk', text: all.length + ' magazines' }), h('span', { class: 'sep', text: ' · ' }),
          weeks ? 'check every ' + weeks + ' week' + (weeks === 1 ? '' : 's') : 'no check reminder'])
      ]),
      h('div', { class: 'bar-right' }, [modeSwitch(app), h('label', { class: 'search-wrap' }, [I('search', 16), search]),
        h('button', { class: 'btn ghost', title: 'Print the list', onclick: function () { window.print(); } }, [I('printer', 15), ' Print'])])
    ]);

    var strip = h('div', { class: 'summary even' }, [
      tile('repair', 'repair', 'Repair needed', c.repair, c.repair ? 'waiting for repair' : 'none open', app),
      tile('due', 'due', 'Check due', c.due + c.never, c.never ? c.never + ' never checked' : weeks ? 'not checked for ' + weeks + ' weeks' : 'reminder off', app),
      tile('ok', 'ok', 'OK', c.ok, thisWeek + ' checked this week', app),
      tile('prod', 'all', 'Production use', all.filter(function (m) { return /^yes/i.test(m.prod_use); }).length, 'marked "Yes"', app)
    ]);

    var table = h('table', { class: 'list mag-list' }, [
      h('thead', {}, h('tr', {}, ['Magazine', 'Status', 'Last check', 'Lot status', 'Location / comment', 'Cart', 'Prod. use', ''].map(function (t) { return h('th', { text: t }); }))),
      h('tbody', {}, list.length ? list.map(function (m) { return row(m, today, app); })
        : h('tr', {}, h('td', { colspan: '8', class: 'empty' }, [I('magazine', 28), h('div', { text: all.length ? 'No magazines for this filter.' :
          (S.currentAdmin() ? 'No magazines yet. Add them in Settings → Magazines.' : 'No magazines yet. An Admin adds them in Settings.') })])))
    ]);

    U.add(root, [bar, strip, filter !== 'all' || q ? h('p', { class: 'muted' }, [list.length + ' of ' + all.length + ' shown. ',
      h('button', { class: 'link', text: 'Show all', onclick: function () { filter = 'all'; query = ''; app.render(); } })]) : null,
      h('div', { class: 'grid-wrap' }, table),
      h('p', { class: 'hint', text: 'Click Check after looking at a magazine (you can tick Cleaned and Repair needed). When a repair is finished, click Repair done.' })]);
  }

  function row(m, today, app) {
    var p = PILL[m.status];
    return h('tr', { class: 'mag-' + m.status }, [
      h('td', {}, h('button', { class: 'mag-sn', title: 'Details and history', onclick: function () { panel(m.id, app); } }, [
        I('magazine', 18), h('span', {}, [h('b', { text: m.sn }), h('span', { class: 'cr', text: m.cr_type || '' })])])),
      h('td', {}, [h('span', { class: 'pill ' + p[0] }, [med(m.status, 16), p[1]]),
        m.status === 'repair' && m.repair_since ? h('div', { class: 'sub', text: 'since ' + dd(m.repair_since) }) : null]),
      h('td', {}, m.last_check ? [h('div', { text: dd(m.last_check) + ' · ' + (m.last_by_name || '–') }), h('div', { class: 'sub', text: ago(m.last_check, today) })] : h('span', { class: 'muted', text: 'never' })),
      h('td', { class: 'mono', text: m.lot_status || '–' }),
      h('td', { class: 'wrap', text: m.location || '–' }),
      h('td', { text: m.cart || '–' }), h('td', { text: m.prod_use || '–' }),
      h('td', { class: 'row-actions' }, [
        h('button', { class: 'btn small', onclick: function () { panel(m.id, app, 'check'); } }, [I('check', 14), ' Check']),
        m.needs_repair ? h('button', { class: 'btn small secondary', onclick: function () { panel(m.id, app, 'repair'); } }, [I('wrench', 14), ' Repair done']) : null
      ])
    ]);
  }

  /* --- Week plan (13g) ---------------------------------------------- */

  var WLABEL = { done: ['check', 'Done'], overdue: ['exclaim', 'Overdue'], today: ['bell', 'Today'], postponed: ['skip', 'Planned'],
    upcoming: ['calendar', 'Due'], projected: ['calDots', 'Next'] };
  function wmed(st, px) { return h('span', { class: 'med m-' + st, style: 'width:' + px + 'px;height:' + px + 'px' }, I(WLABEL[st][0], Math.round(px * 0.6))); }

  function renderWeek(root, app) {
    if (!week) week = R.today();
    var today = R.today();
    var b = S.magWeek(week);
    var weeks = S.magCheckWeeks();
    var rows = b.rows.filter(function (r) { return !onlyDue || r.hasItems; });
    var c = { due: 0, done: 0, overdue: 0 };
    b.rows.forEach(function (r) { r.cells.forEach(function (items) { items.forEach(function (it) {
      if (it.carried) return;
      if (it.kind === 'done') c.done++; else if (it.kind === 'due') { c.due++; if (it.status === 'overdue') c.overdue++; }
    }); }); });
    var overdueAll = S.magazines(false).filter(function (m) { var dd2 = R.magDue(m, weeks, today); return dd2 && dd2 < today; }).length;

    var bar = h('div', { class: 'board-bar' }, [
      h('div', { class: 'week-nav' }, [
        h('button', { class: 'btn ghost square', 'aria-label': 'Previous week', onclick: function () { week = R.addDays(b.monday, -7); app.render(); } }, I('left', 18)),
        h('div', { class: 'week-title' }, [
          h('div', { class: 'week-kicker', text: 'Magazine cleaning · ' + (b.isThisWeek ? 'this week' : b.monday < R.mondayOf(today) ? 'past week' : 'coming week') }),
          h('h2', { class: 'week-label' }, [h('span', { class: 'wk', text: 'Week ' + R.isoWeek(b.monday) }), h('span', { class: 'sep', text: ' · ' }), R.shortDate(b.days[0]) + ' – ' + R.longDate(b.days[4])])
        ]),
        h('button', { class: 'btn ghost square', 'aria-label': 'Next week', onclick: function () { week = R.addDays(b.monday, 7); app.render(); } }, I('right', 18)),
        h('button', { class: 'btn ghost', disabled: b.isThisWeek, onclick: function () { week = R.today(); app.render(); } }, [I('calendar', 15), ' Today'])
      ]),
      h('div', { class: 'bar-right' }, [modeSwitch(app),
        h('label', { class: 'toggle' }, [h('input', { type: 'checkbox', checked: onlyDue, onchange: function (e) { onlyDue = e.target.checked; app.render(); } }), ' Only magazines with something this week'])])
    ]);
    var strip = h('div', { class: 'summary even' }, [
      wtile('today', 'Due this week', c.due, weeks ? 'every ' + weeks + ' weeks' : 'reminder off'),
      wtile('overdue', 'Overdue', overdueAll, overdueAll ? 'needs cleaning' : 'all on time'),
      wtile('done', 'Done', c.done, 'this week'),
      wtile('postponed', 'Planned by hand', S.magazines(false).filter(function (m) { return m.planned_date; }).length, 'moved to another day')
    ]);
    var table = h('table', { class: 'grid mag-grid' }, [
      h('thead', {}, h('tr', {}, [h('th', { class: 'tool-col', text: 'Magazine' })].concat(b.days.map(function (d) {
        return h('th', { class: d === today ? 'is-today' : (d < today ? 'is-past' : '') }, [h('span', { class: 'dname', text: R.dayName(d).slice(0, 3) }), ' ',
          h('span', { class: 'dnum', text: R.shortDate(d) }), d === today ? h('span', { class: 'today-pill', text: 'Today' }) : null]);
      })))),
      h('tbody', {}, rows.length ? rows.map(function (r) { return weekRow(r, b, today, app); })
        : h('tr', {}, h('td', { colspan: '6', class: 'empty' }, [I('magazine', 28), h('div', { text: weeks ? 'No magazine cleaning this week.' : 'The check reminder is off (Settings → Magazines).' })])))
    ]);
    var legend = h('div', { class: 'legend' }, ['upcoming', 'today', 'overdue', 'postponed', 'done', 'projected'].map(function (st) {
      return h('span', { class: 'legend-item' }, [wmed(st, 20), WLABEL[st][1]]);
    }));
    wdnd(table, app, today);
    U.add(root, [bar, strip, h('div', { class: 'grid-wrap' }, table), legend,
      h('p', { class: 'hint', text: 'Click a magazine to check or clean it. Drag it to another day in its row to plan it for that day. The next cleaning is the last check + ' + weeks + ' weeks.' })]);
  }

  function wtile(st, label, value, sub) {
    return h('div', { class: 'tile' + (value ? '' : ' zero') }, [h('span', { class: 'tile-ico' }, wmed(st, 38)),
      h('span', { class: 'tile-num', text: String(value) }), h('span', { class: 'tile-label', text: label }), sub ? h('span', { class: 'tile-sub', text: sub }) : null]);
  }

  function weekRow(r, b, today, app) {
    var m = r.mag;
    var st = R.magStatus(m, today, S.magCheckWeeks());
    var head = h('th', { class: 'tool-col', scope: 'row' }, [h('button', { class: 'mag-sn', onclick: function () { panel(m.id, app); } }, [
      I('magazine', 18), h('span', {}, [h('b', { text: m.sn }), h('span', { class: 'cr', text: (m.cr_type || '') + (m.last_check ? ' · last ' + R.shortDate(m.last_check) : ' · never checked') })])]),
      m.needs_repair ? h('span', { class: 'badge down', title: m.repair_note || '', text: 'REPAIR' }) : null]);
    return h('tr', { class: st === 'repair' ? 'is-down' : '' }, [head].concat(r.cells.map(function (items, i) {
      var d = b.days[i];
      return h('td', { class: d === today ? 'is-today' : (d < today ? 'is-past' : ''), 'data-mag': m.id, 'data-date': d }, items.map(function (it) { return wchip(it, m, app); }));
    })));
  }

  function wchip(it, m, app) {
    if (it.kind === 'next') return h('span', { class: 'chip s-projected', title: 'Next cleaning from the cycle' }, [wmed('projected', 22), h('span', { class: 'chip-text' }, h('span', { class: 'chip-main', text: 'Next' }))]);
    if (it.kind === 'done') {
      var e = it.event;
      return h('button', { class: 'chip s-done', title: 'Details', onclick: function () { panel(m.id, app); } }, [wmed('done', 26),
        h('span', { class: 'chip-text' }, [h('span', { class: 'chip-main', text: String(e.by_name || '').split(' ')[0] || 'Done' }),
          h('span', { class: 'chip-sub', text: e.kind === 'repair_done' ? 'repair done' : e.cleaned ? 'cleaned' : 'checked' })])]);
    }
    var sub = it.carried ? 'since ' + R.dayName(it.date).slice(0, 3) + ' ' + R.shortDate(it.date) : it.status === 'postponed' ? 'planned' : '';
    var main = it.carried ? 'Overdue' : WLABEL[it.status][1];
    return h('button', { class: 'chip s-' + it.status, draggable: 'true', title: 'Click to check / clean · drag to another day',
      ondragstart: function (ev) { drag = { magId: m.id, date: it.date }; try { ev.dataTransfer.setData('text/plain', m.id); } catch (x) { /* tests */ }
        var tb = ev.target.closest('table'); if (tb) tb.classList.add('dragging'); var tr = ev.target.closest('tr'); if (tr) tr.classList.add('drag-row'); },
      ondragend: wend,
      onclick: function () { panel(m.id, app, 'check'); } }, [wmed(it.status, 26),
      h('span', { class: 'chip-text' }, [h('span', { class: 'chip-main', text: main }), sub ? h('span', { class: 'chip-sub', text: sub }) : null])]);
  }

  function wend() {
    drag = null;
    document.querySelectorAll('.dragging, .drag-row, .drop-ok').forEach(function (el) { el.classList.remove('dragging', 'drag-row', 'drop-ok'); });
  }
  function wtarget(ev, today) {
    var td = ev.target.closest && ev.target.closest('td[data-date]');
    if (!drag || !td) return null;
    var d = td.getAttribute('data-date');
    if (td.getAttribute('data-mag') !== drag.magId || d === drag.date || d < today) return null;
    return { td: td, date: d };
  }
  function wdnd(table, app, today) {
    table.addEventListener('dragover', function (ev) {
      var t = wtarget(ev, today); if (!t) return;
      ev.preventDefault();
      table.querySelectorAll('.drop-ok').forEach(function (el) { if (el !== t.td) el.classList.remove('drop-ok'); });
      t.td.classList.add('drop-ok');
    });
    table.addEventListener('drop', function (ev) {
      var t = wtarget(ev, today); if (!t) return;
      ev.preventDefault();
      var id = drag.magId; wend();
      panel(id, app, 'plan', t.date);
    });
  }

  /* --- Magazine panel: details, Check, Repair done ------------------- */

  function panel(magId, app, start, presetDate) {
    var m = S.magazines(false).find(function (x) { return x.id === magId; });
    if (!m) { app.reload(); return; }
    var events = S.magEvents(m.id);
    var area = h('div', { class: 'action-area' });
    var p = PILL[m.status];
    var box = U.modal('Magazine ' + m.sn + (m.cr_type ? ' · ' + m.cr_type : ''), [
      h('dl', { class: 'facts' }, [
        h('dt', { text: 'Status' }), h('dd', {}, h('span', { class: 'pill ' + p[0] }, [med(m.status, 18), p[1]])),
        m.needs_repair ? h('dt', { text: 'Repair' }) : null,
        m.needs_repair ? h('dd', { text: 'since ' + dd(m.repair_since) + (m.repair_note ? ' – ' + m.repair_note : '') }) : null,
        h('dt', { text: 'Last check' }), h('dd', { text: m.last_check ? dd(m.last_check) + ' ' + m.last_check.slice(0, 4) + ' · ' + m.last_by_name : 'never' }),
        h('dt', { text: 'Lot status' }), h('dd', { text: m.lot_status || '–' }),
        h('dt', { text: 'Location / comment' }), h('dd', { text: m.location || '–' }),
        h('dt', { text: 'Cart / prod. use' }), h('dd', { text: (m.cart || '–') + ' / ' + (m.prod_use || '–') }),
        m.cleaned_at ? h('dt', { text: 'Last cleaned' }) : null, m.cleaned_at ? h('dd', { text: dd(m.cleaned_at) }) : null
      ]),
      events.length ? h('details', { class: 'events' }, [h('summary', { text: 'History (' + events.length + ')' }), h('ul', {}, events.slice(0, 30).map(function (e) {
        return h('li', {}, e.kind === 'check'
          ? [h('b', { text: e.repair_needed ? 'Check · repair needed' : 'Check' }), ' · ' + e.by_name + ' · ' + R.shortDate(e.date) + ' ' + e.date.slice(0, 4),
            e.cleaned ? ' · cleaned' : '', e.lot_status ? ' · lot ' + e.lot_status : '', e.comment ? ' · ' + e.comment : '']
          : [h('b', { text: 'Repair done' }), ' · ' + e.by_name + ' · ' + R.shortDate(e.date) + ' ' + e.date.slice(0, 4), e.comment ? ' · ' + e.comment : '']);
      }))]) : null,
      area
    ]);
    function finish(msg) { box.close(); U.toast(msg); app.reload(); }
    function failHard(e) { if (e && e.code === 'conflict') { U.toast(e.message, 'error'); box.close(); app.reload(); return true; } return false; }

    function menu() {
      U.clear(area);
      U.add(area, h('div', { class: 'actions' }, [
        h('button', { class: 'btn', onclick: checkForm }, [I('check', 16), ' Check']),
        h('button', { class: 'btn ghost', onclick: function () { planForm(); } }, [I('calendar', 16), ' Plan date']),
        m.needs_repair ? h('button', { class: 'btn secondary', onclick: repairForm }, [I('wrench', 16), ' Repair done']) : null
      ]));
    }

    function yn(label, value, withX) {
      var opts = [['', '–'], ['Yes', 'Yes'], ['No', 'No']];
      if (withX) opts.splice(2, 0, ['Yes / X', 'Yes / X']);
      var sel = h('select', {}, opts.map(function (o) { return h('option', { value: o[0], text: o[1], selected: (value || '') === o[0] }); }));
      return { sel: sel, node: U.field(label, sel) };
    }

    function checkForm() {
      var who = U.personField(S.activeUsers());
      var cart = yn('Cart', m.cart, true), prod = yn('Can production use?', m.prod_use);
      var lot = h('input', { type: 'text', maxlength: '60', value: m.lot_status || '', placeholder: 'Lot number / Dummies / Empty' });
      var where = h('input', { type: 'text', maxlength: '200', value: m.location || '', placeholder: 'e.g. in Stocker, WIP OVC, shutter loose' });
      var cleaned = h('input', { type: 'checkbox' });
      var repair = h('input', { type: 'checkbox', checked: m.needs_repair });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Check magazine ' + m.sn }), h('div', { class: 'form-grid' }, [
        U.field('Your name', who.node), U.field('Lot status', lot), cart.node, prod.node]),
        U.field('Location / comment', where, 'What you found and where it is. If it needs repair, say what is wrong.'),
        h('div', { class: 'check-row' }, [
          h('label', { class: 'toggle' }, [cleaned, ' Cleaned']),
          h('label', { class: 'toggle danger-text' }, [repair, ' Repair needed'])]),
        msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var u = S.lookupOperator(who.input.value);
            if (!u) { msg.textContent = 'Choose your name.'; msg.hidden = false; return; }
            if (repair.checked && !where.value.trim()) { msg.textContent = 'Repair needed: write what is wrong in the comment.'; msg.hidden = false; return; }
            var input = { cart: cart.sel.value, prod_use: prod.sel.value, lot_status: lot.value, comment: where.value, cleaned: cleaned.checked, repair_needed: repair.checked };
            var opId = who.input.value;
            U.confirmStep(area, u.name + ': save the check of ' + m.sn + (input.repair_needed ? ' (repair needed)' : ' (OK)') + '?', 'Yes, save', function () {
              return S.magCheck(m.id, opId, input).then(function () { finish(m.sn + ' checked' + (input.repair_needed ? ', repair needed.' : '.')); },
                function (e) { if (!failHard(e)) throw e; });
            }, checkForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      who.input.focus();
    }

    function repairForm() {
      var who = U.personField(S.activeUsers());
      var comment = h('textarea', { rows: '2', maxlength: '500', placeholder: 'What was done? (optional)' });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Repair done' }), m.repair_note ? h('p', { class: 'muted', text: 'Problem: ' + m.repair_note }) : null,
        U.field('Your name', who.node), U.field('Comment', comment), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var u = S.lookupOperator(who.input.value);
            if (!u) { msg.textContent = 'Choose your name.'; msg.hidden = false; return; }
            var opId = who.input.value, cm = comment.value;
            U.confirmStep(area, u.name + ': repair of ' + m.sn + ' is finished?', 'Yes, repaired', function () {
              return S.magRepairDone(m.id, opId, cm).then(function () { finish(m.sn + ' repaired.'); }, function (e) { if (!failHard(e)) throw e; });
            }, repairForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      who.input.focus();
    }

    function planForm(preset) {
      var who = U.personField(S.activeUsers());
      var due = R.magDue(m, S.magCheckWeeks(), R.today());
      var date = h('input', { type: 'date', min: R.today(), value: preset || due || '' });
      var reason = h('input', { type: 'text', maxlength: '200', placeholder: 'Why? (optional)' });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: preset ? 'Plan ' + m.sn + ' for ' + R.dayName(preset) + ' ' + R.shortDate(preset) : 'Plan the next cleaning of ' + m.sn }),
        due ? h('p', { class: 'muted', text: 'Currently due: ' + R.dayName(due) + ' ' + R.longDate(due) }) : null,
        U.field('Your name', who.node), U.field('Date', date, 'A weekend date moves to Monday.'), U.field('Reason', reason), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var u = S.lookupOperator(who.input.value);
            if (!u) { msg.textContent = 'Choose your name.'; msg.hidden = false; return; }
            var d = date.value;
            if (!R.isDate(d) || d < R.today()) { msg.textContent = 'Choose a date, today or later.'; msg.hidden = false; return; }
            var target = R.toWorkingDay(d), opId = who.input.value, rs = reason.value;
            U.confirmStep(area, u.name + ': plan ' + m.sn + ' for ' + R.dayName(target) + ' ' + R.longDate(target) + '?', 'Yes, plan', function () {
              return S.magPlan(m.id, opId, d, rs).then(function () { finish(m.sn + ' planned for ' + R.dayName(target).slice(0, 3) + ' ' + R.shortDate(target) + '.'); },
                function (e) { if (!failHard(e)) throw e; });
            }, function () { planForm(d); });
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      who.input.focus();
    }

    if (start === 'plan') planForm(presetDate);
    else if (start === 'check') checkForm(); else if (start === 'repair' && m.needs_repair) repairForm(); else menu();
  }

  return { render: render, panel: panel };
})();
