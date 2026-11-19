/**
 * Hirata Cleaning Plan - views/history.js
 * Every action (who, when, why) with filters and Export CSV for Excel.
 */
window.HCP = window.HCP || {};
window.HCP.views = window.HCP.views || {};
window.HCP.views.history = (function () {
  'use strict';

  var R = window.HCP.rules, S = window.HCP.store, U = window.HCP.ui, h = U.h;
  var filters = { type: '', toolId: '', action: '', from: '', to: '' };
  var PAGE = 300;

  function render(root, app) {
    var d = S.current();
    var toolSel = h('select', { onchange: function (e) { filters.toolId = e.target.value; app.render(); } },
      [h('option', { value: '', text: 'All tools' })].concat(d.tools.filter(function (t) { return !filters.type || (filters.type === 'PM') === R.isPm(t); })
        .slice().sort(function (a, b) { return a.name.localeCompare(b.name) || (R.isPm(a) ? 1 : -1); }).map(function (t) {
        return h('option', { value: t.id, text: t.name + (R.isPm(t) ? ' (PM)' : '') + (t.archived ? ' (archived)' : ''), selected: filters.toolId === t.id });
      })));
    var typeSel = h('select', { onchange: function (e) { filters.type = e.target.value; filters.toolId = ''; app.render(); } },
      [['', 'Cleaning and PM'], ['Cleaning', 'Cleaning'], ['PM', 'PM']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: filters.type === o[0] }); }));
    var actSel = h('select', { onchange: function (e) { filters.action = e.target.value; app.render(); } },
      [h('option', { value: '', text: 'All actions' })].concat(Object.keys(S.ACTION_LABELS).map(function (k) {
        return h('option', { value: k, text: S.ACTION_LABELS[k], selected: filters.action === k });
      })));
    var from = h('input', { type: 'date', value: filters.from, onchange: function (e) { filters.from = e.target.value; app.render(); } });
    var to = h('input', { type: 'date', value: filters.to, onchange: function (e) { filters.to = e.target.value; app.render(); } });

    var rows = S.history(filters);
    var bar = h('div', { class: 'filters' }, [
      U.field('Type', typeSel), U.field('Tool', toolSel), U.field('Action', actSel), U.field('From', from), U.field('To', to),
      h('div', { class: 'filter-actions' }, [
        h('button', { class: 'btn ghost', text: 'Clear', onclick: function () { filters = { type: '', toolId: '', action: '', from: '', to: '' }; app.render(); } }),
        h('button', { class: 'btn', disabled: !rows.length, onclick: function () {
          U.download('hirata-history-' + R.today() + '.csv', S.historyCsv(filters));
        } }, [window.HCP.icon('download', 15), ' Export CSV'])
      ])
    ]);

    var table = h('table', { class: 'list' }, [
      h('thead', {}, h('tr', {}, ['Date', 'Time', 'Type', 'Tool', 'Action', 'Who', 'Dates', 'Reason / comment'].map(function (c) { return h('th', { text: c }); }))),
      h('tbody', {}, rows.length ? rows.slice(0, PAGE).map(function (r) {
        var dates = r.old_date && r.new_date ? R.shortDate(r.old_date) + ' → ' + R.shortDate(r.new_date) : r.old_date ? R.shortDate(r.old_date) : r.new_date ? R.shortDate(r.new_date) : '';
        return h('tr', {}, [
          h('td', { text: R.longDate(r.date) }), h('td', { text: r.time }), h('td', {}, r.type ? h('span', { class: 'type-tag ' + (r.type === 'PM' ? 'is-pm' : ''), text: r.type }) : '–'), h('td', { class: 'strong', text: r.tool || '–' }),
          h('td', {}, h('span', { class: 'act a-' + r.action, text: r.action_label })),
          h('td', { text: r.who || '–' }), h('td', { text: dates }),
          h('td', { class: 'wrap', text: [r.reason, r.comment].filter(Boolean).join(' · ') })
        ]);
      }) : h('tr', {}, h('td', { colspan: '8', class: 'empty', text: 'No history for these filters.' })))
    ]);

    U.add(root, [h('h2', { text: 'History' }), bar,
      h('p', { class: 'muted' }, ['One row per action. For one row per cleaning (planned, done, days late, who) and the Excel workbook, see ', h('a', { href: '#analytics', text: 'Analytics' }), '.']),
      h('p', { class: 'muted', text: rows.length + ' entries' + (rows.length > PAGE ? ' (showing the newest ' + PAGE + '; Export CSV has all)' : '') }),
      h('div', { class: 'grid-wrap' }, table)]);
  }

  return { render: render };
})();
