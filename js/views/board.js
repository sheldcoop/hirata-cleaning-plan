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

  var LABEL = {
    done: ['✓', 'Done'], overdue: ['⚠', 'Overdue'], today: ['●', 'Due today'], postponed: ['🕓', 'Postponed'],
    upcoming: ['○', 'Due'], down: ['⛔', 'Tool down'], projected: ['·', 'Planned']
  };
  var STATUS_TEXT = { done: 'Done', overdue: 'Overdue', today: 'Due today', postponed: 'Postponed', upcoming: 'Upcoming', down: 'Tool down' };

  var onlyMem = null;
  function onlyDue() { if (onlyMem !== null) return onlyMem; try { return localStorage.getItem(ONLY_KEY) === '1'; } catch (e) { return false; } }
  function setOnlyDue(v) { onlyMem = !!v; try { localStorage.setItem(ONLY_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }

  function render(root, app) {
    if (!week) week = R.today();
    var b = S.board(week);
    var today = R.today();
    var only = onlyDue();

    var label = 'Week ' + R.isoWeek(b.monday) + ' · ' + R.shortDate(b.days[0]) + ' – ' + R.longDate(b.days[4]);
    var bar = h('div', { class: 'board-bar' }, [
      h('div', { class: 'week-nav' }, [
        h('button', { class: 'btn ghost', title: 'Previous week', 'aria-label': 'Previous week', text: '‹', onclick: function () { week = R.addDays(b.monday, -7); app.render(); } }),
        h('h2', { class: 'week-label', text: label }),
        h('button', { class: 'btn ghost', title: 'Next week', 'aria-label': 'Next week', text: '›', onclick: function () { week = R.addDays(b.monday, 7); app.render(); } }),
        h('button', { class: 'btn ghost', text: 'Today', disabled: b.isThisWeek, onclick: function () { week = R.today(); app.render(); } })
      ]),
      h('label', { class: 'toggle' }, [
        h('input', { type: 'checkbox', checked: only, onchange: function (ev) { setOnlyDue(ev.target.checked); app.render(); } }),
        ' Only tools with something this week'
      ])
    ]);

    var rows = b.rows.filter(function (r) { return !only || r.hasItems; });
    var table = h('table', { class: 'grid' }, [
      h('thead', {}, h('tr', {}, [h('th', { class: 'tool-col', text: 'Tool' })].concat(b.days.map(function (d) {
        return h('th', { class: d === today ? 'is-today' : '' }, [h('span', { class: 'dname', text: R.dayName(d).slice(0, 3) }), ' ', R.shortDate(d)]);
      })))),
      h('tbody', {}, rows.length ? rows.map(function (r) { return row(r, b, today, app); })
        : h('tr', {}, h('td', { colspan: '6', class: 'empty', text: b.rows.length ? 'Nothing planned this week.' : 'No tools yet. An Admin adds tools in Settings.' })))
    ]);

    var legend = h('div', { class: 'legend' }, ['upcoming', 'today', 'overdue', 'postponed', 'done', 'down', 'projected'].map(function (s) {
      return h('span', { class: 'chip static s-' + s }, [h('span', { class: 'ico', text: LABEL[s][0] }), LABEL[s][1]]);
    }));

    U.add(root, [bar, h('div', { class: 'grid-wrap' }, table), legend]);
  }

  function row(r, b, today, app) {
    var t = r.tool;
    var head = h('th', { class: 'tool-col', scope: 'row' }, [
      h('button', { class: 'tool-name', text: t.name, title: 'Tool details', onclick: function () { toolPanel(t.id, app); } }),
      t.status === 'down' ? h('span', { class: 'badge down', text: 'DOWN' }) : null,
      h('div', { class: 'sched', text: R.describeSchedule(t) })
    ]);
    return h('tr', { class: t.status === 'down' ? 'is-down' : '' }, [head].concat(r.cells.map(function (items, i) {
      return h('td', { class: b.days[i] === today ? 'is-today' : '' }, items.map(function (it) { return chip(it, app); }));
    })));
  }

  function chip(it, app) {
    var l = LABEL[it.status];
    if (it.kind === 'projected') return h('span', { class: 'chip s-projected', title: 'Planned by the schedule', text: l[1] });
    var t = it.task, text = l[1];
    if (it.carried) text = 'Overdue since ' + R.shortDate(it.date);
    if (it.status === 'done') {
      var u = S.current().users.find(function (x) { return x.id === t.completed_by; });
      text = 'Done' + (u ? ' · ' + u.operator_id : '');
    }
    return h('button', { class: 'chip s-' + it.status, title: 'Open', onclick: function () { taskPanel(t.id, app); } }, [
      h('span', { class: 'ico', text: l[0] }), text,
      t.is_one_off ? h('span', { class: 'tag', text: 'one-off' }) : null,
      t.completion_comment && it.status === 'done' ? h('span', { class: 'tag', title: t.completion_comment, text: '💬' }) : null
    ]);
  }

  /* --- Cleaning panel ----------------------------------------------- */

  function taskPanel(taskId, app) {
    var info = S.taskDetails(taskId);
    if (!info) { app.reload(); return; }
    var t = info.task, tool = info.tool, isAdmin = !!S.currentAdmin();
    var title = tool.name + ' · ' + R.dayName(t.due_date) + ' ' + R.longDate(t.due_date);
    var area = h('div', { class: 'action-area' });

    var facts = h('dl', { class: 'facts' }, [
      h('dt', { text: 'Status' }), h('dd', {}, h('span', { class: 'pill s-' + info.status, text: STATUS_TEXT[info.status] })),
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

    function done(msg) { U.toast(msg); m.close(); app.reload(); }
    function failHard(e) { if (e && e.code === 'conflict') { U.toast(e.message, 'error'); m.close(); app.reload(); return true; } return false; }

    function menu() {
      U.clear(area);
      var buttons = [];
      if (t.status === 'open') {
        buttons.push(h('button', { class: 'btn', text: '✓ Complete', onclick: completeForm }));
        buttons.push(h('button', { class: 'btn secondary', text: '🕓 Postpone', onclick: postponeForm }));
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
      var op = U.operatorField(S.lookupOperator);
      var comment = h('textarea', { rows: '3', maxlength: '1000', placeholder: 'Any problem? Write it here (optional)' });
      var msg = h('p', { class: 'form-error', hidden: true });
      U.clear(area);
      U.add(area, [h('h3', { text: 'Complete cleaning' }), U.field('Operator ID', op.node), U.field('Comment', comment), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: next }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      op.input.focus();
      op.input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') next(); });
      function next() {
        var u = S.lookupOperator(op.input.value);
        if (!u) { msg.textContent = op.input.value.trim() ? 'Unknown operator ID.' : 'Enter your operator ID.'; msg.hidden = false; return; }
        var opId = op.input.value, c = comment.value;
        U.confirmStep(area, 'Confirm cleaning completed for ' + tool.name + ' by ' + u.name + '?', 'Yes, completed', function () {
          return S.complete(t.id, opId, c).then(function (r) {
            done(tool.name + ' completed.' + (r.next ? ' Next cleaning: ' + R.dayName(r.next.due_date) + ' ' + R.longDate(r.next.due_date) + '.' : ''));
          }, function (e) { if (!failHard(e)) throw e; });
        }, completeForm);
      }
    }

    function postponeForm() {
      var op = U.operatorField(S.lookupOperator);
      var date = h('input', { type: 'date', min: R.today() });
      var reason = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Why? (optional), e.g. tool used by PROD' });
      var msg = h('p', { class: 'form-error', hidden: true });
      var auto = R.nextWorkingDay(R.maxDate(t.due_date, R.today()));
      U.clear(area);
      U.add(area, [h('h3', { text: 'Postpone cleaning' }), U.field('Operator ID', op.node),
        U.field('New date', date, 'Optional. Empty = next working day (' + R.dayName(auto) + ' ' + R.shortDate(auto) + '). A weekend date moves to Monday.'),
        U.field('Reason', reason), msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Continue', onclick: next }),
          h('button', { class: 'btn ghost', text: 'Cancel', onclick: menu })])]);
      op.input.focus();
      function next() {
        var u = S.lookupOperator(op.input.value);
        if (!u) { msg.textContent = op.input.value.trim() ? 'Unknown operator ID.' : 'Enter your operator ID.'; msg.hidden = false; return; }
        var d = date.value;
        if (d && d < R.today()) { msg.textContent = 'The new date cannot be in the past.'; msg.hidden = false; return; }
        var target = d ? R.toWorkingDay(d) : auto;
        var opId = op.input.value, rs = reason.value;
        U.confirmStep(area, 'Postpone ' + tool.name + ' to ' + R.dayName(target) + ' ' + R.longDate(target) + '?' +
          (d && target !== d ? ' (the chosen date is a weekend)' : ''), 'Yes, postpone', function () {
          return S.postpone(t.id, opId, d, rs).then(function (r) {
            done(tool.name + ' postponed to ' + R.dayName(r.task.due_date) + ' ' + R.longDate(r.task.due_date) + '.');
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

    menu();
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
        : [h('button', { class: 'btn danger', text: '⛔ Set tool down', onclick: downForm })]));
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
