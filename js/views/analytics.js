/**
 * Hirata Cleaning Plan - views/analytics.js
 * Three tabs (Cleaning, PM, Magazines): KPIs and charts for a period, plus the downloads.
 */
window.HCP = window.HCP || {};
window.HCP.views = window.HCP.views || {};
window.HCP.views.analytics = (function () {
  'use strict';

  var R = window.HCP.rules, S = window.HCP.store, U = window.HCP.ui, A = window.HCP.analytics, I = window.HCP.icon, h = U.h;
  var preset = 'weeks4';
  var custom = null;   // {from, to}
  var tab = 'cleaning';   // cleaning | pm | mags
  var WORD = { cleaning: ['Cleanings', 'cleaning', 'cleanings'], pm: ['PMs', 'PM', 'PMs'] };

  function range() {
    if (preset === 'custom' && custom) return custom;
    return A.period(preset === 'weeks4' ? 'weeks' : preset, R.today());
  }

  function render(root, app) {
    var r = range();
    var tabs = h('div', { class: 'tabs an-tabs', role: 'tablist' }, [['cleaning', 'Cleaning'], ['pm', 'PM plan'], ['mags', 'Magazines']].map(function (t) {
      return h('button', { class: 'tab' + (tab === t[0] ? ' active' : ''), role: 'tab', 'aria-selected': String(tab === t[0]), text: t[1],
        onclick: function () { tab = t[0]; app.render(); } });
    }));
    if (tab === 'mags') return renderMags(root, app, r, tabs);
    var W = WORD[tab];
    var st = A.stats(S.current(), r.from, r.to, R.today(), tab);
    var k = st.kpi;

    var presets = [['weeks4', 'Last 4 weeks'], ['quarter', '3 months'], ['year', '12 months'], ['custom', 'Custom']];
    var seg = h('div', { class: 'segmented' }, presets.map(function (p) {
      return h('button', { class: preset === p[0] ? 'on' : '', text: p[1], onclick: function () {
        preset = p[0]; if (p[0] === 'custom' && !custom) custom = range(); app.render();
      } });
    }));
    var from = h('input', { type: 'date', value: r.from, onchange: function (e) { preset = 'custom'; custom = { from: e.target.value, to: (custom || r).to }; app.render(); } });
    var to = h('input', { type: 'date', value: r.to, onchange: function (e) { preset = 'custom'; custom = { from: (custom || r).from, to: e.target.value }; app.render(); } });
    var fname = 'hirata-' + r.from + '_to_' + r.to;
    var head = header(r, seg, from, to, fname, h('button', { class: 'btn ghost', onclick: function () { U.download(fname + '-' + W[1].toLowerCase() + '-report.csv', S.reportCsv(r.from, r.to, tab)); } },
      [I('download', 15), ' ' + W[1].charAt(0).toUpperCase() + W[1].slice(1) + ' report (CSV)']), '"on time" = done on or before the planned day');

    var kpis = h('div', { class: 'an-kpis' }, [
      kpi(W[0] + ' in period', k.planned, 'planned or done', 'calendar'),
      kpi('Done', k.done, k.planned ? Math.round(100 * k.done / k.planned) + '% of planned' : '–', 'check'),
      ringKpi('On time', k.onTimePct),
      kpi('Avg days late', k.avgLate == null ? '–' : k.avgLate, 'per done ' + W[1], 'clock'),
      kpi('Postponements', k.postponements, 'in period', 'skip'),
      kpi('Overdue now', k.overdueNow, k.overdueNow ? 'needs action' : 'all on track', 'exclaim', k.overdueNow ? 'bad' : '')
    ]);

    if (!st.rows.length) {
      U.add(root, [head, tabs, kpis, h('div', { class: 'card empty-card' }, [I('calendar', 30), h('p', { text: 'No ' + W[2] + ' in this period yet. Charts appear once ' + W[2] + ' are done or postponed.' })])]);
      return;
    }

    var grid = h('div', { class: 'an-grid' }, [
      card('Done per week', 'On time vs late, by the week it was done', weekChart(st.byWeek)),
      card('On-time rate per tool', 'Done on or before the planned day', bars(st.byTool.filter(function (t) { return t.done; }).map(function (t) {
        return { label: t.tool, value: t.onTimePct, text: t.onTimePct + '%', note: t.done + ' done', tone: t.onTimePct >= 90 ? 'good' : t.onTimePct >= 70 ? 'warn' : 'bad' };
      }), 100, 'Nothing done yet.')),
      card('Top postpone reasons', 'Every postponement counts once', bars(st.topReasons.map(function (x) {
        return { label: x.reason, value: x.count, text: String(x.count), tone: 'warn' };
      }), null, 'No postponements in this period.')),
      tab === 'pm'
        ? card('Overdue and postponed per tool', 'Open PMs past their day, and postponements', bars(st.byTool.filter(function (t) { return t.overdue || t.postponed; }).map(function (t) {
          return { label: t.tool, value: t.overdue + t.postponed, text: String(t.overdue + t.postponed), note: t.overdue + ' overdue, ' + t.postponed + ' postponed', tone: t.overdue ? 'bad' : 'warn' };
        }), null, 'No overdue or postponed PMs.'))
        : card('Cleanings per operator', 'Completed in the period', bars(st.byOperator.map(function (o) {
          return { label: o.who, value: o.done, text: String(o.done), note: o.onTime + ' on time', tone: 'blue' };
        }), null, 'No completed cleanings yet.'))
    ]);

    var table = h('div', { class: 'card' }, [h('h3', { text: 'Per tool' }), h('div', { class: 'grid-wrap flat' }, h('table', { class: 'list' }, [
      h('thead', {}, h('tr', {}, ['Tool', W[0], 'Done', 'On time %', 'Avg days late', 'Times postponed', 'Overdue now'].map(function (c) { return h('th', { text: c }); }))),
      h('tbody', {}, st.byTool.map(function (t) {
        return h('tr', {}, [h('td', { class: 'strong', text: t.tool }), h('td', { text: String(t.total) }), h('td', { text: String(t.done) }),
          h('td', {}, t.onTimePct == null ? '–' : h('span', { class: 'pct ' + (t.onTimePct >= 90 ? 'good' : t.onTimePct >= 70 ? 'warn' : 'bad'), text: t.onTimePct + '%' })),
          h('td', { text: t.avgLate == null ? '–' : String(t.avgLate) }), h('td', { text: String(t.postponed) }),
          h('td', { class: t.overdue ? 'bad-text' : '', text: String(t.overdue) })]);
      }))
    ]))]);

    U.add(root, [head, tabs, kpis, grid, table]);
  }

  function header(r, seg, from, to, fname, extraBtn, note) {
    return h('div', { class: 'an-head' }, [
      h('div', {}, [h('h2', { text: 'Analytics' }), h('p', { class: 'muted', text: R.longDate(r.from) + ' – ' + R.longDate(r.to) + (note ? ' · ' + note : '') })]),
      h('div', { class: 'an-controls' }, [seg, preset === 'custom' ? h('span', { class: 'range' }, [from, ' – ', to]) : null]),
      h('div', { class: 'an-downloads' }, [
        h('button', { class: 'btn', onclick: function () { U.download(fname + '.xlsx', S.workbook(r.from, r.to), window.HCP.xlsx.MIME); } }, [I('download', 15), ' Excel workbook (.xlsx)']),
        extraBtn
      ])
    ]);
  }

  /* --- Magazines tab (13h) ------------------------------------------ */

  function renderMags(root, app, r, tabs) {
    var presets = [['weeks4', 'Last 4 weeks'], ['quarter', '3 months'], ['year', '12 months'], ['custom', 'Custom']];
    var seg = h('div', { class: 'segmented' }, presets.map(function (p) {
      return h('button', { class: preset === p[0] ? 'on' : '', text: p[1], onclick: function () { preset = p[0]; if (p[0] === 'custom' && !custom) custom = range(); app.render(); } });
    }));
    var from = h('input', { type: 'date', value: r.from, onchange: function (e) { preset = 'custom'; custom = { from: e.target.value, to: (custom || r).to }; app.render(); } });
    var to = h('input', { type: 'date', value: r.to, onchange: function (e) { preset = 'custom'; custom = { from: (custom || r).from, to: e.target.value }; app.render(); } });
    var fname = 'hirata-' + r.from + '_to_' + r.to;
    var st = A.magStats(S.current(), r.from, r.to, R.today(), S.magCheckWeeks());
    var k = st.kpi;
    var head = header(r, seg, from, to, fname, h('button', { class: 'btn ghost', onclick: function () { U.download(fname + '-magazine-checks.csv', S.magCsv(r.from, r.to)); } },
      [I('download', 15), ' Magazine checks (CSV)']), k.magazines + ' magazines');
    var kpis = h('div', { class: 'an-kpis' }, [
      kpi('Checks in period', k.checks, k.checkedMags + ' of ' + k.magazines + ' magazines', 'check'),
      kpi('Cleaned', k.cleaned, k.checks ? Math.round(100 * k.cleaned / k.checks) + '% of checks' : '–', 'sparkle'),
      ringKpi('Checked', k.magazines ? Math.round(100 * k.checkedMags / k.magazines) : null, 'of all magazines in the period'),
      kpi('Repairs reported', k.reported, k.repaired + ' repaired in period', 'wrench', k.reported ? 'warn' : ''),
      kpi('Avg repair time', k.avgRepairDays == null ? '–' : k.avgRepairDays + ' d', 'from report to repair done', 'clock'),
      kpi('Open repairs', k.openRepairs, k.dueNow + ' magazines due for a check', 'exclaim', k.openRepairs ? 'bad' : '')
    ]);
    var chart = weekChart(st.byWeek, ['Cleaned', 'Checked only'], 'Magazine checks per week');
    var grid = h('div', { class: 'an-grid' }, [
      card('Checks per week', 'Cleaned vs checked only', chart),
      card('Open repairs', 'Longest open first', st.openRepairs.length ? h('table', { class: 'list compact' }, [
        h('thead', {}, h('tr', {}, ['Magazine', 'Since', 'Days', 'Problem'].map(function (c) { return h('th', { text: c }); }))),
        h('tbody', {}, st.openRepairs.map(function (o) {
          return h('tr', {}, [h('td', { class: 'strong', text: o.sn }), h('td', { text: o.since ? R.shortDate(o.since) : '–' }),
            h('td', { class: o.days > 7 ? 'bad-text' : '', text: o.days == null ? '–' : String(o.days) }), h('td', { class: 'wrap', text: o.note || '–' })]);
        }))]) : h('p', { class: 'muted', text: 'No open repairs.' })),
      card('Checks per person', 'Checks and repairs done in the period', bars(st.byPerson.map(function (p) {
        return { label: p.who, value: p.checks + p.repairs, text: String(p.checks + p.repairs), note: p.checks + ' checks, ' + p.repairs + ' repairs', tone: 'blue' };
      }), null, 'No checks in this period.')),
      card('Most repairs', 'Magazines reported for repair most often', bars(st.byMagazine.map(function (m) {
        return { label: m.sn, value: m.count, text: String(m.count), tone: 'warn' };
      }), null, 'No repairs reported in this period.'))
    ]);
    U.add(root, [head, tabs, kpis, grid]);
  }

  function kpi(label, value, sub, icon, tone) {
    return h('div', { class: 'an-kpi ' + (tone || '') }, [h('span', { class: 'an-ico' }, I(icon, 18)),
      h('div', {}, [h('div', { class: 'tile-label', text: label }), h('div', { class: 'an-num', text: String(value) }), h('div', { class: 'tile-sub', text: sub })])]);
  }
  function ringKpi(label, p, sub) {
    return h('div', { class: 'an-kpi' }, [h('div', { class: 'ring', style: '--p:' + (p || 0) }, h('span', { text: p == null ? '–' : p + '%' })),
      h('div', {}, [h('div', { class: 'tile-label', text: label }), h('div', { class: 'tile-sub', text: sub || (p == null ? 'nothing done yet' : 'of done ones') })])]);
  }
  function card(title, sub, body) {
    return h('section', { class: 'card an-card' }, [h('h3', { text: title }), h('p', { class: 'muted small', text: sub }), body]);
  }

  /** Horizontal bars: [{label, value, text, note, tone}] */
  function bars(items, max, emptyText) {
    if (!items.length) return h('p', { class: 'muted', text: emptyText });
    var m = max || Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    return h('div', { class: 'bars' }, items.map(function (i) {
      return h('div', { class: 'bar-row', title: i.label + ': ' + i.text + (i.note ? ' (' + i.note + ')' : '') }, [
        h('span', { class: 'bar-label', text: i.label }),
        h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill ' + (i.tone || 'blue'), style: 'width:' + Math.max(2, Math.round(100 * i.value / m)) + '%' })),
        h('span', { class: 'bar-val' }, [h('b', { text: i.text }), i.note ? h('small', { text: ' ' + i.note }) : null])
      ]);
    }));
  }

  /** Stacked columns per week (SVG). */
  function weekChart(weeks, labels, aria) {
    var L = labels || ['On time', 'Late'];
    var W = 560, H = 200, pad = 26, n = weeks.length || 1;
    var max = Math.max(1, Math.max.apply(null, weeks.map(function (w) { return w.onTime + w.late; })));
    var bw = Math.min(38, (W - pad * 2) / n * 0.6), step = (W - pad * 2) / n;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'week-chart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', aria || 'Done per week');
    function el(tag, attrs, text) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; svg.appendChild(e); return e; }
    var base = H - 24, top = 12, scale = (base - top) / max;
    [0, 0.5, 1].forEach(function (f) { var y = base - f * (base - top); el('line', { x1: pad, x2: W - 6, y1: y, y2: y, class: 'gridline' }); el('text', { x: pad - 6, y: y + 4, class: 'axis', 'text-anchor': 'end' }, String(Math.round(f * max))); });
    weeks.forEach(function (w, i) {
      var x = pad + i * step + (step - bw) / 2;
      var hOn = w.onTime * scale, hLate = w.late * scale;
      if (hOn) el('rect', { x: x, y: base - hOn, width: bw, height: hOn, rx: 3, class: 'col-ontime' }).appendChild(title(w.onTime + ' ' + L[0].toLowerCase()));
      if (hLate) el('rect', { x: x, y: base - hOn - hLate, width: bw, height: hLate, rx: 3, class: 'col-late' }).appendChild(title(w.late + ' ' + L[1].toLowerCase()));
      if (w.onTime + w.late) el('text', { x: x + bw / 2, y: base - hOn - hLate - 4, class: 'col-num', 'text-anchor': 'middle' }, String(w.onTime + w.late));
      el('text', { x: x + bw / 2, y: H - 8, class: 'axis', 'text-anchor': 'middle' }, 'W' + w.week);
    });
    function title(t) { var e = document.createElementNS(NS, 'title'); e.textContent = t; return e; }
    return h('div', {}, [svg, h('div', { class: 'chart-legend' }, [h('span', { class: 'sw ontime' }), L[0], h('span', { class: 'sw late' }), L[1]])]);
  }

  return { render: render };
})();
