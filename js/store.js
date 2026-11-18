/**
 * Hirata Cleaning Plan - store.js
 *
 * The ONLY module that reads/writes the plan file (through the storage
 * adapter) and the only place actions and permissions live. Screens call
 * these functions; all date logic comes from rules.js.
 *
 * Save rule R17: every action re-reads the file, applies itself to that
 * fresh copy (re-checking it is still allowed), bumps `revision`, parks the
 * old file as *.prev.json and writes. Actions in this tab run one at a time.
 */
window.HCP = window.HCP || {};
window.HCP.store = (function () {
  'use strict';

  var R = window.HCP.rules;
  var cfg = window.HCP.config;
  var SCHEMA_VERSION = 1;

  var adapter = null;
  var data = null;          // last loaded copy (for screens only, never the truth for writes)
  var admin = null;         // {user_id} while an Admin is logged in (this tab)
  var queue = Promise.resolve();
  var recovered = false;

  // Starting tools (from the Excel). Weekday and start week are placeholders spread over the
  // week so the board is balanced; the Admin sets the real schedules in Settings.
  // [name, tool owner, MNT owner, every N weeks, weekday 1=Mon..5=Fri, start week offset]
  var SEED_TOOLS = [
    ['AOP901', 'Hammad Ali', 'Breitenberger Gerhard', 2, 2, 0],
    ['BLY901', 'Marco Trummer', 'Corpuz Jomari', 1, 1, 0],
    ['LAC901', 'Peng Chongnan', 'Chen Cong', 1, 2, 0],
    ['DEY901', 'Valeriia Kyrychenko', 'Edina Vunic', 2, 4, 1],
    ['ACY901', 'Karam / Eric Zeichner', 'Breitenberger Gerhard', 2, 1, 1],
    ['DPM901', 'Jovan Tosic', 'Anand Gopal', 2, 3, 0],
    ['ECP901', 'Marcin Sliwowski', 'Mokhberi Alireza', 2, 3, 1],
    ['DFS901', 'Hammad Ali', 'Thomas Kelly', 2, 4, 0],
    ['AOI901', 'Juliet Raya', 'Khaled Ismail', 4, 5, 0],
    ['NCC901', 'Govardhna Rao Bondalapati', 'Mokhberi Alireza', 2, 2, 1],
    ['TLA901', 'Lukas Bursch', 'Aboutahir Fatima Zahra', 4, 1, 2],
    ['CPM901', 'Petar Jurjevic', 'De Los Santos Tristan', 2, 5, 1]
  ];

  // The real operators (from the cleaning plan Excel). Admins can add/edit/deactivate in Settings.
  var SEED_OPERATORS = ['Valeriia Kyrychenko', 'Mohamed Ibrahem', 'Kent Derrens Plugio', 'Anja KRALJ', 'Volodymyr SAMBURSKYI', 'Talal AL-EFFAH'];

  /* --- Small helpers ------------------------------------------------ */

  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function newId(p) { return p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function clean(s) { return s == null ? '' : String(s).trim(); }
  function find(list, id) { return list.find(function (x) { return x.id === id; }) || null; }
  function nowStamp() {
    if (cfg.fixed_today) return cfg.fixed_today + 'T12:00:00';
    var n = new Date(), p = R.pad;
    return R.today() + 'T' + p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
  }

  function setAdapter(a) { adapter = a; }
  function current() { return data; }
  function wasRecovered() { return recovered; }

  /** Find a person by user id (what the name list sends) or by short ID. */
  function findUser(d, ref) {
    var key = clean(ref).toUpperCase();
    if (!key) return null;
    return d.users.find(function (x) { return x.id === clean(ref); }) ||
      d.users.find(function (x) { return x.operator_id.toUpperCase() === key; }) || null;
  }

  function userByOperatorId(d, ref) {
    if (!clean(ref)) throw err('noid', 'Choose your name.');
    var u = findUser(d, ref);
    if (!u) throw err('badid', 'This person is not in the list any more. The board will refresh.');
    if (!u.active) throw err('badid', u.name + ' is deactivated.');
    return u;
  }

  /** Lookup for screens (no error). */
  function lookupOperator(ref) {
    if (!data) return null;
    var u = findUser(data, ref);
    return u && u.active ? u : null;
  }

  /** Active people for the name list, sorted by name. */
  function activeUsers() {
    if (!data) return [];
    return data.users.filter(function (u) { return u.active; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function admins() { return activeUsers().filter(function (u) { return u.role === 'admin'; }); }

  /** Next free short ID like OP003 (people never need to type it). */
  function nextShortId(d) {
    var n = 1;
    while (d.users.some(function (u) { return u.operator_id === 'OP' + (n < 10 ? '00' : n < 100 ? '0' : '') + n; })) n++;
    return 'OP' + (n < 10 ? '00' : n < 100 ? '0' : '') + n;
  }

  function requireAdmin(d) {
    var u = admin && find(d.users, admin.user_id);
    if (!u || !u.active || u.role !== 'admin') {
      admin = null;
      throw err('forbidden', 'Only an Admin can do this. Please log in as Admin.');
    }
    return u;
  }

  function hist(d, row) {
    d.history.push({
      id: newId('h'), tool_id: row.tool_id || null, task_id: row.task_id || null, action: row.action,
      user_id: row.user_id || null, at: nowStamp(), reason: clean(row.reason), comment: clean(row.comment),
      old_date: row.old_date || null, new_date: row.new_date || null
    });
  }

  function makeTask(toolId, r, oneOff) {
    return {
      id: newId('task'), tool_id: toolId, task_type: 'cleaning',
      pattern_date: r.pattern, nominal_date: r.nominal || r.pattern, due_date: r.pattern,
      status: 'open', is_one_off: oneOff ? 1 : 0, postpone_count: 0, last_postpone_reason: '',
      completed_by: null, completed_at: null, completion_comment: '', generated_from: null
    };
  }

  function openScheduled(d, toolId) {
    return d.tasks.find(function (t) { return t.tool_id === toolId && t.status === 'open' && !t.is_one_off; }) || null;
  }

  /** R2/R4: create the next scheduled task unless one is already open. */
  function ensureNext(d, tool, prev, completionDate) {
    if (openScheduled(d, tool.id)) return null;
    var r = R.nextAfterCompletion(tool, prev, completionDate, d.exceptions);
    var n = makeTask(tool.id, r);
    n.due_date = r.due;
    n.generated_from = prev.id;
    if (r.used.length) {
      n.used_exceptions = (d.exceptions || []).filter(function (e) { return r.used.indexOf(e.id) >= 0; });
      d.exceptions = (d.exceptions || []).filter(function (e) { return r.used.indexOf(e.id) < 0; });
    }
    d.tasks.push(n);
    return n;
  }

  /** Remove a generated task and give back the cycle exceptions it used. */
  function removeGenerated(d, task) {
    d.tasks.splice(d.tasks.indexOf(task), 1);
    if (task.used_exceptions && task.used_exceptions.length) d.exceptions = (d.exceptions || []).concat(task.used_exceptions);
  }

  /* --- PIN hashing (PBKDF2, browser Web Crypto) ---------------------- */

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  function unhex(s) { var a = new Uint8Array(s.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }

  function derive(pin, salt, iter) {
    var subtle = window.crypto.subtle;
    return subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) { return subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, key, 256); })
      .then(hex);
  }

  function hashPin(pin) {
    if (!/^\d{4,8}$/.test(String(pin || ''))) return Promise.reject(err('badpin', 'The PIN must be 4 to 8 digits.'));
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    return derive(pin, salt, 100000).then(function (h) { return 'pbkdf2$100000$' + hex(salt) + '$' + h; });
  }

  function verifyPin(pin, stored) {
    if (!stored) return Promise.resolve(false);
    var p = stored.split('$');
    return derive(pin, unhex(p[2]), +p[1]).then(function (h) { return h === p[3]; });
  }

  /* --- Load and save (R17) ------------------------------------------ */

  function parseFile(text) {
    var d = JSON.parse(text);
    if (!d || !Array.isArray(d.tools) || !Array.isArray(d.tasks)) throw new Error('not a plan file');
    return d;
  }

  /** -> plan data, or null when the folder has no plan yet. */
  function load() {
    recovered = false;
    return adapter.read(cfg.data_file).then(function (text) {
      if (text === null) { data = null; return null; }
      try { data = parseFile(text); return data; }
      catch (e) {
        return adapter.read(cfg.prev_file).then(function (prev) {
          if (prev === null) throw err('corrupt', 'The plan file is damaged and there is no backup copy.');
          data = parseFile(prev);
          recovered = true;
          return data;
        });
      }
    });
  }

  /** Run fn(freshData) and save. fn may throw to cancel. Serialized per tab. */
  function mutate(fn, who) {
    var job = queue.then(function () {
      return adapter.read(cfg.data_file).then(function (text) {
        var fresh, oldText = text;
        if (text === null) throw err('nofile', 'The plan file is missing. Reload the page.');
        try { fresh = parseFile(text); }
        catch (e) {
          // live file torn: rebuild from the backup copy
          return adapter.read(cfg.prev_file).then(function (prev) {
            if (prev === null) throw err('corrupt', 'The plan file is damaged. Ask the Admin to restore a backup.');
            return finish(parseFile(prev), prev);
          });
        }
        return finish(fresh, oldText);

        function finish(d, previousText) {
          var result = fn(d);
          d.revision = (d.revision || 0) + 1;
          d.saved_at = nowStamp();
          d.saved_by = who || null;
          return adapter.write(cfg.prev_file, previousText)
            .then(function () { return adapter.write(cfg.data_file, JSON.stringify(d, null, 1)); })
            .then(function () { data = d; return result; });
        }
      });
    });
    queue = job.catch(function () {});
    return job;
  }

  /* --- First run ---------------------------------------------------- */

  function createPlan(adminPin) {
    return adapter.read(cfg.data_file).then(function (text) {
      if (text !== null) throw err('exists', 'A plan file already exists in this folder.');
      return hashPin(adminPin);
    }).then(function (pinHash) {
      var stamp = nowStamp();
      var thisMonday = R.mondayOf(R.today());
      var d = {
        schema_version: SCHEMA_VERSION, revision: 1, created_at: stamp, saved_at: stamp, saved_by: 'ADMIN01',
        users: [{ id: newId('user'), operator_id: 'ADMIN01', name: 'Khurana', role: 'admin', pin_hash: pinHash, active: true }]
          .concat(SEED_OPERATORS.map(function (n, i) {
            return { id: newId('user'), operator_id: 'OP00' + (i + 1), name: n, role: 'operator', pin_hash: null, active: true };
          })),
        tools: [], tasks: [], history: [], exceptions: [],
        settings: { teams_webhook_url: '', last_daily_message_date: '', theme_default: 'white' }
      };
      SEED_TOOLS.forEach(function (s) {
        var tool = {
          id: newId('tool'), name: s[0], tool_owner: s[1], mnt_owner: s[2],
          schedule_type: 'weeks', interval: s[3], weekday: s[4], month_day: null,
          start_date: R.maxDate(R.today(), R.addDays(thisMonday, 7 * s[5])), status: 'active', down_reason: '', down_since: null, archived: false
        };
        tool.start_date = R.firstRuleDate(tool, tool.start_date).pattern;   // start date = first cleaning, so each tool shows its own date
        d.tools.push(tool);
        d.tasks.push(makeTask(tool.id, R.firstRuleDate(tool, tool.start_date)));
      });
      return adapter.write(cfg.data_file, JSON.stringify(d, null, 1)).then(function () { data = d; return d; });
    });
  }

  /* --- Operator actions --------------------------------------------- */

  function openTaskOrThrow(d, taskId) {
    var t = find(d.tasks, taskId);
    if (!t) throw err('conflict', 'This cleaning no longer exists. The board will refresh.');
    if (t.status !== 'open') throw err('conflict', 'This cleaning was already completed by someone else. The board will refresh.');
    return t;
  }

  /** R6 */
  function complete(taskId, operatorId, comment) {
    return mutate(function (d) {
      var u = userByOperatorId(d, operatorId);
      var t = openTaskOrThrow(d, taskId);
      var tool = find(d.tools, t.tool_id);
      var before = { status: t.status, completed_by: t.completed_by, completed_at: t.completed_at, completion_comment: t.completion_comment };
      t.status = 'completed';
      t.completed_by = u.id;
      t.completed_at = nowStamp();
      t.completion_comment = clean(comment);
      hist(d, { tool_id: t.tool_id, task_id: t.id, action: 'completed', user_id: u.id, comment: comment, old_date: t.due_date });
      var next = (!t.is_one_off && tool) ? ensureNext(d, tool, t, R.today()) : null;
      return { task: t, next: next, user: u,
        undo: { kind: 'complete', taskId: t.id, userId: u.id, nextId: next ? next.id : null, before: before } };
    }, clean(operatorId).toUpperCase());
  }

  /** R5. newDate and reason optional. -> {task, movedFromWeekend} */
  function postpone(taskId, operatorId, newDate, reason) {
    return mutate(function (d) {
      var u = userByOperatorId(d, operatorId);
      var t = openTaskOrThrow(d, taskId);
      var today = R.today(), target, moved = false;
      if (clean(newDate)) {
        if (!R.isDate(newDate)) throw err('baddate', 'Enter a valid new date.');
        target = R.toWorkingDay(newDate);
        moved = target !== newDate;
        if (target < today) throw err('baddate', 'The new date cannot be in the past.');
        if (target === t.due_date) throw err('baddate', 'The new date is the same as the current date.');
      } else {
        target = R.nextWorkingDay(R.maxDate(t.due_date, today));
      }
      var old = t.due_date;
      var before = { due_date: t.due_date, postpone_count: t.postpone_count || 0, last_postpone_reason: t.last_postpone_reason || '' };
      t.due_date = target;
      t.postpone_count = (t.postpone_count || 0) + 1;
      t.last_postpone_reason = clean(reason);
      hist(d, { tool_id: t.tool_id, task_id: t.id, action: 'postponed', user_id: u.id, reason: reason, old_date: old, new_date: target });
      return { task: t, movedFromWeekend: moved, user: u,
        undo: { kind: 'postpone', taskId: t.id, userId: u.id, newDate: target, before: before } };
    }, clean(operatorId).toUpperCase());
  }

  /** Undo a Complete or Postpone right after it (the screen offers it for a few seconds).
   *  Refused if someone changed the cleaning in the meantime. */
  function undo(token) {
    return mutate(function (d) {
      var t = find(d.tasks, token.taskId);
      var changed = err('conflict', 'Cannot undo: this cleaning was changed in the meantime.');
      if (!t) throw changed;
      if (token.kind === 'complete') {
        if (t.status !== 'completed' || t.completed_by !== token.userId) throw changed;
        var next = token.nextId ? find(d.tasks, token.nextId) : null;
        if (next && (next.status !== 'open' || next.postpone_count)) throw changed;
        if (next) removeGenerated(d, next);
        Object.assign(t, token.before);
        hist(d, { tool_id: t.tool_id, task_id: t.id, action: 'undone', user_id: token.userId, comment: 'Undo of Completed' });
      } else if (token.kind === 'postpone') {
        if (t.status !== 'open' || t.due_date !== token.newDate || t.postpone_count !== token.before.postpone_count + 1) throw changed;
        var from = t.due_date;
        Object.assign(t, token.before);
        hist(d, { tool_id: t.tool_id, task_id: t.id, action: 'undone', user_id: token.userId, comment: 'Undo of Postponed', old_date: from, new_date: t.due_date });
      } else throw err('invalid', 'Nothing to undo.');
      return t;
    }, 'undo');
  }

  /* --- Admin session ------------------------------------------------ */

  function adminLogin(operatorId, pin) {
    return load().then(function (d) {
      if (!d) throw err('nofile', 'No plan file.');
      var u = findUser(d, operatorId);
      if (!u || !u.active || u.role !== 'admin') throw err('badlogin', 'Wrong name or PIN.');
      return verifyPin(pin, u.pin_hash).then(function (ok) {
        if (!ok) throw err('badlogin', 'Wrong name or PIN.');
        admin = { user_id: u.id };
        return u;
      });
    });
  }
  /** Restore a session (same tab after reload) without the PIN. */
  function resumeAdmin(userId) {
    var u = data && find(data.users, userId);
    if (u && u.active && u.role === 'admin') { admin = { user_id: userId }; return u; }
    admin = null; return null;
  }
  function adminLogout() { admin = null; }
  function currentAdmin() {
    if (!admin || !data) return null;
    var u = find(data.users, admin.user_id);
    return u && u.active && u.role === 'admin' ? u : null;
  }

  /* --- Admin: tasks ------------------------------------------------- */

  /** R8 */
  function reopen(taskId) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var t = find(d.tasks, taskId);
      if (!t || t.status !== 'completed') throw err('conflict', 'This cleaning is not completed.');
      var latest = d.tasks.filter(function (x) { return x.tool_id === t.tool_id && x.status === 'completed'; })
        .sort(function (x, y) { return x.completed_at < y.completed_at ? 1 : -1; })[0];
      if (latest.id !== t.id) throw err('notlatest', 'Only the most recent completed cleaning of a tool can be reopened.');
      var gen = d.tasks.find(function (x) { return x.generated_from === t.id && x.status === 'open' && !x.postpone_count; });
      if (gen) removeGenerated(d, gen);
      var by = t.completed_by;
      t.status = 'open'; t.completed_by = null; t.completed_at = null; t.completion_comment = '';
      hist(d, { tool_id: t.tool_id, task_id: t.id, action: 'reopened', user_id: a.id, comment: 'Was completed by ' + userName(d, by) });
      return t;
    }, 'admin');
  }

  /** R10 edit: move an open cleaning to another working day. */
  function editTask(taskId, newDate) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var t = openTaskOrThrow(d, taskId);
      if (!R.isDate(newDate)) throw err('baddate', 'Enter a valid date.');
      if (R.isWeekend(newDate)) throw err('baddate', 'Choose a working day (Monday to Friday).');
      var old = t.due_date;
      t.due_date = newDate;
      hist(d, { tool_id: t.tool_id, task_id: t.id, action: 'task_edited', user_id: a.id, old_date: old, new_date: newDate });
      return t;
    }, 'admin');
  }

  /** R10 delete: open cleanings only; the schedule continues. */
  function deleteTask(taskId) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var t = openTaskOrThrow(d, taskId);
      d.tasks.splice(d.tasks.indexOf(t), 1);
      hist(d, { tool_id: t.tool_id, task_id: t.id, action: 'task_deleted', user_id: a.id, old_date: t.due_date });
      var tool = find(d.tools, t.tool_id);
      var next = null;
      if (!t.is_one_off && tool && !tool.archived) next = ensureNext(d, tool, t, R.addDays(R.today(), -1));
      return { next: next };
    }, 'admin');
  }

  /** R9 */
  function addOneOff(toolId, date, comment) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var tool = find(d.tools, toolId);
      if (!tool || tool.archived) throw err('notfound', 'Choose a tool.');
      if (!R.isDate(date)) throw err('baddate', 'Enter a valid date.');
      if (R.isWeekend(date)) throw err('baddate', 'Choose a working day (Monday to Friday).');
      if (date < R.today()) throw err('baddate', 'The date cannot be in the past.');
      var t = makeTask(tool.id, { pattern: date }, true);
      d.tasks.push(t);
      hist(d, { tool_id: tool.id, task_id: t.id, action: 'task_added', user_id: a.id, new_date: date, comment: comment || 'One-off cleaning' });
      return t;
    }, 'admin');
  }

  /* --- Admin: future cycles (R19) ---------------------------------- */

  /** Check that `nominal` is a real future cycle of the tool (after its open cleaning). */
  function futureCycle(d, tool, nominal) {
    var open = openScheduled(d, tool.id);
    if (!open) throw err('invalid', 'This tool has no open cleaning.');
    var r = { nominal: open.nominal_date || open.pattern_date };
    for (var i = 0; i < 600; i++) {
      r = R.stepRule(tool, r.nominal);
      if (r.nominal === nominal) return { open: open, cycle: r };
      if (r.nominal > nominal) break;
    }
    throw err('invalid', 'This is not a future cycle of ' + tool.name + '.');
  }

  function moveCycle(toolId, nominal, newDate) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var tool = find(d.tools, toolId);
      if (!tool || tool.archived) throw err('notfound', 'This tool no longer exists.');
      var fc = futureCycle(d, tool, nominal);
      if (!R.isDate(newDate) || R.isWeekend(newDate)) throw err('baddate', 'Choose a working day (Monday to Friday).');
      if (newDate < R.today()) throw err('baddate', 'The date cannot be in the past.');
      if (newDate <= fc.open.due_date) throw err('baddate', 'The new date must be after the open cleaning (' + R.longDate(fc.open.due_date) + ').');
      d.exceptions = (d.exceptions || []).filter(function (e) { return !(e.tool_id === toolId && e.nominal === nominal); });
      if (newDate !== fc.cycle.pattern) d.exceptions.push({ id: newId('ex'), tool_id: toolId, nominal: nominal, action: 'move', new_date: newDate });
      hist(d, { tool_id: toolId, action: 'cycle_moved', user_id: a.id, old_date: fc.cycle.pattern, new_date: newDate, comment: 'Future cycle moved' });
      return { from: fc.cycle.pattern, to: newDate };
    }, 'admin');
  }

  function skipCycle(toolId, nominal, reason) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var tool = find(d.tools, toolId);
      if (!tool || tool.archived) throw err('notfound', 'This tool no longer exists.');
      var fc = futureCycle(d, tool, nominal);
      d.exceptions = (d.exceptions || []).filter(function (e) { return !(e.tool_id === toolId && e.nominal === nominal); });
      d.exceptions.push({ id: newId('ex'), tool_id: toolId, nominal: nominal, action: 'skip', new_date: null });
      hist(d, { tool_id: toolId, action: 'cycle_skipped', user_id: a.id, old_date: fc.cycle.pattern, reason: reason });
      return fc.cycle.pattern;
    }, 'admin');
  }

  /** Undo a move or skip of a future cycle: back to the normal schedule date. */
  function restoreCycle(toolId, nominal) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var before = (d.exceptions || []).length;
      d.exceptions = (d.exceptions || []).filter(function (e) { return !(e.tool_id === toolId && e.nominal === nominal); });
      if (d.exceptions.length === before) throw err('conflict', 'Nothing to restore: this cycle is already on its normal date.');
      hist(d, { tool_id: toolId, action: 'cycle_restored', user_id: a.id, new_date: R.toWorkingDay(nominal), comment: 'Back to the normal schedule' });
      return true;
    }, 'admin');
  }

  /* --- Admin: tools ------------------------------------------------- */

  var TOOL_FIELDS = ['name', 'tool_owner', 'mnt_owner', 'schedule_type', 'interval', 'weekday', 'month_day', 'start_date'];

  function normalizeTool(input) {
    var t = {
      name: clean(input.name).toUpperCase(),
      tool_owner: clean(input.tool_owner),
      mnt_owner: clean(input.mnt_owner),
      schedule_type: input.schedule_type === 'months' ? 'months' : 'weeks',
      interval: parseInt(input.interval, 10),
      weekday: input.weekday == null || input.weekday === '' ? null : parseInt(input.weekday, 10),
      month_day: input.month_day == null || input.month_day === '' ? null : parseInt(input.month_day, 10),
      start_date: clean(input.start_date)
    };
    if (t.schedule_type === 'weeks') t.month_day = null; else t.weekday = null;
    return t;
  }

  function validateTool(d, t, id) {
    if (!t.name) return 'Enter the tool name.';
    if (t.name.length > 40) return 'The tool name is too long.';
    var dup = d.tools.find(function (x) { return x.id !== id && x.name.toUpperCase() === t.name; });
    if (dup) return 'A tool named "' + t.name + '" already exists' + (dup.archived ? ' (archived).' : '.');
    return R.validateSchedule(t);
  }

  /** Add (no id) or edit a tool. R3 / R11. */
  function saveTool(input) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var t = normalizeTool(input);
      var msg = validateTool(d, t, input.id);
      if (msg) throw err('invalid', msg);

      if (!input.id) {
        var tool = Object.assign({ id: newId('tool'), status: 'active', down_reason: '', down_since: null, archived: false }, t);
        d.tools.push(tool);
        d.tasks.push(makeTask(tool.id, R.firstRuleDate(tool, tool.start_date)));
        hist(d, { tool_id: tool.id, action: 'tool_changed', user_id: a.id, comment: 'Tool added: ' + R.describeSchedule(tool) });
        return tool;
      }

      var old = find(d.tools, input.id);
      if (!old) throw err('notfound', 'This tool no longer exists.');
      var changes = TOOL_FIELDS.filter(function (f) { return String(old[f]) !== String(t[f]); });
      if (!changes.length) return old;
      var scheduleChanged = changes.some(function (f) { return ['schedule_type', 'interval', 'weekday', 'month_day', 'start_date'].indexOf(f) >= 0; });
      var before = R.describeSchedule(old);
      Object.assign(old, t);
      if (scheduleChanged) d.exceptions = (d.exceptions || []).filter(function (e) { return e.tool_id !== old.id; });
      if (scheduleChanged && old.status !== 'down') {
        var open = openScheduled(d, old.id);
        if (open) {
          // R11: realign from the old pattern date (or the new start date when it changed)
          var anchor = changes.indexOf('start_date') >= 0 ? old.start_date : open.pattern_date;
          var r = R.firstRuleDate(old, anchor);
          open.pattern_date = r.pattern; open.nominal_date = r.nominal; open.due_date = r.pattern;
          open.postpone_count = 0; open.last_postpone_reason = '';
        } else {
          d.tasks.push(makeTask(old.id, R.firstRuleDate(old, R.maxDate(old.start_date, R.today()))));
        }
      }
      hist(d, { tool_id: old.id, action: 'tool_changed', user_id: a.id,
        comment: 'Changed: ' + changes.join(', ') + (scheduleChanged ? ' (' + before + ' -> ' + R.describeSchedule(old) + ')' : '') });
      return old;
    }, 'admin');
  }

  /** R12 */
  function archiveTool(toolId, archived) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var tool = find(d.tools, toolId);
      if (!tool) throw err('notfound', 'This tool no longer exists.');
      tool.archived = !!archived;
      if (!archived && tool.status !== 'down' && !openScheduled(d, tool.id)) {
        d.tasks.push(makeTask(tool.id, R.firstRuleDate(tool, R.maxDate(tool.start_date, R.today()))));
      }
      hist(d, { tool_id: tool.id, action: 'tool_changed', user_id: a.id, comment: archived ? 'Tool archived' : 'Tool restored' });
      return tool;
    }, 'admin');
  }

  /** R7 */
  function toolDown(toolId, reason) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var tool = find(d.tools, toolId);
      if (!tool) throw err('notfound', 'This tool no longer exists.');
      if (tool.status === 'down') throw err('conflict', 'This tool is already down.');
      tool.status = 'down'; tool.down_reason = clean(reason); tool.down_since = nowStamp();
      hist(d, { tool_id: tool.id, action: 'tool_down', user_id: a.id, reason: reason });
      return tool;
    }, 'admin');
  }

  function reactivate(toolId, date) {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var tool = find(d.tools, toolId);
      if (!tool) throw err('notfound', 'This tool no longer exists.');
      if (tool.status !== 'down') throw err('conflict', 'This tool is not down.');
      if (!R.isDate(date)) throw err('baddate', 'Choose the date of the next cleaning.');
      if (R.isWeekend(date)) throw err('baddate', 'Choose a working day (Monday to Friday).');
      if (date < R.today()) throw err('baddate', 'The date cannot be in the past.');
      tool.status = 'active'; tool.down_reason = ''; tool.down_since = null;
      var open = openScheduled(d, tool.id);
      if (open) {
        open.pattern_date = date; open.nominal_date = date; open.due_date = date;
        open.postpone_count = 0; open.last_postpone_reason = '';
      } else {
        open = makeTask(tool.id, { pattern: date });
        d.tasks.push(open);
      }
      if (tool.schedule_type === 'months') {
        // keep the monthly pattern: nominal = rule day of that month
        open.nominal_date = R.monthDate(+date.slice(0, 4), +date.slice(5, 7), tool.month_day);
      }
      hist(d, { tool_id: tool.id, task_id: open.id, action: 'reactivated', user_id: a.id, new_date: date });
      return tool;
    }, 'admin');
  }

  /* --- Admin: users and settings ------------------------------------ */

  function saveUser(input) {
    var pin = clean(input.pin);
    var pinStep = pin ? hashPin(pin) : Promise.resolve(null);
    return pinStep.then(function (pinHash) {
      return mutate(function (d) {
        var a = requireAdmin(d);
        var name = clean(input.name);
        var existing = input.id ? find(d.users, input.id) : null;
        var opId = clean(input.operator_id).toUpperCase() || (existing ? existing.operator_id : nextShortId(d));
        var role = input.role === 'admin' ? 'admin' : 'operator';
        var active = input.active !== false;
        if (!name) throw err('invalid', 'Enter the name.');
        if (!/^[A-Z0-9_-]{2,20}$/.test(opId)) throw err('invalid', 'Short ID: 2 to 20 letters, digits, - or _.');
        var sameName = d.users.find(function (x) { return x.id !== input.id && x.name.toLowerCase() === name.toLowerCase(); });
        if (sameName) throw err('invalid', '"' + name + '" is already in the list. Use a different name (e.g. add the first letter of the surname).');
        var dup = d.users.find(function (x) { return x.id !== input.id && x.operator_id.toUpperCase() === opId; });
        if (dup) throw err('invalid', 'Short ID "' + opId + '" is already used by ' + dup.name + '.');
        var u = input.id ? find(d.users, input.id) : null;
        if (input.id && !u) throw err('notfound', 'This user no longer exists.');
        var hasPin = pinHash || (u && u.pin_hash);
        if (role === 'admin' && !hasPin) throw err('invalid', 'An Admin needs a PIN.');
        if (u && u.role === 'admin' && u.active && (role !== 'admin' || !active)) {
          var others = d.users.filter(function (x) { return x.id !== u.id && x.role === 'admin' && x.active; });
          if (!others.length) throw err('invalid', 'There must always be at least one active Admin.');
        }
        if (!u) { u = { id: newId('user'), pin_hash: null }; d.users.push(u); }
        u.operator_id = opId; u.name = name; u.role = role; u.active = active;
        if (pinHash) u.pin_hash = pinHash;
        if (role !== 'admin') u.pin_hash = null;
        hist(d, { action: 'user_changed', user_id: a.id, comment: (input.id ? 'User changed: ' : 'User added: ') + opId + ' (' + name + ', ' + role + (active ? '' : ', inactive') + ')' });
        return u;
      }, 'admin');
    });
  }

  function saveSettings(input) {
    return mutate(function (d) {
      requireAdmin(d);
      var url = clean(input.teams_webhook_url);
      if (url && !/^https:\/\//i.test(url)) throw err('invalid', 'The Teams webhook URL must start with https://');
      d.settings.teams_webhook_url = url;
      d.settings.theme_default = input.theme_default === 'teal' ? 'teal' : 'white';
      return d.settings;
    }, 'admin');
  }

  /** Adds any of the standard operators that are missing (by name). For plans created before the list existed. */
  function addStandardOperators() {
    return mutate(function (d) {
      var a = requireAdmin(d);
      var added = [];
      SEED_OPERATORS.forEach(function (n) {
        if (d.users.some(function (u) { return u.name.toLowerCase() === n.toLowerCase(); })) return;
        d.users.push({ id: newId('user'), operator_id: nextShortId(d), name: n, role: 'operator', pin_hash: null, active: true });
        added.push(n);
      });
      if (added.length) hist(d, { action: 'user_changed', user_id: a.id, comment: 'Standard operators added: ' + added.join(', ') });
      return added;
    }, 'admin');
  }

  /* --- Reading for screens ------------------------------------------ */

  function userName(d, id) { var u = find(d.users, id); return u ? u.name : ''; }

  function board(weekDate) { return R.buildBoard(data, weekDate, R.today()); }

  var ACTION_LABELS = {
    completed: 'Completed', postponed: 'Postponed', tool_down: 'Tool down', reactivated: 'Reactivated',
    reopened: 'Reopened', task_added: 'One-off added', task_edited: 'Date changed', task_deleted: 'Cleaning deleted',
    tool_changed: 'Tool changed', user_changed: 'User changed', undone: 'Undone',
    cycle_moved: 'Future cycle moved', cycle_skipped: 'Future cycle skipped', cycle_restored: 'Future cycle restored'
  };

  /** filters: {toolId, action, from, to} (dates inclusive) */
  function history(filters) {
    var f = filters || {};
    var d = data;
    return d.history.filter(function (h) {
      var day = h.at.slice(0, 10);
      return (!f.toolId || h.tool_id === f.toolId) && (!f.action || h.action === f.action) &&
        (!f.from || day >= f.from) && (!f.to || day <= f.to);
    }).map(function (h) {
      var tool = find(d.tools, h.tool_id), u = find(d.users, h.user_id);
      return {
        at: h.at, date: h.at.slice(0, 10), time: h.at.slice(11, 16), tool: tool ? tool.name : '',
        action: h.action, action_label: ACTION_LABELS[h.action] || h.action,
        who: u ? u.name : '', operator_id: u ? u.operator_id : '',
        old_date: h.old_date || '', new_date: h.new_date || '', reason: h.reason || '', comment: h.comment || ''
      };
    }).sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;                 // keep Excel from running it as a formula
    return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** UTF-8 with BOM so Excel shows umlauts correctly. */
  function historyCsv(filters) {
    var head = ['Date', 'Time', 'Tool', 'Action', 'Who', 'Short ID', 'Old date', 'New date', 'Reason', 'Comment'];
    var lines = [head.join(',')].concat(history(filters).map(function (r) {
      return [r.date, r.time, r.tool, r.action_label, r.who, r.operator_id, r.old_date, r.new_date, r.reason, r.comment].map(csvCell).join(',');
    }));
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /** Task details for the action panel. */
  function taskDetails(taskId) {
    var t = find(data.tasks, taskId);
    if (!t) return null;
    var tool = find(data.tools, t.tool_id);
    return {
      task: t, tool: tool, status: R.taskStatus(t, tool, R.today()),
      completed_by: t.completed_by ? userName(data, t.completed_by) : '',
      events: data.history.filter(function (h) { return h.task_id === t.id; }).map(function (h) {
        return { at: h.at, label: ACTION_LABELS[h.action] || h.action, who: userName(data, h.user_id),
          old_date: h.old_date, new_date: h.new_date, reason: h.reason, comment: h.comment };
      })
    };
  }

  /* --- Daily Teams message ------------------------------------------ */

  /** Sends at most once per working day (first person to open the app). */
  function maybeSendDaily(post) {
    if (!data) return Promise.resolve(false);
    var today = R.today();
    var url = data.settings && data.settings.teams_webhook_url;
    if (!url || R.isWeekend(today) || data.settings.last_daily_message_date === today) return Promise.resolve(false);
    var summary;
    return mutate(function (d) {
      if (!d.settings.teams_webhook_url || d.settings.last_daily_message_date === today) throw err('skip', 'already sent');
      d.settings.last_daily_message_date = today;
      summary = R.dailySummary(d, today);
      return d.settings.teams_webhook_url;
    }, 'daily').then(function (hook) {
      return post(hook, teamsPayload(summary, today)).then(function () { return true; });
    }).catch(function (e) { if (e.code === 'skip') return false; throw e; });
  }

  function teamsPayload(s, today) {
    var body = [{ type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: 'Hirata cleaning plan - ' + R.dayName(today) + ' ' + R.longDate(today) }];
    if (!s.overdue.length && !s.today.length) body.push({ type: 'TextBlock', text: 'Nothing due today and nothing overdue.', wrap: true });
    if (s.today.length) body.push({ type: 'TextBlock', wrap: true, text: '**Due today:** ' + s.today.map(function (x) { return x.tool; }).join(', ') });
    if (s.overdue.length) body.push({ type: 'TextBlock', wrap: true, color: 'Attention', text: '**Overdue:** ' + s.overdue.map(function (x) { return x.tool + ' (since ' + R.shortDate(x.date) + ')'; }).join(', ') });
    return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null,
      content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: body } }] };
  }

  return {
    setAdapter: setAdapter, load: load, current: current, wasRecovered: wasRecovered, createPlan: createPlan,
    complete: complete, postpone: postpone, undo: undo,
    adminLogin: adminLogin, resumeAdmin: resumeAdmin, adminLogout: adminLogout, currentAdmin: currentAdmin,
    reopen: reopen, editTask: editTask, deleteTask: deleteTask, addOneOff: addOneOff,
    moveCycle: moveCycle, skipCycle: skipCycle, restoreCycle: restoreCycle,
    saveTool: saveTool, archiveTool: archiveTool, toolDown: toolDown, reactivate: reactivate,
    saveUser: saveUser, saveSettings: saveSettings, addStandardOperators: addStandardOperators, SEED_OPERATORS: SEED_OPERATORS,
    board: board, history: history, historyCsv: historyCsv, taskDetails: taskDetails, lookupOperator: lookupOperator, activeUsers: activeUsers, admins: admins,
    maybeSendDaily: maybeSendDaily, teamsPayload: teamsPayload, ACTION_LABELS: ACTION_LABELS,
    _verifyPin: verifyPin, _hashPin: hashPin
  };
})();
