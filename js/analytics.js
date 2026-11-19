/**
 * Hirata Cleaning Plan - analytics.js
 * Pure functions for the cleaning report and the Analytics page.
 * "On time" = done on or before the planned (schedule) date; days late are calendar days.
 */
window.HCP = window.HCP || {};
window.HCP.analytics = (function () {
  'use strict';

  var R = window.HCP.rules;

  function byId(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }

  /** One row per cleaning in [from, to] (by planned date, done date, or still open). */
  /** kind: 'cleaning' (default) or 'pm' (PLAN 13e). */
  function reportRows(data, from, to, today, kind) {
    var tools = byId(data.tools), users = byId(data.users);
    var rows = [];
    data.tasks.forEach(function (t) {
      var tool = tools[t.tool_id];
      if (!tool || !R.ofKind(tool, kind || 'cleaning')) return;
      var doneDate = t.status === 'completed' ? String(t.completed_at).slice(0, 10) : '';
      var planned = t.pattern_date;
      var inRange = function (d) { return d && d >= from && d <= to; };
      var include = inRange(planned) || inRange(doneDate) || (t.status === 'open' && t.due_date <= to && t.due_date <= today && t.due_date >= from);
      if (t.status === 'open' && planned > today && t.due_date > today) include = include && inRange(planned);
      if (!include) return;
      var late = 0, status;
      if (t.status === 'completed') {
        late = Math.max(0, R.diffDays(planned, doneDate));
        status = late ? 'Done late' : 'Done on time';
      } else if (R.downOn(tool, today)) {
        status = 'Tool down';
      } else if (t.due_date < today) {
        late = Math.max(0, R.diffDays(planned, today));
        status = 'Overdue';
      } else {
        status = t.postpone_count ? 'Postponed' : 'Open';
      }
      var u = users[t.completed_by];
      rows.push({
        tool: tool.name, mnt_owner: tool.mnt_owner || '', planned: planned, due: t.due_date, done: doneDate,
        time: t.status === 'completed' ? String(t.completed_at).slice(11, 16) : '',
        days_late: late, who: u ? u.name : '', postponed: t.postpone_count || 0,
        reason: t.last_postpone_reason || '', comment: t.completion_comment || '', status: status,
        one_off: !!t.is_one_off, schedule: t.is_one_off ? 'One-off' : R.describeSchedule(tool)
      });
    });
    return rows.sort(function (a, b) { return a.planned < b.planned ? -1 : a.planned > b.planned ? 1 : a.tool.localeCompare(b.tool); });
  }

  function pct(a, b) { return b ? Math.round(100 * a / b) : null; }

  /** Everything the Analytics page shows, for the period [from, to]. */
  function stats(data, from, to, today, kind) {
    var rows = reportRows(data, from, to, today, kind);
    var toolById = byId(data.tools);
    var done = rows.filter(function (r) { return r.done; });
    var onTime = done.filter(function (r) { return !r.days_late; });
    var lateDays = done.reduce(function (s, r) { return s + r.days_late; }, 0);

    var tools = {};
    rows.forEach(function (r) {
      var t = tools[r.tool] || (tools[r.tool] = { tool: r.tool, total: 0, done: 0, onTime: 0, lateDays: 0, postponed: 0, overdue: 0 });
      t.total++;
      if (r.done) { t.done++; if (!r.days_late) t.onTime++; t.lateDays += r.days_late; }
      if (r.status === 'Overdue') t.overdue++;
      t.postponed += r.postponed;
    });
    var byTool = Object.keys(tools).sort().map(function (k) {
      var t = tools[k];
      t.onTimePct = pct(t.onTime, t.done);
      t.avgLate = t.done ? Math.round(10 * t.lateDays / t.done) / 10 : null;
      return t;
    });

    // weeks: done on time / late per ISO week (by done date)
    var weeks = {};
    for (var m = R.mondayOf(from); m <= to; m = R.addDays(m, 7)) weeks[m] = { monday: m, week: R.isoWeek(m), onTime: 0, late: 0 };
    done.forEach(function (r) { var w = weeks[R.mondayOf(r.done)]; if (w) { if (r.days_late) w.late++; else w.onTime++; } });
    var byWeek = Object.keys(weeks).sort().map(function (k) { return weeks[k]; });

    var ops = {};
    done.forEach(function (r) { var o = ops[r.who || '(unknown)'] || (ops[r.who || '(unknown)'] = { who: r.who || '(unknown)', done: 0, onTime: 0 }); o.done++; if (!r.days_late) o.onTime++; });
    var byOperator = Object.keys(ops).map(function (k) { return ops[k]; }).sort(function (a, b) { return b.done - a.done || a.who.localeCompare(b.who); });

    // postpone reasons from the history (every postponement counts once)
    var reasons = {};
    data.history.forEach(function (h) {
      if (h.action !== 'postponed' || !R.ofKind(toolById[h.tool_id], kind || 'cleaning')) return;
      var d = h.at.slice(0, 10);
      if (d < from || d > to) return;
      var key = (h.reason || '').trim();
      var label = key ? key.charAt(0).toUpperCase() + key.slice(1) : '(no reason given)';
      var k = label.toLowerCase();
      (reasons[k] = reasons[k] || { reason: label, count: 0 }).count++;
    });
    var topReasons = Object.keys(reasons).map(function (k) { return reasons[k]; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);

    return {
      from: from, to: to, rows: rows,
      kpi: {
        planned: rows.length, done: done.length, onTimePct: pct(onTime.length, done.length),
        avgLate: done.length ? Math.round(10 * lateDays / done.length) / 10 : null,
        postponements: topReasons.reduce(function (s, r) { return s + r.count; }, 0),
        overdueNow: rows.filter(function (r) { return r.status === 'Overdue'; }).length
      },
      byTool: byTool, byWeek: byWeek, byOperator: byOperator, topReasons: topReasons
    };
  }

  /** Magazines (13h): checks, cleaning and repairs in [from, to]. */
  function magStats(data, from, to, today, weeks) {
    var mags = (data.magazines || []).filter(function (m) { return !m.archived; });
    var magById = byId(data.magazines || []);
    var ev = (data.mag_events || []).filter(function (e) { return e.date >= from && e.date <= to; });
    var checks = ev.filter(function (e) { return e.kind === 'check'; });
    var repairsDone = ev.filter(function (e) { return e.kind === 'repair_done'; });
    var reported = checks.filter(function (e) { return e.repair_needed; });
    var repairDays = repairsDone.filter(function (e) { return e.repair_since; }).map(function (e) { return Math.max(0, R.diffDays(e.repair_since, e.date)); });

    var weeksMap = {};
    for (var m = R.mondayOf(from); m <= to; m = R.addDays(m, 7)) weeksMap[m] = { monday: m, week: R.isoWeek(m), onTime: 0, late: 0 };
    checks.forEach(function (e) { var w = weeksMap[R.mondayOf(e.date)]; if (w) { if (e.cleaned) w.onTime++; else w.late++; } });

    var people = {};
    ev.forEach(function (e) { var k = e.by_name || '(unknown)'; var p = people[k] || (people[k] = { who: k, checks: 0, repairs: 0 }); if (e.kind === 'check') p.checks++; else p.repairs++; });
    var perMag = {};
    reported.forEach(function (e) { var mm = magById[e.magazine_id]; if (!mm) return; (perMag[mm.sn] = perMag[mm.sn] || { sn: mm.sn, count: 0 }).count++; });

    var open = mags.filter(function (x) { return x.needs_repair; }).map(function (x) {
      return { sn: x.sn, since: x.repair_since, days: x.repair_since ? R.diffDays(x.repair_since, today) : null, note: x.repair_note };
    }).sort(function (a, b) { return (b.days || 0) - (a.days || 0); });

    return {
      kpi: {
        magazines: mags.length, checks: checks.length, cleaned: checks.filter(function (e) { return e.cleaned; }).length,
        checkedMags: Object.keys(checks.reduce(function (s, e) { s[e.magazine_id] = 1; return s; }, {})).length,
        reported: reported.length, repaired: repairsDone.length, openRepairs: open.length,
        avgRepairDays: repairDays.length ? Math.round(10 * repairDays.reduce(function (s, x) { return s + x; }, 0) / repairDays.length) / 10 : null,
        dueNow: mags.filter(function (x) { var st = R.magStatus(x, today, weeks); return st === 'due' || st === 'never'; }).length
      },
      byWeek: Object.keys(weeksMap).sort().map(function (k) { return weeksMap[k]; }),
      byPerson: Object.keys(people).map(function (k) { return people[k]; }).sort(function (a, b) { return (b.checks + b.repairs) - (a.checks + a.repairs); }),
      byMagazine: Object.keys(perMag).map(function (k) { return perMag[k]; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10),
      openRepairs: open,
      events: ev
    };
  }

  /** Period presets -> {from, to} */
  function period(key, today) {
    if (key === 'month') return { from: R.addDays(today, -30), to: today };
    if (key === 'quarter') return { from: R.addDays(today, -91), to: today };
    if (key === 'year') return { from: R.addDays(today, -365), to: today };
    return { from: R.addDays(today, -27), to: today };   // 4 weeks
  }

  return { reportRows: reportRows, stats: stats, magStats: magStats, period: period };
})();
