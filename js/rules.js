/**
 * Hirata Cleaning Plan - rules.js
 *
 * ALL date, schedule and status logic (PLAN.md section 6, R1-R16).
 * Pure functions: no file access, no DOM. Dates are 'YYYY-MM-DD' strings
 * (local Europe/Vienna date); weekday numbers: 1 = Monday ... 7 = Sunday.
 */
window.HCP = window.HCP || {};
window.HCP.rules = (function () {
  'use strict';

  var DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* --- Date helpers ------------------------------------------------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(d) { var p = d.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function fmt(dt) { return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate()); }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s; }
  function addDays(d, n) { var x = parse(d); x.setUTCDate(x.getUTCDate() + n); return fmt(x); }
  function weekday(d) { var w = parse(d).getUTCDay(); return w === 0 ? 7 : w; }
  function isWeekend(d) { return weekday(d) > 5; }
  /** Weekend -> following Monday; working days unchanged. */
  function toWorkingDay(d) { var w = weekday(d); return w === 6 ? addDays(d, 2) : w === 7 ? addDays(d, 1) : d; }
  /** First working day strictly after d. */
  function nextWorkingDay(d) { return toWorkingDay(addDays(d, 1)); }
  /** Weekend -> previous Friday (used to place a weekend completion in the grid). */
  function toPrevWorkingDay(d) { var w = weekday(d); return w === 6 ? addDays(d, -1) : w === 7 ? addDays(d, -2) : d; }
  function mondayOf(d) { return addDays(d, 1 - weekday(d)); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }   // m: 1-12
  /** Day `day` of month m (m may run past 12), clamped to the month's last day. */
  function monthDate(y, m, day) {
    y += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    return y + '-' + pad(m) + '-' + pad(Math.min(day, daysInMonth(y, m)));
  }
  function maxDate(a, b) { return a > b ? a : b; }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }   // b - a in days

  /** Today's local date (R16). config.fixed_today overrides it (tests). */
  function today() {
    var c = window.HCP.config;
    if (c && c.fixed_today) return c.fixed_today;
    var n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }

  /** ISO week number (for "Week 47"). */
  function isoWeek(d) {
    var x = parse(d);
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil(((x - yearStart) / 864e5 + 1) / 7);
  }

  function shortDate(d) { return +d.slice(8, 10) + ' ' + MONTHS[+d.slice(5, 7) - 1]; }
  function longDate(d) { return shortDate(d) + ' ' + d.slice(0, 4); }
  function dayName(d) { return DAY_NAMES[weekday(d)]; }

  /* --- Schedule rules (R3, R4, R11, R13) ---------------------------- */

  /** First rule date on or after `from` -> {pattern, nominal}. nominal is the
   *  unadjusted rule date (months: before the weekend shift) so monthly
   *  schedules never drift. */
  function firstRuleDate(tool, from) {
    if (tool.schedule_type === 'months') {
      var y = +from.slice(0, 4), m = +from.slice(5, 7);
      for (var i = 0; i < 36; i++) {
        var nom = monthDate(y, m + i, tool.month_day);
        var adj = toWorkingDay(nom);
        if (adj >= from) return { pattern: adj, nominal: nom };
      }
    }
    var d = from;
    while (weekday(d) !== tool.weekday) d = addDays(d, 1);
    return { pattern: d, nominal: d };
  }

  /** The rule occurrence after the one whose nominal date is given. */
  function stepRule(tool, nominal) {
    if (tool.schedule_type === 'months') {
      var nom = monthDate(+nominal.slice(0, 4), +nominal.slice(5, 7) + tool.interval, tool.month_day);
      return { pattern: toWorkingDay(nom), nominal: nom };
    }
    var p = addDays(nominal, 7 * tool.interval);
    return { pattern: p, nominal: p };
  }

  /** Exceptions (R19): an Admin moved or skipped one future cycle of a tool.
   *  exception: {id, tool_id, nominal, action: 'move'|'skip', new_date} - matched by the cycle's nominal date. */
  function exceptionFor(exceptions, toolId, nominal) {
    return (exceptions || []).find(function (e) { return e.tool_id === toolId && e.nominal === nominal; }) || null;
  }

  /** R4: next cleaning after a completion - back to the pattern, strictly after the completion date,
   *  with exceptions applied (skipped cycles are passed over, a moved cycle gets its new date).
   *  -> {pattern, nominal, due, used: [exception ids consumed]} */
  function nextAfterCompletion(tool, task, completionDate, exceptions) {
    var used = [];
    var r = stepRule(tool, task.nominal_date || task.pattern_date);
    for (var guard = 0; guard < 2000; guard++) {
      if (r.pattern <= completionDate) { r = stepRule(tool, r.nominal); continue; }
      var ex = exceptionFor(exceptions, tool.id, r.nominal);
      if (ex && ex.action === 'skip') { used.push(ex.id); r = stepRule(tool, r.nominal); continue; }
      if (ex && ex.action === 'move') {
        used.push(ex.id);
        if (ex.new_date > completionDate) return { pattern: r.pattern, nominal: r.nominal, due: ex.new_date, used: used };
      }
      break;
    }
    return { pattern: r.pattern, nominal: r.nominal, due: r.pattern, used: used };
  }

  /** R13: future cycles in [from, to] after the open task, with exceptions.
   *  -> [{date, pattern, nominal, moved, skipped}] (skipped ones are listed so an Admin can restore them) */
  function projected(tool, openTask, from, to, exceptions) {
    var out = [];
    if (!openTask) return out;
    var r = { nominal: openTask.nominal_date || openTask.pattern_date };
    for (var i = 0; i < 400; i++) {
      r = stepRule(tool, r.nominal);
      if (r.pattern > addDays(to, 400)) break;
      var ex = exceptionFor(exceptions, tool.id, r.nominal);
      var date = ex && ex.action === 'move' ? ex.new_date : r.pattern;
      if (r.pattern > to && date > to) { if (r.pattern > addDays(to, 60)) break; continue; }
      if (date >= from && date <= to && date > openTask.due_date) {
        out.push({ date: date, pattern: r.pattern, nominal: r.nominal, moved: !!(ex && ex.action === 'move'), skipped: !!(ex && ex.action === 'skip') });
      }
    }
    return out;
  }

  /** Next n rule dates from a date (Settings preview). */
  function previewDates(tool, from, n) {
    var out = [];
    if (validateSchedule(tool)) return out;
    var r = firstRuleDate(tool, from);
    out.push(r.pattern);
    while (out.length < n) { r = stepRule(tool, r.nominal); out.push(r.pattern); }
    return out;
  }

  function describeSchedule(tool) {
    var n = tool.interval;
    if (tool.schedule_type === 'months') {
      return (n === 1 ? 'Every month' : 'Every ' + n + ' months') + ' on day ' + tool.month_day;
    }
    return (n === 1 ? 'Every week' : 'Every ' + n + ' weeks') + ' on ' + DAY_NAMES[tool.weekday];
  }

  /** Returns an error text, or '' when the schedule fields are valid. */
  function validateSchedule(t) {
    if (t.schedule_type !== 'weeks' && t.schedule_type !== 'months') return 'Choose a schedule type.';
    if (!(Number.isInteger(t.interval) && t.interval >= 1 && t.interval <= 52)) return 'Repeat every: enter a whole number from 1 to 52.';
    if (t.schedule_type === 'weeks' && !(Number.isInteger(t.weekday) && t.weekday >= 1 && t.weekday <= 5)) return 'Choose a weekday (Monday to Friday).';
    if (t.schedule_type === 'months' && !(Number.isInteger(t.month_day) && t.month_day >= 1 && t.month_day <= 31)) return 'Day of month: enter 1 to 31.';
    if (!isDate(t.start_date)) return 'Enter a valid start date.';
    return '';
  }

  /* --- PM tools (13e) ---------------------------------------------- */

  function isPm(tool) { return !!tool && tool.kind === 'pm'; }
  /** True when the tool belongs to the list `kind` ('pm' or 'cleaning'). */
  function ofKind(tool, kind) { return kind === 'pm' ? isPm(tool) : !isPm(tool); }
  /** A tool gets scheduled tasks only when installed and its schedule is complete. */
  function hasSchedule(tool) {
    return !!tool && tool.status !== 'planned' && tool.schedule_type !== 'none' && !validateSchedule(tool);
  }
  /** Down on this date? Cleaning tools: down from the moment they were set down (no dates).
   *  PM tools: from down_from, until down_until (optional). */
  function downOn(tool, date) {
    if (!tool || tool.status !== 'down') return false;
    if (tool.down_from && date < tool.down_from) return false;
    if (tool.down_until && date > tool.down_until) return false;
    return true;
  }
  function describeAny(tool) {
    if (tool.status === 'planned') return 'Not installed';
    if (tool.schedule_type === 'none') return 'No PM';
    if (!hasSchedule(tool)) return (tool.interval ? (tool.interval === 1 ? 'Every week' : 'Every ' + tool.interval + ' weeks') + ', ' : '') + 'no start date yet';
    return describeSchedule(tool);
  }

  /* --- Magazines (13f) --------------------------------------------- */

  /** repair | never | due | ok. due = last check older than `weeks` weeks (0 = never due). */
  function magStatus(mag, todayStr, weeks) {
    if (mag.needs_repair) return 'repair';
    if (!mag.last_check) return 'never';
    if (weeks > 0 && diffDays(mag.last_check, todayStr) >= weeks * 7) return 'due';
    return 'ok';
  }

  /* --- Status (R1) -------------------------------------------------- */

  /** done | down | overdue | today | postponed | upcoming */
  function taskStatus(task, tool, todayStr) {
    if (task.status === 'completed') return 'done';
    if (tool && downOn(tool, todayStr)) return 'down';
    if (task.due_date < todayStr) return 'overdue';
    if (task.due_date === todayStr) return 'today';
    if (task.postpone_count > 0) return 'postponed';
    return 'upcoming';
  }

  /** PM tools keep the order of the Excel (pos); others (and new tools) by name. */
  function byPosThenName(a, b) {
    var pa = a.pos == null ? 1e9 : a.pos, pb = b.pos == null ? 1e9 : b.pos;
    return pa - pb || a.name.localeCompare(b.name);
  }

  /* --- Weekly board (R13, R14, R14b, R14c) -------------------------- */

  /**
   * -> { monday, days: [5 dates], rows: [{tool, cells: [[item]x5], hasItems}] }
   * item: {kind: 'task'|'projected', task?, date, status, carried?}
   */
  function buildBoard(data, weekDate, todayStr, kind) {
    var monday = mondayOf(weekDate);
    var friday = addDays(monday, 4);
    var days = [0, 1, 2, 3, 4].map(function (i) { return addDays(monday, i); });
    var thisWeek = mondayOf(todayStr) === monday;
    var carryCol = days.indexOf(toPrevWorkingDay(todayStr));

    var tools = data.tools.filter(function (t) { return !t.archived && ofKind(t, kind || 'cleaning'); })
      .sort(byPosThenName);

    var rows = tools.map(function (tool) {
      var cells = [[], [], [], [], []];
      var tasks = data.tasks.filter(function (t) { return t.tool_id === tool.id; });
      var openScheduled = null;

      tasks.forEach(function (t) {
        var st = taskStatus(t, tool, todayStr);
        if (t.status === 'completed') {
          var cd = toPrevWorkingDay(String(t.completed_at).slice(0, 10));
          var ci = days.indexOf(cd);
          if (ci >= 0) cells[ci].push({ kind: 'task', task: t, date: cd, status: 'done' });
          return;
        }
        if (!t.is_one_off) openScheduled = t;
        var di = days.indexOf(t.due_date);
        if (di >= 0) cells[di].push({ kind: 'task', task: t, date: t.due_date, status: st });
        // R14b: overdue from an earlier week also shows in today's column
        if (thisWeek && carryCol >= 0 && st === 'overdue' && t.due_date < monday) {
          cells[carryCol].push({ kind: 'task', task: t, date: t.due_date, status: 'overdue', carried: true });
        }
      });

      var openEnded = tool.status === 'down' && !tool.down_until;
      if (!openEnded && openScheduled && tool.status !== 'planned') {
        projected(tool, openScheduled, monday, friday, data.exceptions).forEach(function (p) {
          if (downOn(tool, p.date)) return;
          cells[days.indexOf(p.date)].push({ kind: 'projected', date: p.date, status: 'projected', pattern: p.pattern, nominal: p.nominal, moved: p.moved, skipped: p.skipped });
        });
      }
      var hasItems = cells.some(function (c) { return c.length > 0; });
      // PM tab: D on every working day of a down period
      var downDays = days.map(function (d) { return isPm(tool) && downOn(tool, d); });
      return { tool: tool, cells: cells, hasItems: hasItems || downDays.indexOf(true) >= 0, downDays: downDays };
    });

    return { monday: monday, days: days, rows: rows, isThisWeek: thisWeek };
  }

  /** Tasks for the daily Teams message: overdue + due today, active tools. */
  function dailySummary(data, todayStr) {
    var out = { overdue: [], today: [] };
    data.tasks.forEach(function (t) {
      if (t.status !== 'open') return;
      var tool = data.tools.find(function (x) { return x.id === t.tool_id; });
      if (!tool || tool.archived || isPm(tool) || downOn(tool, todayStr)) return;
      if (t.due_date < todayStr) out.overdue.push({ tool: tool.name, date: t.due_date });
      else if (t.due_date === todayStr) out.today.push({ tool: tool.name, date: t.due_date });
    });
    var byName = function (a, b) { return a.tool.localeCompare(b.tool); };
    out.overdue.sort(byName); out.today.sort(byName);
    return out;
  }

  return {
    pad: pad, isDate: isDate, addDays: addDays, weekday: weekday, isWeekend: isWeekend,
    toWorkingDay: toWorkingDay, nextWorkingDay: nextWorkingDay, toPrevWorkingDay: toPrevWorkingDay,
    mondayOf: mondayOf, monthDate: monthDate, maxDate: maxDate, diffDays: diffDays, today: today, isoWeek: isoWeek,
    shortDate: shortDate, longDate: longDate, dayName: dayName, DAY_NAMES: DAY_NAMES,
    firstRuleDate: firstRuleDate, stepRule: stepRule, exceptionFor: exceptionFor, nextAfterCompletion: nextAfterCompletion,
    projected: projected, previewDates: previewDates, describeSchedule: describeSchedule,
    validateSchedule: validateSchedule, taskStatus: taskStatus, buildBoard: buildBoard,
    dailySummary: dailySummary, isPm: isPm, ofKind: ofKind, hasSchedule: hasSchedule, downOn: downOn, describeAny: describeAny, magStatus: magStatus, byPosThenName: byPosThenName
  };
})();
