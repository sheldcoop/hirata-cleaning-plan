/**
 * Hirata Cleaning Plan - views/board.js
 * The weekly grid (tools x Monday-Friday), the cleaning action panel and the
 * tool panel (Tool down / Reactivate).
 */
window.HCP = window.HCP || {};
window.HCP.views = window.HCP.views || {};
window.HCP.views.board = (function () {
  'use strict';

  var R = window.HCP.rules, S = window.HCP.store, U = window.HCP.ui, h = U.h;
  var ONLY_KEY = window.HCP.config.local_prefix + 'only_due';
  var week = null;   // any date in the week shown

  var I = window.HCP.icon;
  var LABEL = {
    done: ['check', 'Done'], overdue: ['exclaim', 'Overdue'], today: ['bell', 'Today'], postponed: ['skip', 'Postponed'],
    upcoming: ['calendar', 'Scheduled'], down: ['power', 'Tool down'], projected: ['calDots', 'Next cycle'], skipped: ['ban', 'Skipped']
  };
  var drag = null;   // what is being dragged: {kind: 'task'|'cycle', toolId, date, taskId?, item?}
  /** Round status badge (medallion) with the status symbol. */
  function med(st, size) {
    var px = size || 24;
    var m = h('span', { class: 'med m-' + st, style: 'width:' + px + 'px;height:' + px + 'px' }, I(LABEL[st][0], Math.round(px * 0.6)));
    return m;
  }
  /** Coloured tool badge with the tool letters (hue from the name, so each tool keeps its colour). */
  function avatar(name) {
    var hsh = 0; for (var i = 0; i < name.length; i++) hsh = (hsh * 31 + name.charCodeAt(i)) % 360;
    return h('span', { class: 'avatar', style: '--h:' + hsh, text: name.replace(/\d+$/, '').slice(0, 3) });
  }
  var STATUS_TEXT = { done: 'Done', overdue: 'Overdue', today: 'Today', postponed: 'Postponed', upcoming: 'Scheduled', down: 'Tool down' };

  var onlyMem = null;
  function onlyDue() { if (onlyMem !== null) return onlyMem; try { return localStorage.getItem(ONLY_KEY) === '1'; } catch (e) { return false; } }
  function setOnlyDue(v) { onlyMem = !!v; try { localStorage.setItem(ONLY_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }
  var focus = '';   // highlight one status (click a summary tile)

  /** Counts for the summary strip. */
  function summary(b, today) {
    var c = { planned: 0, done: 0, today: 0, overdue: 0, postponed: 0, down: 0 };
    b.rows.forEach(function (r) {
      if (r.tool.status === 'down') c.down++;
      r.cells.forEach(function (items) {
        items.forEach(function (it) {
          if (it.carried || it.skipped) return;
          c.planned++;
          if (it.status === 'done') c.done++;
          else if (it.status === 'today') c.today++;
          else if (it.status === 'overdue') c.overdue++;
          else if (it.status === 'postponed') c.postponed++;
        });
      });
    });
    // overdue counts every open overdue cleaning (also from earlier weeks)
    c.overdueAll = S.current().tasks.filter(function (t) {
      var tool = S.current().tools.find(function (x) { return x.id === t.tool_id; });
      return tool && !tool.archived && R.taskStatus(t, tool, today) === 'overdue';
    }).length;
    return c;
  }

  function tile(key, label, value, sub, app) {
    return h('button', { class: 'tile t-' + key + (focus === key ? ' on' : '') + (value ? '' : ' zero'), title: 'Highlight on the board',
      onclick: function () { focus = focus === key ? '' : key; app.render(); } }, [
      h('span', { class: 'tile-ico' }, med(key, 38)),
      h('span', { class: 'tile-num', text: String(value) }),
      h('span', { class: 'tile-label', text: label }),
      sub ? h('span', { class: 'tile-sub', text: sub }) : null
    ]);
  }

  function render(root, app) {
    if (!week) week = R.today();
    var b = S.board(week);
    var today = R.today();
    var only = onlyDue();
    var c = summary(b, today);
    var pct = c.planned ? Math.round(100 * c.done / c.planned) : 0;

    var bar = h('div', { class: 'board-bar' }, [
      h('div', { class: 'week-nav' }, [
        h('button', { class: 'btn ghost square', title: 'Previous week', 'aria-label': 'Previous week', onclick: function () { week = R.addDays(b.monday, -7); app.render(); } }, I('left', 18)),
        h('div', { class: 'week-title' }, [
          h('div', { class: 'week-kicker', text: b.isThisWeek ? 'This week' : (b.monday < R.mondayOf(today) ? 'Past week' : 'Coming week') }),
          h('h2', { class: 'week-label' }, [h('span', { class: 'wk', text: 'Week ' + R.isoWeek(b.monday) }), h('span', { class: 'sep', text: ' · ' }), R.shortDate(b.days[0]) + ' – ' + R.longDate(b.days[4])])
        ]),
        h('button', { class: 'btn ghost square', title: 'Next week', 'aria-label': 'Next week', onclick: function () { week = R.addDays(b.monday, 7); app.render(); } }, I('right', 18)),
        h('button', { class: 'btn ghost', disabled: b.isThisWeek, onclick: function () { week = R.today(); app.render(); } }, [I('calendar', 15), ' Today'])
      ]),
      h('div', { class: 'bar-right' }, [
        h('label', { class: 'toggle' }, [
          h('input', { type: 'checkbox', checked: only, onchange: function (ev) { setOnlyDue(ev.target.checked); app.render(); } }),
          ' Only tools with something this week'
        ]),
        h('button', { class: 'btn ghost', title: 'Print this week', onclick: function () { window.print(); } }, [I('printer', 15), ' Print'])
      ])
    ]);

    var strip = h('div', { class: 'summary' }, [
      h('div', { class: 'progress-card' }, [
        h('div', { class: 'ring', style: '--p:' + pct }, h('span', { text: pct + '%' })),
        h('div', {}, [h('div', { class: 'tile-label', text: 'Week progress' }),
          h('div', { class: 'progress-text', text: c.done + ' of ' + c.planned + ' cleanings done' })])
      ]),
      tile('today', 'Today', b.isThisWeek ? c.today : 0, b.isThisWeek ? R.dayName(today).slice(0, 3) + ' ' + R.shortDate(today) : 'not this week', app),
      tile('overdue', 'Overdue', c.overdueAll, c.overdueAll ? 'needs action' : 'all on time', app),
      tile('postponed', 'Postponed', c.postponed, 'this week', app),
      tile('done', 'Done', c.done, 'this week', app),
      tile('down', 'Tools down', c.down, c.down ? 'cleanings paused' : 'all running', app)
    ]);

    var rows = b.rows.filter(function (r) { return !only || r.hasItems; });
    var table = h('table', { class: 'grid' + (focus ? ' focus focus-' + focus : '') }, [
      h('thead', {}, h('tr', {}, [h('th', { class: 'tool-col', text: 'Tool' })].concat(b.days.map(function (d) {
        return h('th', { class: d === today ? 'is-today' : (d < today ? 'is-past' : '') }, [
          h('span', { class: 'dname', text: R.dayName(d).slice(0, 3) }), ' ', h('span', { class: 'dnum', text: R.shortDate(d) }),
          d === today ? h('span', { class: 'today-pill', text: 'Today' }) : null]);
      })))),
      h('tbody', {}, rows.length ? rows.map(function (r) { return row(r, b, today, app); })
        : h('tr', {}, h('td', { colspan: '6', class: 'empty' }, [I('calendar', 28), h('div', { text: b.rows.length ? 'Nothing planned this week.' : 'No tools yet. An Admin adds tools in Settings.' })])))
    ]);

    var legend = h('div', { class: 'legend' }, ['upcoming', 'today', 'overdue', 'postponed', 'done', 'down', 'projected'].map(function (st) {
      return h('span', { class: 'legend-item' }, [med(st, 20), LABEL[st][1]]);
    }));

    dnd(table, app, today);
    U.add(root, [bar, strip, h('div', { class: 'grid-wrap' }, table), legend,
      h('p', { class: 'hint dnd-hint', text: 'Tip: drag a cleaning to another day in its row to postpone or move it.' + (S.currentAdmin() ? ' Admins can also drag or click a next cycle to move or skip it.' : '') })]);
  }

  function row(r, b, today, app) {
    var t = r.tool;
    var head = h('th', { class: 'tool-col', scope: 'row' }, [
      h('div', { class: 'tool-line' }, [
        avatar(t.name),
        h('div', { class: 'tool-meta' }, [
          h('div', { class: 'tool-top' }, [
            h('button', { class: 'tool-name', text: t.name, title: 'Tool details', onclick: function () { toolPanel(t.id, app); } }),
            t.status === 'down' ? h('span', { class: 'badge down', title: t.down_reason || '', text: 'DOWN' }) : h('span', { class: 'dot dot-ok', title: 'Active' })
          ]),
          h('div', { class: 'sched', text: R.describeSchedule(t) })
        ])
      ])
    ]);
    return h('tr', { class: t.status === 'down' ? 'is-down' : '' }, [head].concat(r.cells.map(function (items, i) {
      var d = b.days[i];
      return h('td', { class: d === today ? 'is-today' : (d < today ? 'is-past' : ''), 'data-tool': t.id, 'data-date': d },
        items.map(function (it) { return chip(it, app, t); }));
    })));
  }

  function chip(it, app, tool) {
    var l = LABEL[it.status];
    if (it.kind === 'projected') return cycleChip(it, app, tool);
    var t = it.task, main = l[1], sub = '';
    if (it.carried) { main = 'Overdue'; sub = 'since ' + R.dayName(it.date).slice(0, 3) + ' ' + R.shortDate(it.date); }
    else if (it.status === 'done') {
      var u = S.current().users.find(function (x) { return x.id === t.completed_by; });
      main = u ? u.name.split(' ')[0] : 'Done';
      sub = 'done ' + String(t.completed_at).slice(11, 16);
    } else if (t.postpone_count > 0 && t.due_date !== t.pattern_date && !t.is_one_off) {
      sub = 'from ' + R.dayName(t.pattern_date).slice(0, 3) + ' ' + R.shortDate(t.pattern_date);
    }
    var canDrag = t.status === 'open' && tool.status !== 'down';
    return h('button', { class: 'chip s-' + it.status, title: it.status === 'done' ? 'Open details' : 'Click to complete or postpone · drag to another day',
      draggable: canDrag ? 'true' : null,
      ondragstart: canDrag ? function (ev) { startDrag(ev, { kind: 'task', toolId: tool.id, date: t.due_date, taskId: t.id }); } : null,
      ondragend: endDrag,
      onclick: function () { taskPanel(t.id, app); } }, [
      med(it.status, 26),
      h('span', { class: 'chip-text' }, [h('span', { class: 'chip-main', text: main }), sub ? h('span', { class: 'chip-sub', text: sub }) : null]),
      t.is_one_off ? h('span', { class: 'tag', text: 'one-off' }) : null,
      t.completion_comment && it.status === 'done' ? h('span', { class: 'tag', title: t.completion_comment }, I('message', 13)) : null
    ]);
  }

  /** A future cycle (from the schedule). Admins can click or drag it to move or skip it (R19). */
  function cycleChip(it, app, tool) {
    var admin = !!S.currentAdmin();
    var st = it.skipped ? 'skipped' : 'projected';
    var sub = it.skipped ? 'not cleaned this cycle' : it.moved ? 'moved from ' + R.dayName(it.pattern).slice(0, 3) + ' ' + R.shortDate(it.pattern) : '';
    var body = [med(st, 22), h('span', { class: 'chip-text' }, [h('span', { class: 'chip-main', text: LABEL[st][1] }), sub ? h('span', { class: 'chip-sub', text: sub }) : null])];
    var cls = 'chip s-' + st + (it.moved ? ' is-moved' : '');
    if (!admin) return h('span', { class: cls, title: 'Comes from the schedule. An Admin can move or skip it.' }, body);
    var canDrag = !it.skipped;
    return h('button', { class: cls + ' admin', title: 'Admin: click to move or skip' + (canDrag ? ' · drag to another day' : ''),
      draggable: canDrag ? 'true' : null,
      ondragstart: canDrag ? function (ev) { startDrag(ev, { kind: 'cycle', toolId: tool.id, date: it.date, item: it }); } : null,
      ondragend: endDrag,
      onclick: function () { cyclePanel(tool, it, app); } }, body);
  }

  /* --- Drag and drop: same row, a working day from today on; every drop opens the confirmation --- */

  function startDrag(ev, info) {
    drag = info;
    try { ev.dataTransfer.setData('text/plain', info.toolId); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { /* no dataTransfer (tests) */ }
    var tbl = ev.target.closest('table');
    if (tbl) tbl.classList.add('dragging');
    var row = ev.target.closest('tr');
    if (row) row.classList.add('drag-row');
  }
  function endDrag() {
    drag = null;
    document.querySelectorAll('.dragging, .drag-row, .drop-ok').forEach(function (el) { el.classList.remove('dragging', 'drag-row', 'drop-ok'); });
  }
  function dropTarget(ev, today) {
    var td = ev.target.closest && ev.target.closest('td[data-date]');
    if (!drag || !td) return null;
    var d = td.getAttribute('data-date');
    if (td.getAttribute('data-tool') !== drag.toolId || d === drag.date || d < today) return null;
    return { td: td, date: d };
  }
  function dnd(table, app, today) {
    table.addEventListener('dragover', function (ev) {
      var t = dropTarget(ev, today);
      if (!t) return;
      ev.preventDefault();
      table.querySelectorAll('.drop-ok').forEach(function (el) { if (el !== t.td) el.classList.remove('drop-ok'); });
      t.td.classList.add('drop-ok');
    });
    table.addEventListener('dragleave', function (ev) {
      var td = ev.target.closest && ev.target.closest('td');
      if (td && !td.contains(ev.relatedTarget)) td.classList.remove('drop-ok');
    });
    table.addEventListener('drop', function (ev) {
      var t = dropTarget(ev, today);
      if (!t) return;
      ev.preventDefault();
      var info = drag;
      endDrag();
      if (info.kind === 'task') taskPanel(info.taskId, app, { moveTo: t.date });
      else cyclePanel(S.current().tools.find(function (x) { return x.id === info.toolId; }), info.item, app, { moveTo: t.date });
    });
  }

  /* --- Future cycle panel (Admin) ------------------------------------ */

  function cyclePanel(tool, it, app, opts) {
    var o = opts || {};
    var area = h('div', { class: 'action-area' });
    var title = tool.name + ' · Next cycle · ' + R.dayName(it.date).slice(0, 3) + ' ' + R.longDate(it.date);
    var m = U.modal(title, [
      h('dl', { class: 'facts' }, [
        h('dt', { text: 'Status' }), h('dd', {}, h('span', { class: 'pill' }, [med(it.skipped ? 'skipped' : 'projected', 18), it.skipped ? 'Skipped' : it.moved ? 'Moved' : 'Next cycle'])),
        h('dt', { text: 'Normal date' }), h('dd', { text: R.dayName(it.pattern) + ' ' + R.longDate(it.pattern) }),
        it.moved ? h('dt', { text: 'Moved to' }) : null, it.moved ? h('dd', { text: R.dayName(it.date) + ' ' + R.longDate(it.date) }) : null,
        h('dt', { text: 'Schedule' }), h('dd', { text: R.describeSchedule(tool) })
      ]),
      h('p', { class: 'hint', text: 'A future cycle is not open yet. Moving or skipping it changes only this one cycle; the schedule continues as normal.' }),
      area
    ]);
    function finish(msg) { m.close(); U.toast(msg); app.reload(); }

    function menu() {
      U.clear(area);
      U.add(area, h('div', { class: 'actions' }, [
        !it.skipped ? h('button', { class: 'btn', onclick: function () { moveForm(); } }, [I('calendar', 16), ' Move date']) : null,
        !it.skipped ? h('button', { class: 'btn secondary', onclick: skipStep }, [I('ban', 16), ' Skip this cycle']) : null,
        it.moved || it.skipped ? h('button', { class: 'btn ghost', onclick: restoreStep }, [I('undo', 16), ' Back to normal date']) : null
      ]));
    }
    function moveForm(preset) {
      var date = h('input', { type: 'date', min: R.today(), value: preset || it.date });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Move this cycle' }), U.field('New date', date, 'Monday to Friday, after the open cleaning.'), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var d = date.value;
            if (!R.isDate(d) || R.isWeekend(d) || d < R.today()) { msg.textContent = 'Choose a working day, today or later.'; msg.hidden = false; return; }
            U.confirmStep(area, 'Move the ' + tool.name + ' cycle of ' + R.shortDate(it.pattern) + ' to ' + R.dayName(d) + ' ' + R.longDate(d) + '?', 'Yes, move', function () {
              return S.moveCycle(tool.id, it.nominal, d).then(function () { finish(tool.name + ' cycle moved to ' + R.dayName(d).slice(0, 3) + ' ' + R.shortDate(d) + '.'); });
            }, function () { moveForm(d); });
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    function skipStep() {
      var reason = h('input', { type: 'text', maxlength: '200', placeholder: 'Why? (optional), e.g. shutdown' });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Skip this cycle' }), U.field('Reason', reason),
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn danger', text: 'Continue', onclick: function () {
            var r = reason.value;
            U.confirmStep(area, 'Skip the ' + tool.name + ' cleaning of ' + R.dayName(it.pattern).slice(0, 3) + ' ' + R.longDate(it.pattern) + '?', 'Yes, skip', function () {
              return S.skipCycle(tool.id, it.nominal, r).then(function () { finish(tool.name + ': cycle of ' + R.shortDate(it.pattern) + ' skipped.'); });
            }, skipStep, true);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    function restoreStep() {
      U.confirmStep(area, 'Put this ' + tool.name + ' cycle back on its normal date (' + R.dayName(it.pattern).slice(0, 3) + ' ' + R.shortDate(it.pattern) + ')?', 'Yes, restore', function () {
        return S.restoreCycle(tool.id, it.nominal).then(function () { finish('Cycle back on its normal date.'); });
      }, menu);
    }
    if (o.moveTo) moveForm(o.moveTo); else menu();
  }

  /* --- Cleaning panel ----------------------------------------------- */

  function taskPanel(taskId, app, opts) {
    var o = opts || {};
    var info = S.taskDetails(taskId);
    if (!info) { app.reload(); return; }
    var t = info.task, tool = info.tool, isAdmin = !!S.currentAdmin();
    var title = tool.name + ' · ' + R.dayName(t.due_date) + ' ' + R.longDate(t.due_date);
    var area = h('div', { class: 'action-area' });

    var facts = h('dl', { class: 'facts' }, [
      h('dt', { text: 'Status' }), h('dd', {}, h('span', { class: 'pill s-' + info.status }, [med(info.status, 18), STATUS_TEXT[info.status]])),
      h('dt', { text: 'Schedule' }), h('dd', { text: t.is_one_off ? 'One-off cleaning' : R.describeSchedule(tool) }),
      t.due_date !== t.pattern_date && !t.is_one_off ? h('dt', { text: 'Planned for' }) : null,
      t.due_date !== t.pattern_date && !t.is_one_off ? h('dd', { text: R.dayName(t.pattern_date) + ' ' + R.longDate(t.pattern_date) }) : null,
      h('dt', { text: 'Tool owner' }), h('dd', { text: tool.tool_owner || '–' }),
      h('dt', { text: 'MNT owner' }), h('dd', { text: tool.mnt_owner || '–' }),
      tool.status === 'down' ? h('dt', { text: 'Down since' }) : null,
      tool.status === 'down' ? h('dd', { text: R.longDate(tool.down_since.slice(0, 10)) + (tool.down_reason ? ' – ' + tool.down_reason : '') }) : null,
      t.status === 'completed' ? h('dt', { text: 'Completed' }) : null,
      t.status === 'completed' ? h('dd', { text: info.completed_by + ', ' + R.longDate(t.completed_at.slice(0, 10)) + ' ' + t.completed_at.slice(11, 16) }) : null,
      t.completion_comment ? h('dt', { text: 'Comment' }) : null,
      t.completion_comment ? h('dd', { text: t.completion_comment }) : null
    ]);

    var events = info.events.length ? h('details', { class: 'events' }, [
      h('summary', { text: 'History of this cleaning (' + info.events.length + ')' }),
      h('ul', {}, info.events.map(function (e) {
        return h('li', {}, [h('b', { text: e.label }), ' · ' + e.who + ' · ' + R.shortDate(e.at.slice(0, 10)) + ' ' + e.at.slice(11, 16),
          e.new_date ? ' · to ' + R.shortDate(e.new_date) : '', e.reason ? ' · ' + e.reason : '', e.comment ? ' · ' + e.comment : '']);
      }))
    ]) : null;

    var m = U.modal(title, [facts, events, area], { wide: false });

    function done(msg, undoToken) {
      m.close(); app.reload();
      U.toast(msg, 'ok', undoToken ? { ms: 10000, action: { label: 'Undo', fn: function () {
        S.undo(undoToken).then(function () { U.toast('Undone.'); app.reload(); }, function (e) { U.toast(U.errorText(e), 'error'); app.reload(); });
      } } } : null);
    }
    function failHard(e) { if (e && e.code === 'conflict') { U.toast(e.message, 'error'); m.close(); app.reload(); return true; } return false; }

    function menu() {
      U.clear(area);
      var buttons = [];
      if (t.status === 'open') {
        buttons.push(h('button', { class: 'btn', onclick: completeForm }, [I('check', 16), ' Complete']));
        buttons.push(h('button', { class: 'btn secondary', onclick: postponeForm }, [I('clock', 16), ' Postpone']));
      }
      if (isAdmin && t.status === 'open') {
        buttons.push(h('button', { class: 'btn ghost', text: 'Change date', onclick: editForm }));
        buttons.push(h('button', { class: 'btn ghost danger-text', text: 'Delete', onclick: deleteStep }));
      }
      if (isAdmin && t.status === 'completed') buttons.push(h('button', { class: 'btn ghost', text: 'Reopen', onclick: reopenStep }));
      if (!buttons.length) U.add(area, h('p', { class: 'muted', text: 'Log in as Admin to change a completed cleaning.' }));
      U.add(area, h('div', { class: 'actions' }, buttons));
    }

    function completeForm() {
      var op = U.personField(S.activeUsers());
      var comment = h('textarea', { rows: '3', maxlength: '1000', placeholder: 'Any problem? Write it here (optional)' });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Complete cleaning' }), U.field('Your name', op.node), U.field('Comment', comment), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: next }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      op.input.focus();
      function next() {
        var u = S.lookupOperator(op.input.value);
        if (!u) { msg.textContent = 'Choose your name.'; msg.hidden = false; return; }
        var opId = op.input.value, c = comment.value;
        U.confirmStep(area, 'Confirm cleaning completed for ' + tool.name + ' by ' + u.name + '?', 'Yes, completed', function () {
          return S.complete(t.id, opId, c).then(function (r) {
            done(tool.name + ' completed.' + (r.next ? ' Next: ' + R.dayName(r.next.due_date).slice(0, 3) + ' ' + R.shortDate(r.next.due_date) + '.' : ''), r.undo);
          }, function (e) { if (!failHard(e)) throw e; });
        }, completeForm);
      }
    }

    function postponeForm() {
      var op = U.personField(S.activeUsers());
      var date = h('input', { type: 'date', min: R.today(), value: o.moveTo || '' });
      var reason = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Why? (optional), e.g. tool used by PROD' });
      var msg = h('p', { class: 'form-error', hidden: true });
      var auto = R.nextWorkingDay(R.maxDate(t.due_date, R.today()));
      U.clear(area);
      U.add(area, [h('h3', { text: o.moveTo ? 'Move cleaning to ' + R.dayName(o.moveTo) + ' ' + R.shortDate(o.moveTo) : 'Postpone cleaning' }), U.field('Your name', op.node),
        U.field('New date', date, 'Optional. Empty = next working day (' + R.dayName(auto) + ' ' + R.shortDate(auto) + '). A weekend date moves to Monday.'),
        U.field('Reason', reason), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: next }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      op.input.focus();
      function next() {
        var u = S.lookupOperator(op.input.value);
        if (!u) { msg.textContent = 'Choose your name.'; msg.hidden = false; return; }
        var d = date.value;
        if (d && d < R.today()) { msg.textContent = 'The new date cannot be in the past.'; msg.hidden = false; return; }
        var target = d ? R.toWorkingDay(d) : auto;
        var opId = op.input.value, rs = reason.value;
        U.confirmStep(area, u.name + ': postpone ' + tool.name + ' to ' + R.dayName(target) + ' ' + R.longDate(target) + '?' +
          (d && target !== d ? ' (the chosen date is a weekend)' : ''), 'Yes, postpone', function () {
          return S.postpone(t.id, opId, d, rs).then(function (r) {
            done(tool.name + ' postponed to ' + R.dayName(r.task.due_date).slice(0, 3) + ' ' + R.shortDate(r.task.due_date) + '.', r.undo);
          }, function (e) { if (!failHard(e)) throw e; });
        }, postponeForm);
      }
    }

    function editForm() {
      var date = h('input', { type: 'date', value: t.due_date });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Change date (Admin)' }), U.field('New date', date, 'Monday to Friday only.'), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            if (!R.isDate(date.value) || R.isWeekend(date.value)) { msg.textContent = 'Choose a working day.'; msg.hidden = false; return; }
            var d = date.value;
            U.confirmStep(area, 'Move ' + tool.name + ' to ' + R.dayName(d) + ' ' + R.longDate(d) + '?', 'Yes, move', function () {
              return S.editTask(t.id, d).then(function () { done('Date changed.'); }, function (e) { if (!failHard(e)) throw e; });
            }, editForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }

    function deleteStep() {
      U.confirmStep(area, 'Delete this cleaning of ' + tool.name + '?' + (t.is_one_off ? '' : ' The schedule continues with the next date.'),
        'Yes, delete', function () {
          return S.deleteTask(t.id).then(function () { done('Cleaning deleted.'); }, function (e) { if (!failHard(e)) throw e; });
        }, menu, true);
    }

    function reopenStep() {
      U.confirmStep(area, 'Reopen this cleaning of ' + tool.name + '? It becomes open again.', 'Yes, reopen', function () {
        return S.reopen(t.id).then(function () { done('Cleaning reopened.'); });
      }, menu);
    }

    if (o.moveTo && t.status === 'open') postponeForm(); else menu();
  }

  /* --- Tool panel --------------------------------------------------- */

  function toolPanel(toolId, app) {
    var tool = S.current().tools.find(function (x) { return x.id === toolId; });
    if (!tool) return;
    var isAdmin = !!S.currentAdmin();
    var area = h('div', { class: 'action-area' });
    var hist = S.history({ toolId: toolId }).slice(0, 8);
    var m = U.modal(tool.name, [
      h('dl', { class: 'facts' }, [
        h('dt', { text: 'Status' }), h('dd', {}, h('span', { class: 'pill ' + (tool.status === 'down' ? 's-down' : 's-upcoming'), text: tool.status === 'down' ? 'Tool down' : 'Active' })),
        tool.status === 'down' ? h('dt', { text: 'Down since' }) : null,
        tool.status === 'down' ? h('dd', { text: R.longDate(tool.down_since.slice(0, 10)) + (tool.down_reason ? ' – ' + tool.down_reason : '') }) : null,
        h('dt', { text: 'Schedule' }), h('dd', { text: R.describeSchedule(tool) }),
        h('dt', { text: 'Tool owner' }), h('dd', { text: tool.tool_owner || '–' }),
        h('dt', { text: 'MNT owner' }), h('dd', { text: tool.mnt_owner || '–' })
      ]),
      hist.length ? h('details', { class: 'events' }, [h('summary', { text: 'Recent history' }), h('ul', {}, hist.map(function (r) {
        return h('li', {}, [h('b', { text: r.action_label }), ' · ' + (r.who || '–') + ' · ' + R.shortDate(r.date) + (r.reason ? ' · ' + r.reason : '') + (r.comment ? ' · ' + r.comment : '')]);
      }))]) : null,
      area
    ]);
    var close = function (msg) { U.toast(msg); m.close(); app.reload(); };

    function menu() {
      U.clear(area);
      if (!isAdmin) { U.add(area, h('p', { class: 'muted', text: 'Tool down / reactivate: log in as Admin.' })); return; }
      U.add(area, h('div', { class: 'actions' }, tool.status === 'down'
        ? [h('button', { class: 'btn', text: 'Reactivate tool', onclick: reactivateForm })]
        : [h('button', { class: 'btn danger', onclick: downForm }, [I('ban', 16), ' Set tool down'])]));
    }
    function downForm() {
      var reason = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Why is the tool down? e.g. no use allowed, waiting for service' });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Set tool down' }), U.field('Reason', reason), h('p', { class: 'hint', text: 'Cleanings pause until the tool is reactivated.' }),
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn danger', text: 'Continue', onclick: function () {
            var rs = reason.value;
            U.confirmStep(area, 'Set ' + tool.name + ' down? Its cleanings pause.', 'Yes, set down', function () {
              return S.toolDown(tool.id, rs).then(function () { close(tool.name + ' is now down.'); });
            }, downForm, true);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    function reactivateForm() {
      var date = h('input', { type: 'date', min: R.today(), value: R.toWorkingDay(R.today()) });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Reactivate tool' }), U.field('Next cleaning on', date, 'A working day, today or later.'), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var d = date.value;
            if (!R.isDate(d) || R.isWeekend(d) || d < R.today()) { msg.textContent = 'Choose a working day, today or later.'; msg.hidden = false; return; }
            U.confirmStep(area, 'Reactivate ' + tool.name + ' with the next cleaning on ' + R.dayName(d) + ' ' + R.longDate(d) + '?', 'Yes, reactivate', function () {
              return S.reactivate(tool.id, d).then(function () { close(tool.name + ' is active again.'); });
            }, reactivateForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    menu();
  }

  return { render: render, taskPanel: taskPanel, toolPanel: toolPanel };
})();
