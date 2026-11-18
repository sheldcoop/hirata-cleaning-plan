/**
 * Hirata Cleaning Plan - views/settings.js  (Admin only)
 * Tabs: Tools, Users, One-off cleaning, General.
 */
window.HCP = window.HCP || {};
window.HCP.views = window.HCP.views || {};
window.HCP.views.settings = (function () {
  'use strict';

  var R = window.HCP.rules, S = window.HCP.store, U = window.HCP.ui, h = U.h;
  var tab = 'tools';
  var showArchived = false;

  function render(root, app) {
    var tabs = [['tools', 'Tools'], ['users', 'Users'], ['oneoff', 'One-off cleaning'], ['general', 'General']];
    var nav = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
      return h('button', { class: 'tab' + (tab === t[0] ? ' active' : ''), role: 'tab', 'aria-selected': String(tab === t[0]), text: t[1],
        onclick: function () { tab = t[0]; app.render(); } });
    }));
    var body = h('div', { class: 'tab-body' });
    U.add(root, [h('h2', { text: 'Settings' }), nav, body]);
    ({ tools: tools, users: users, oneoff: oneoff, general: general })[tab](body, app);
  }

  /* --- Tools -------------------------------------------------------- */

  function nextCleaning(toolId) {
    var t = S.current().tasks.filter(function (x) { return x.tool_id === toolId && x.status === 'open'; })
      .sort(function (a, b) { return a.due_date < b.due_date ? -1 : 1; })[0];
    return t ? R.dayName(t.due_date).slice(0, 3) + ' ' + R.longDate(t.due_date) : '–';
  }

  function tools(body, app) {
    var list = S.current().tools.filter(function (t) { return showArchived || !t.archived; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    U.add(body, [
      h('div', { class: 'row-bar' }, [
        h('button', { class: 'btn', text: '+ Add tool', onclick: function () { toolForm(null, app); } }),
        h('label', { class: 'toggle' }, [h('input', { type: 'checkbox', checked: showArchived, onchange: function (e) { showArchived = e.target.checked; app.render(); } }), ' Show archived tools'])
      ]),
      h('div', { class: 'grid-wrap' }, h('table', { class: 'list' }, [
        h('thead', {}, h('tr', {}, ['Tool', 'Schedule', 'Next cleaning', 'Tool owner', 'MNT owner', 'Status', ''].map(function (c) { return h('th', { text: c }); }))),
        h('tbody', {}, list.length ? list.map(function (t) {
          return h('tr', { class: t.archived ? 'is-archived' : '' }, [
            h('td', { class: 'strong', text: t.name }), h('td', { text: R.describeSchedule(t) }),
            h('td', { text: t.archived ? '–' : nextCleaning(t.id) }), h('td', { text: t.tool_owner || '–' }), h('td', { text: t.mnt_owner || '–' }),
            h('td', {}, t.archived ? h('span', { class: 'pill s-projected', text: 'Archived' })
              : h('span', { class: 'pill ' + (t.status === 'down' ? 's-down' : 's-upcoming'), text: t.status === 'down' ? 'Down' : 'Active' })),
            h('td', { class: 'row-actions' }, [
              h('button', { class: 'btn small ghost', text: 'Edit', onclick: function () { toolForm(t, app); } }),
              !t.archived ? h('button', { class: 'btn small ghost', text: t.status === 'down' ? 'Reactivate' : 'Tool down', onclick: function () { window.HCP.views.board.toolPanel(t.id, app); } }) : null,
              h('button', { class: 'btn small ghost', text: t.archived ? 'Restore' : 'Archive', onclick: function () { archive(t, app); } })
            ])
          ]);
        }) : h('tr', {}, h('td', { colspan: '7', class: 'empty', text: 'No tools.' })))
      ]))
    ]);
  }

  function archive(t, app) {
    var area = h('div');
    U.modal((t.archived ? 'Restore ' : 'Archive ') + t.name, area);
    U.confirmStep(area, t.archived ? 'Restore ' + t.name + '? It comes back on the board with its schedule.'
      : 'Archive ' + t.name + '? It disappears from the board. Its history is kept and it can be restored.',
      t.archived ? 'Yes, restore' : 'Yes, archive', function () {
        return S.archiveTool(t.id, !t.archived).then(function () { U.closeModal(); U.toast(t.name + (t.archived ? ' restored.' : ' archived.')); app.reload(); });
      }, U.closeModal, !t.archived);
  }

  function toolForm(t, app) {
    var isNew = !t;
    t = t || { name: '', tool_owner: '', mnt_owner: '', schedule_type: 'weeks', interval: 2, weekday: 2, month_day: 1, start_date: R.today() };
    var name = h('input', { type: 'text', value: t.name, maxlength: '40', placeholder: 'e.g. LAC901' });
    var owner = h('input', { type: 'text', value: t.tool_owner, maxlength: '80' });
    var mnt = h('input', { type: 'text', value: t.mnt_owner, maxlength: '80' });
    var type = h('select', {}, [h('option', { value: 'weeks', text: 'Weeks', selected: t.schedule_type === 'weeks' }), h('option', { value: 'months', text: 'Months', selected: t.schedule_type === 'months' })]);
    var interval = h('input', { type: 'number', min: '1', max: '52', step: '1', value: t.interval, class: 'num' });
    var weekday = h('select', {}, [1, 2, 3, 4, 5].map(function (n) { return h('option', { value: n, text: R.DAY_NAMES[n], selected: t.weekday === n }); }));
    var monthDay = h('input', { type: 'number', min: '1', max: '31', step: '1', value: t.month_day || 1, class: 'num' });
    var start = h('input', { type: 'date', value: t.start_date });
    var wdField = U.field('On weekday', weekday);
    var mdField = U.field('On day of month', monthDay, '29–31: last day in shorter months. Weekend → next Monday.');
    var preview = h('p', { class: 'preview' });
    var msg = h('p', { class: 'form-error', hidden: true });

    function values() {
      return { id: isNew ? undefined : t.id, name: name.value, tool_owner: owner.value, mnt_owner: mnt.value,
        schedule_type: type.value, interval: parseInt(interval.value, 10), weekday: parseInt(weekday.value, 10),
        month_day: parseInt(monthDay.value, 10), start_date: start.value };
    }
    function update() {
      var v = values();
      wdField.hidden = v.schedule_type !== 'weeks';
      mdField.hidden = v.schedule_type !== 'months';
      var probe = { schedule_type: v.schedule_type, interval: v.interval, weekday: v.schedule_type === 'weeks' ? v.weekday : null,
        month_day: v.schedule_type === 'months' ? v.month_day : null, start_date: v.start_date };
      var e = R.validateSchedule(probe);
      preview.textContent = e ? e : R.describeSchedule(probe) + '. Next cleanings: ' +
        R.previewDates(probe, isNew ? v.start_date : R.maxDate(v.start_date, R.today()), 5).map(function (d) { return R.dayName(d).slice(0, 3) + ' ' + R.shortDate(d); }).join(', ');
      preview.className = 'preview' + (e ? ' bad' : '');
    }
    [type, interval, weekday, monthDay, start].forEach(function (el) { el.addEventListener('input', update); el.addEventListener('change', update); });

    var save = h('button', { class: 'btn', text: isNew ? 'Add tool' : 'Save changes' });
    save.addEventListener('click', function () {
      save.disabled = true;
      S.saveTool(values()).then(function (saved) {
        U.closeModal(); U.toast(saved.name + (isNew ? ' added.' : ' saved.')); app.reload();
      }).catch(function (e) { msg.textContent = U.errorText(e); msg.hidden = false; save.disabled = false; });
    });

    U.modal(isNew ? 'Add tool' : 'Edit ' + t.name, [
      h('div', { class: 'form-grid' }, [
        U.field('Tool name', name), U.field('Tool owner', owner), U.field('MNT owner', mnt),
        U.field('Repeat in', type), U.field('Every', interval, 'weeks or months'), wdField, mdField,
        U.field('Start date', start, isNew ? 'The first cleaning is the first schedule date on or after this.' : 'Changing the schedule moves the open cleaning to the new pattern.')
      ]),
      preview, msg,
      h('div', { class: 'actions' }, [save, h('button', { class: 'btn ghost', text: 'Cancel', onclick: U.closeModal })])
    ], { wide: true });
    update();
  }

  /* --- Users -------------------------------------------------------- */

  function users(body, app) {
    var list = S.current().users.slice().sort(function (a, b) { return a.operator_id.localeCompare(b.operator_id); });
    U.add(body, [
      h('div', { class: 'row-bar' }, [h('button', { class: 'btn', text: '+ Add user', onclick: function () { userForm(null, app); } })]),
      h('p', { class: 'muted', text: 'Operators type their operator ID when they complete or postpone. Admins log in with their ID and PIN.' }),
      h('div', { class: 'grid-wrap' }, h('table', { class: 'list' }, [
        h('thead', {}, h('tr', {}, ['Operator ID', 'Name', 'Role', 'Status', ''].map(function (c) { return h('th', { text: c }); }))),
        h('tbody', {}, list.map(function (u) {
          return h('tr', { class: u.active ? '' : 'is-archived' }, [
            h('td', { class: 'strong mono', text: u.operator_id }), h('td', { text: u.name }),
            h('td', { text: u.role === 'admin' ? 'Admin' : 'Operator' }), h('td', { text: u.active ? 'Active' : 'Inactive' }),
            h('td', { class: 'row-actions' }, h('button', { class: 'btn small ghost', text: 'Edit', onclick: function () { userForm(u, app); } }))
          ]);
        }))
      ]))
    ]);
  }

  function userForm(u, app) {
    var isNew = !u;
    u = u || { operator_id: '', name: '', role: 'operator', active: true, pin_hash: null };
    var opId = h('input', { type: 'text', value: u.operator_id, maxlength: '20', placeholder: 'e.g. OP003', class: 'mono' });
    var name = h('input', { type: 'text', value: u.name, maxlength: '80' });
    var role = h('select', {}, [h('option', { value: 'operator', text: 'Operator', selected: u.role !== 'admin' }), h('option', { value: 'admin', text: 'Admin', selected: u.role === 'admin' })]);
    var active = h('input', { type: 'checkbox', checked: u.active });
    var pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'new-password' });
    var pinField = U.field('PIN (4–8 digits)', pin, u.pin_hash ? 'Leave empty to keep the current PIN.' : 'Needed for Admins.');
    var msg = h('p', { class: 'form-error', hidden: true });
    function update() { pinField.hidden = role.value !== 'admin'; }
    role.addEventListener('change', update);
    var save = h('button', { class: 'btn', text: isNew ? 'Add user' : 'Save' });
    save.addEventListener('click', function () {
      save.disabled = true;
      S.saveUser({ id: isNew ? undefined : u.id, operator_id: opId.value, name: name.value, role: role.value, active: active.checked,
        pin: role.value === 'admin' ? pin.value : '' })
        .then(function (saved) { U.closeModal(); U.toast(saved.name + ' saved.'); app.reload(); })
        .catch(function (e) { msg.textContent = U.errorText(e); msg.hidden = false; save.disabled = false; });
    });
    U.modal(isNew ? 'Add user' : 'Edit ' + u.name, [
      h('div', { class: 'form-grid' }, [U.field('Operator ID', opId), U.field('Name', name), U.field('Role', role), pinField,
        h('label', { class: 'toggle' }, [active, ' Active (can complete and postpone)'])]),
      msg, h('div', { class: 'actions' }, [save, h('button', { class: 'btn ghost', text: 'Cancel', onclick: U.closeModal })])
    ]);
    update();
  }

  /* --- One-off ------------------------------------------------------ */

  function oneoff(body, app) {
    var list = S.current().tools.filter(function (t) { return !t.archived; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var tool = h('select', {}, list.map(function (t) { return h('option', { value: t.id, text: t.name }); }));
    var date = h('input', { type: 'date', min: R.today(), value: R.toWorkingDay(R.today()) });
    var note = h('input', { type: 'text', maxlength: '200', placeholder: 'Optional note, e.g. extra cleaning after service' });
    var msg = h('p', { class: 'form-error', hidden: true });
    var area = h('div');
    function form() {
      U.clear(area);
      U.add(area, [h('div', { class: 'form-grid' }, [U.field('Tool', tool), U.field('Date', date, 'Monday to Friday.'), U.field('Note', note)]), msg,
        h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Add one-off cleaning', disabled: !list.length, onclick: function () {
          var d = date.value, t = list.find(function (x) { return x.id === tool.value; });
          if (!R.isDate(d) || R.isWeekend(d) || d < R.today()) { msg.textContent = 'Choose a working day, today or later.'; msg.hidden = false; return; }
          msg.hidden = true;
          U.confirmStep(area, 'Add a one-off cleaning of ' + t.name + ' on ' + R.dayName(d) + ' ' + R.longDate(d) + '?', 'Yes, add', function () {
            return S.addOneOff(t.id, d, note.value).then(function () { U.toast('One-off cleaning added.'); app.reload(); });
          }, form);
        } }))]);
    }
    U.add(body, [h('p', { class: 'muted', text: 'A single extra cleaning outside the tool\'s schedule. It does not change the schedule.' }), area]);
    form();
  }

  /* --- General ------------------------------------------------------ */

  function general(body, app) {
    var d = S.current();
    var url = h('input', { type: 'url', value: d.settings.teams_webhook_url || '', placeholder: 'https://… (empty = off)', class: 'wide' });
    var theme = h('select', {}, [h('option', { value: 'white', text: 'Pure White', selected: d.settings.theme_default !== 'teal' }),
      h('option', { value: 'teal', text: 'Dark Teal', selected: d.settings.theme_default === 'teal' })]);
    var msg = h('p', { class: 'form-error', hidden: true });
    U.add(body, [
      h('section', { class: 'card' }, [
        h('h3', { text: 'Teams reminder' }),
        h('p', { class: 'muted', text: 'Once per working day, the first person who opens the app sends "due today and overdue" to this Teams channel. Create the URL in Teams: channel → Workflows → "Post to a channel when a webhook request is received".' }),
        U.field('Teams webhook URL', url),
        U.field('Default theme', theme, 'Each person can still switch with the button in the top bar.'),
        msg,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Save', onclick: function () {
            S.saveSettings({ teams_webhook_url: url.value, theme_default: theme.value })
              .then(function () { U.toast('Settings saved.'); app.reload(); })
              .catch(function (e) { msg.textContent = U.errorText(e); msg.hidden = false; });
          } }),
          h('button', { class: 'btn ghost', text: 'Send test message', disabled: !d.settings.teams_webhook_url, onclick: function () {
            var s = R.dailySummary(S.current(), R.today());
            app.postTeams(d.settings.teams_webhook_url, S.teamsPayload(s, R.today()))
              .then(function () { U.toast('Test message sent. Check the Teams channel.'); })
              .catch(function (e) { U.toast(U.errorText(e), 'error'); });
          } })
        ])
      ]),
      h('section', { class: 'card' }, [
        h('h3', { text: 'Data' }),
        h('dl', { class: 'facts' }, [
          h('dt', { text: 'Data folder' }), h('dd', { text: app.folderLabel() || '–' }),
          h('dt', { text: 'Last saved' }), h('dd', { text: (d.saved_at || '').replace('T', ' ') + (d.saved_by ? ' by ' + d.saved_by : '') }),
          h('dt', { text: 'Revision' }), h('dd', { text: String(d.revision) }),
          h('dt', { text: 'Contents' }), h('dd', { text: d.tools.length + ' tools, ' + d.users.length + ' users, ' + d.tasks.length + ' cleanings, ' + d.history.length + ' history entries' })
        ]),
        h('p', { class: 'muted', text: 'Backup: every save keeps the previous version as hirata_data.prev.json. For a full backup, copy the data folder.' }),
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn ghost', text: 'Add demo operators (OP001, OP002)', onclick: function () {
            S.loadDemo().then(function (added) { U.toast(added.length ? 'Added ' + added.join(', ') + '.' : 'Demo operators already exist.'); app.reload(); })
              .catch(function (e) { U.toast(U.errorText(e), 'error'); });
          } })
        ])
      ])
    ]);
  }

  return { render: render };
})();
