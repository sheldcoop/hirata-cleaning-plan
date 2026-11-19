/**
 * Hirata Cleaning Plan - views/pm.js
 * PM plan tab (PLAN.md 13e): weekly grid of the PM tools. Everyone can see it;
 * only the logged-in Admin marks PMs done, postpones them and sets tools down.
 * Red row = not installed yet. Down = tool down on that day.
 */
window.HCP = window.HCP || {};
window.HCP.views = window.HCP.views || {};
window.HCP.views.pm = (function () {
  'use strict';

  var R = window.HCP.rules, S = window.HCP.store, U = window.HCP.ui, h = U.h, I = window.HCP.icon;
  var week = null;
  var drag = null;   // {toolId, taskId, date} while an Admin drags a PM

  var LABEL = {
    done: ['check', 'Done'], overdue: ['exclaim', 'Overdue'], today: ['bell', 'Today'], postponed: ['skip', 'Postponed'],
    upcoming: ['wrench', 'PM'], down: ['power', 'Tool down'], projected: ['calDots', 'Next PM']
  };
  var STATUS_TEXT = { done: 'Done', overdue: 'Overdue', today: 'Due today', postponed: 'Postponed', upcoming: 'Planned', down: 'Tool down' };

  function med(st, size) {
    var px = size || 24;
    return h('span', { class: 'med m-' + st, style: 'width:' + px + 'px;height:' + px + 'px' }, I(LABEL[st][0], Math.round(px * 0.6)));
  }
  function dd(d) { return R.dayName(d).slice(0, 3) + ' ' + R.shortDate(d); }

  function counts(b, today) {
    var c = { planned: 0, done: 0, today: 0, overdue: 0, down: 0, notInstalled: 0 };
    b.rows.forEach(function (r) {
      if (r.tool.status === 'planned') c.notInstalled++;
      if (R.downOn(r.tool, today)) c.down++;
      r.cells.forEach(function (items) {
        items.forEach(function (it) {
          if (it.carried || it.kind === 'projected') return;
          c.planned++;
          if (it.status === 'done') c.done++;
          else if (it.status === 'today') c.today++;
        });
      });
    });
    var d = S.current();
    c.overdue = d.tasks.filter(function (t) {
      var tool = d.tools.find(function (x) { return x.id === t.tool_id; });
      return tool && !tool.archived && R.isPm(tool) && R.taskStatus(t, tool, today) === 'overdue';
    }).length;
    return c;
  }

  function tile(key, label, value, sub) {
    return h('div', { class: 'tile t-' + key + (value ? '' : ' zero') }, [
      h('span', { class: 'tile-ico' }, key === 'planned-tool' ? h('span', { class: 'med m-notinst', style: 'width:38px;height:38px' }, I('plus', 22)) : med(key, 38)),
      h('span', { class: 'tile-num', text: String(value) }),
      h('span', { class: 'tile-label', text: label }),
      sub ? h('span', { class: 'tile-sub', text: sub }) : null
    ]);
  }

  function render(root, app) {
    if (!week) week = R.today();
    var b = S.board(week, 'pm');
    var today = R.today();
    var c = counts(b, today);
    var admin = !!S.currentAdmin();

    var bar = h('div', { class: 'board-bar' }, [
      h('div', { class: 'week-nav' }, [
        h('button', { class: 'btn ghost square', title: 'Previous week', 'aria-label': 'Previous week', onclick: function () { week = R.addDays(b.monday, -7); app.render(); } }, I('left', 18)),
        h('div', { class: 'week-title' }, [
          h('div', { class: 'week-kicker', text: 'PM plan · ' + (b.isThisWeek ? 'this week' : (b.monday < R.mondayOf(today) ? 'past week' : 'coming week')) }),
          h('h2', { class: 'week-label' }, [h('span', { class: 'wk', text: 'Week ' + R.isoWeek(b.monday) }), h('span', { class: 'sep', text: ' · ' }), R.shortDate(b.days[0]) + ' – ' + R.longDate(b.days[4])])
        ]),
        h('button', { class: 'btn ghost square', title: 'Next week', 'aria-label': 'Next week', onclick: function () { week = R.addDays(b.monday, 7); app.render(); } }, I('right', 18)),
        h('button', { class: 'btn ghost', disabled: b.isThisWeek, onclick: function () { week = R.today(); app.render(); } }, [I('calendar', 15), ' Today'])
      ]),
      h('div', { class: 'bar-right' }, [
        h('button', { class: 'btn ghost', title: 'Print this week', onclick: function () { window.print(); } }, [I('printer', 15), ' Print'])
      ])
    ]);

    var strip = h('div', { class: 'summary even' }, [
      tile('today', 'Due today', b.isThisWeek ? c.today : 0, b.isThisWeek ? dd(today) : 'not this week'),
      tile('overdue', 'Overdue', c.overdue, c.overdue ? 'needs action' : 'all on time'),
      tile('done', 'Done', c.done, 'of ' + c.planned + ' this week'),
      tile('down', 'Tools down', c.down, c.down ? 'no PM while down' : 'all running'),
      tile('planned-tool', 'Not installed', c.notInstalled, 'to be bought')
    ]);

    var table = h('table', { class: 'grid pm-grid' }, [
      h('thead', {}, h('tr', {}, [h('th', { class: 'tool-col', text: 'Tool · MNT owner' })].concat(b.days.map(function (d) {
        return h('th', { class: d === today ? 'is-today' : (d < today ? 'is-past' : '') }, [
          h('span', { class: 'dname', text: R.dayName(d).slice(0, 3) }), ' ', h('span', { class: 'dnum', text: R.shortDate(d) }),
          d === today ? h('span', { class: 'today-pill', text: 'Today' }) : null]);
      })))),
      h('tbody', {}, b.rows.length ? b.rows.map(function (r) { return row(r, b, today, app); })
        : h('tr', {}, h('td', { colspan: '6', class: 'empty' }, [I('wrench', 28),
          h('div', { text: admin ? 'No PM tools yet. Add them in Settings → PM tools.' : 'No PM tools yet. An Admin adds them in Settings.' })])))
    ]);

    var legend = h('div', { class: 'legend' }, ['upcoming', 'today', 'overdue', 'postponed', 'done', 'projected'].map(function (st) {
      return h('span', { class: 'legend-item' }, [med(st, 20), LABEL[st][1]]);
    }).concat([
      h('span', { class: 'legend-item' }, [h('span', { class: 'dbox' }, I('power', 12)), 'Down']),
      h('span', { class: 'legend-item' }, [h('span', { class: 'nibox' }), 'Not installed'])
    ]));

    dnd(table, app, today);
    U.add(root, [bar, strip, h('div', { class: 'grid-wrap' }, table), legend,
      h('p', { class: 'hint', text: admin ? 'Click a PM to mark it done or postpone it, or drag it to another day in its row. Click a tool name to set it down or back up.'
        : 'Read only. The Admin marks PMs done and sets tools down.' })]);
  }

  function row(r, b, today, app) {
    var t = r.tool;
    var planned = t.status === 'planned';
    var downNow = R.downOn(t, today);
    var badge = planned ? h('span', { class: 'badge notinst', text: 'NOT INSTALLED' })
      : downNow ? h('span', { class: 'badge down', title: t.down_reason || '', text: 'DOWN' })
      : t.status === 'down' ? h('span', { class: 'badge down soft', title: 'Down from ' + R.longDate(t.down_from), text: 'DOWN ' + R.shortDate(t.down_from) })
      : h('span', { class: 'dot dot-ok', title: 'Active' });
    var head = h('th', { class: 'tool-col', scope: 'row' }, [
      h('div', { class: 'tool-meta' }, [
        h('div', { class: 'tool-top' }, [h('button', { class: 'tool-name', text: t.name, title: 'Tool details', onclick: function () { toolPanel(t.id, app); } }), badge]),
        h('div', { class: 'sched', text: (t.mnt_owner ? t.mnt_owner + ' · ' : '') + R.describeAny(t) })
      ])
    ]);
    var cls = planned ? 'is-planned' : downNow ? 'is-down' : '';
    return h('tr', { class: cls }, [head].concat(r.cells.map(function (items, i) {
      var d = b.days[i];
      var content = [];
      if (r.downDays[i]) content.push(h('span', { class: 'dbox big', title: 'Down' + (t.down_reason ? ': ' + t.down_reason : '') }, [I('power', 14), ' Down']));
      items.forEach(function (it) { content.push(chip(it, app, t)); });
      return h('td', { class: (d === today ? 'is-today' : (d < today ? 'is-past' : '')) + (r.downDays[i] ? ' is-dday' : ''), 'data-tool': t.id, 'data-date': d }, content);
    })));
  }

  function chip(it, app, tool) {
    if (it.kind === 'projected') {
      return h('span', { class: 'chip s-projected', title: 'Next PM from the schedule' }, [med('projected', 22), h('span', { class: 'chip-text' }, h('span', { class: 'chip-main', text: 'Next PM' }))]);
    }
    var t = it.task, main = it.status === 'upcoming' ? 'PM' : LABEL[it.status][1], sub = '';
    if (it.carried) { main = 'Overdue'; sub = 'since ' + dd(it.date); }
    else if (it.status === 'done') sub = 'done ' + String(t.completed_at).slice(11, 16);
    else if (t.postpone_count > 0 && t.due_date !== t.pattern_date) sub = 'from ' + dd(t.pattern_date);
    var canDrag = !!S.currentAdmin() && t.status === 'open' && !R.downOn(tool, R.today());
    return h('button', { class: 'chip s-' + it.status, title: canDrag ? 'Click to open · drag to another day' : 'Open PM',
      draggable: canDrag ? 'true' : null,
      ondragstart: canDrag ? function (ev) {
        drag = { toolId: tool.id, taskId: t.id, date: t.due_date };
        try { ev.dataTransfer.setData('text/plain', t.id); ev.dataTransfer.effectAllowed = 'move'; } catch (x) { /* tests */ }
        var tb = ev.target.closest('table'); if (tb) tb.classList.add('dragging');
        var tr = ev.target.closest('tr'); if (tr) tr.classList.add('drag-row');
      } : null,
      ondragend: endDrag,
      onclick: function () { taskPanel(t.id, app); } }, [
      med(it.status, 26),
      h('span', { class: 'chip-text' }, [h('span', { class: 'chip-main', text: main }), sub ? h('span', { class: 'chip-sub', text: sub }) : null]),
      t.completion_comment && it.status === 'done' ? h('span', { class: 'tag', title: t.completion_comment }, I('message', 13)) : null
    ]);
  }

  /* --- Drag and drop (Admin): same row, today or later, not on a Down day --- */

  function endDrag() {
    drag = null;
    document.querySelectorAll('.dragging, .drag-row, .drop-ok').forEach(function (el) { el.classList.remove('dragging', 'drag-row', 'drop-ok'); });
  }
  function dropTarget(ev, today) {
    var td = ev.target.closest && ev.target.closest('td[data-date]');
    if (!drag || !td) return null;
    var d = td.getAttribute('data-date');
    if (td.getAttribute('data-tool') !== drag.toolId || d === drag.date || d < today || td.classList.contains('is-dday')) return null;
    return { td: td, date: d };
  }
  function dnd(table, app, today) {
    table.addEventListener('dragover', function (ev) {
      var t = dropTarget(ev, today); if (!t) return;
      ev.preventDefault();
      table.querySelectorAll('.drop-ok').forEach(function (el) { if (el !== t.td) el.classList.remove('drop-ok'); });
      t.td.classList.add('drop-ok');
    });
    table.addEventListener('drop', function (ev) {
      var t = dropTarget(ev, today); if (!t) return;
      ev.preventDefault();
      var id = drag.taskId; endDrag();
      taskPanel(id, app, { moveTo: t.date });
    });
  }

  /* --- PM panel ----------------------------------------------------- */

  function taskPanel(taskId, app, opts) {
    var o = opts || {};
    var info = S.taskDetails(taskId);
    if (!info) { app.reload(); return; }
    var t = info.task, tool = info.tool, isAdmin = !!S.currentAdmin();
    var area = h('div', { class: 'action-area' });
    var facts = h('dl', { class: 'facts' }, [
      h('dt', { text: 'Status' }), h('dd', {}, h('span', { class: 'pill s-' + info.status }, [med(info.status, 18), STATUS_TEXT[info.status]])),
      h('dt', { text: 'Schedule' }), h('dd', { text: R.describeAny(tool) }),
      t.due_date !== t.pattern_date ? h('dt', { text: 'Planned for' }) : null,
      t.due_date !== t.pattern_date ? h('dd', { text: R.dayName(t.pattern_date) + ' ' + R.longDate(t.pattern_date) }) : null,
      h('dt', { text: 'MNT owner' }), h('dd', { text: tool.mnt_owner || '–' }),
      t.status === 'completed' ? h('dt', { text: 'Completed' }) : null,
      t.status === 'completed' ? h('dd', { text: info.completed_by + ', ' + R.longDate(t.completed_at.slice(0, 10)) + ' ' + t.completed_at.slice(11, 16) }) : null,
      t.completion_comment ? h('dt', { text: 'Comment' }) : null,
      t.completion_comment ? h('dd', { text: t.completion_comment }) : null
    ]);
    var events = info.events.length ? h('details', { class: 'events' }, [
      h('summary', { text: 'History of this PM (' + info.events.length + ')' }),
      h('ul', {}, info.events.map(function (e) {
        return h('li', {}, [h('b', { text: e.label }), ' · ' + e.who + ' · ' + R.shortDate(e.at.slice(0, 10)) + ' ' + e.at.slice(11, 16),
          e.new_date ? ' · to ' + R.shortDate(e.new_date) : '', e.reason ? ' · ' + e.reason : '', e.comment ? ' · ' + e.comment : '']);
      }))
    ]) : null;
    var m = U.modal(tool.name + ' · PM · ' + R.dayName(t.due_date) + ' ' + R.longDate(t.due_date), [facts, events, area]);

    function done(msg, undoToken) {
      m.close(); app.reload();
      U.toast(msg, 'ok', undoToken ? { ms: 10000, action: { label: 'Undo', fn: function () {
        S.undo(undoToken).then(function () { U.toast('Undone.'); app.reload(); }, function (e) { U.toast(U.errorText(e), 'error'); app.reload(); });
      } } } : null);
    }
    function failHard(e) { if (e && e.code === 'conflict') { U.toast(e.message, 'error'); m.close(); app.reload(); return true; } return false; }

    function menu() {
      U.clear(area);
      if (!isAdmin) { U.add(area, h('p', { class: 'muted', text: 'Only the Admin can change PMs. Log in as Admin.' })); return; }
      var b = [];
      if (t.status === 'open') {
        b.push(h('button', { class: 'btn', onclick: completeForm }, [I('check', 16), ' Done']));
        b.push(h('button', { class: 'btn secondary', onclick: postponeForm }, [I('clock', 16), ' Postpone']));
        b.push(h('button', { class: 'btn ghost', text: 'Change date', onclick: editForm }));
        b.push(h('button', { class: 'btn ghost danger-text', text: 'Delete', onclick: deleteStep }));
      } else {
        b.push(h('button', { class: 'btn ghost', text: 'Reopen', onclick: reopenStep }));
      }
      U.add(area, h('div', { class: 'actions' }, b));
    }
    function completeForm() {
      var comment = h('textarea', { rows: '3', maxlength: '1000', placeholder: 'Anything to note? (optional)' });
      U.clear(area);
      U.add(area, [h('h3', { text: 'PM done' }), U.field('Comment', comment),
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var c = comment.value;
            U.confirmStep(area, 'Confirm PM done for ' + tool.name + '?', 'Yes, done', function () {
              return S.complete(t.id, null, c).then(function (r) {
                done(tool.name + ' PM done.' + (r.next ? ' Next PM: ' + dd(r.next.due_date) + '.' : ''), r.undo);
              }, function (e) { if (!failHard(e)) throw e; });
            }, completeForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      comment.focus();
    }
    function postponeForm() {
      var date = h('input', { type: 'date', min: R.today(), value: o.moveTo || '' });
      var reason = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Why? (optional)' });
      var msg = h('p', { class: 'form-error', hidden: true });
      var auto = R.nextWorkingDay(R.maxDate(t.due_date, R.today()));
      U.clear(area);
      U.add(area, [h('h3', { text: o.moveTo ? 'Move PM to ' + R.dayName(o.moveTo) + ' ' + R.shortDate(o.moveTo) : 'Postpone PM' }),
        U.field('New date', date, 'Optional. Empty = next working day (' + R.dayName(auto) + ' ' + R.shortDate(auto) + '). A weekend date moves to Monday.'),
        U.field('Reason', reason), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var d = date.value;
            if (d && d < R.today()) { msg.textContent = 'The new date cannot be in the past.'; msg.hidden = false; return; }
            var target = d ? R.toWorkingDay(d) : auto, rs = reason.value;
            U.confirmStep(area, 'Postpone the ' + tool.name + ' PM to ' + R.dayName(target) + ' ' + R.longDate(target) + '?', 'Yes, postpone', function () {
              return S.postpone(t.id, null, d, rs).then(function (r) { done(tool.name + ' PM postponed to ' + dd(r.task.due_date) + '.', r.undo); },
                function (e) { if (!failHard(e)) throw e; });
            }, postponeForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    function editForm() {
      var date = h('input', { type: 'date', value: t.due_date });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Change date' }), U.field('New date', date, 'Monday to Friday only.'), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var d = date.value;
            if (!R.isDate(d) || R.isWeekend(d)) { msg.textContent = 'Choose a working day.'; msg.hidden = false; return; }
            U.confirmStep(area, 'Move the ' + tool.name + ' PM to ' + R.dayName(d) + ' ' + R.longDate(d) + '?', 'Yes, move', function () {
              return S.editTask(t.id, d).then(function () { done('Date changed.'); }, function (e) { if (!failHard(e)) throw e; });
            }, editForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    function deleteStep() {
      U.confirmStep(area, 'Delete this PM of ' + tool.name + '? The schedule continues with the next date.', 'Yes, delete', function () {
        return S.deleteTask(t.id).then(function () { done('PM deleted.'); }, function (e) { if (!failHard(e)) throw e; });
      }, menu, true);
    }
    function reopenStep() {
      U.confirmStep(area, 'Reopen this PM of ' + tool.name + '? It becomes open again.', 'Yes, reopen', function () {
        return S.reopen(t.id).then(function () { done('PM reopened.'); });
      }, menu);
    }
    if (o.moveTo && isAdmin && t.status === 'open') postponeForm(); else menu();
  }

  /* --- Tool panel: Down / Back up ------------------------------------ */

  function toolPanel(toolId, app) {
    var tool = S.current().tools.find(function (x) { return x.id === toolId; });
    if (!tool) return;
    var isAdmin = !!S.currentAdmin();
    var today = R.today();
    var area = h('div', { class: 'action-area' });
    var hist = S.history({ toolId: toolId }).slice(0, 8);
    var stateText = tool.status === 'planned' ? 'Not installed' : tool.status === 'down' ? 'Down' : 'Active';
    var m = U.modal(tool.name + ' · PM', [
      h('dl', { class: 'facts' }, [
        h('dt', { text: 'Status' }), h('dd', {}, h('span', { class: 'pill ' + (tool.status === 'active' ? 's-upcoming' : 's-down'), text: stateText })),
        tool.status === 'down' ? h('dt', { text: 'Down' }) : null,
        tool.status === 'down' ? h('dd', { text: 'from ' + R.longDate(tool.down_from || tool.down_since.slice(0, 10)) +
          (tool.down_until ? ' until ' + R.longDate(tool.down_until) : ' (no end date)') + (tool.down_reason ? ' – ' + tool.down_reason : '') }) : null,
        h('dt', { text: 'Schedule' }), h('dd', { text: R.describeAny(tool) }),
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
      if (!isAdmin) { U.add(area, h('p', { class: 'muted', text: 'Down / Back up: log in as Admin.' })); return; }
      if (tool.status === 'planned') { U.add(area, h('p', { class: 'muted', text: 'Not installed yet. When it is installed, untick "Not installed" in Settings → PM tools.' })); return; }
      U.add(area, h('div', { class: 'actions' }, tool.status === 'down'
        ? [h('button', { class: 'btn', onclick: upForm }, [I('power', 16), ' Back up'])]
        : [h('button', { class: 'btn danger', onclick: downForm }, [I('ban', 16), ' Set down'])]));
    }
    function downForm() {
      var from = h('input', { type: 'date', value: R.toWorkingDay(today) });
      var until = h('input', { type: 'date' });
      var reason = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Why is the tool down? e.g. waiting for spare part' });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Set tool down' }), h('div', { class: 'form-grid' }, [
        U.field('Down from', from), U.field('Until (optional)', until, 'Empty = until you click Back up.')]),
        U.field('Reason', reason), h('p', { class: 'hint', text: 'The grid shows D on every working day of this period. No PM while down.' }), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn danger', text: 'Continue', onclick: function () {
            var f = from.value, u = until.value, rs = reason.value;
            if (!R.isDate(f)) { msg.textContent = 'Choose the "down from" date.'; msg.hidden = false; return; }
            if (u && u < f) { msg.textContent = 'The "until" date cannot be before the "from" date.'; msg.hidden = false; return; }
            U.confirmStep(area, 'Set ' + tool.name + ' down from ' + R.longDate(f) + (u ? ' until ' + R.longDate(u) : '') + '?', 'Yes, set down', function () {
              return S.toolDown(tool.id, rs, f, u).then(function () { close(tool.name + ' is down.'); });
            }, downForm, true);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    function upForm() {
      if (!R.hasSchedule(tool)) {
        U.confirmStep(area, tool.name + ' is back up?', 'Yes, back up', function () {
          return S.reactivate(tool.id, null).then(function () { close(tool.name + ' is back up.'); });
        }, menu);
        return;
      }
      var open = S.current().tasks.find(function (x) { return x.tool_id === tool.id && x.status === 'open' && !x.is_one_off; });
      var suggest = open && open.due_date >= today ? open.due_date : R.toWorkingDay(today);
      var date = h('input', { type: 'date', min: today, value: suggest });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Back up' }), U.field('Next PM on', date, 'A working day, today or later.'), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: function () {
            var d = date.value;
            if (!R.isDate(d) || R.isWeekend(d) || d < today) { msg.textContent = 'Choose a working day, today or later.'; msg.hidden = false; return; }
            U.confirmStep(area, tool.name + ' back up, next PM on ' + R.dayName(d) + ' ' + R.longDate(d) + '?', 'Yes, back up', function () {
              return S.reactivate(tool.id, d).then(function () { close(tool.name + ' is back up.'); });
            }, upForm);
          } }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
    }
    menu();
  }

  return { render: render, taskPanel: taskPanel, toolPanel: toolPanel };
})();
