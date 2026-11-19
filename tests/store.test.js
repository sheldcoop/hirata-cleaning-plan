/** Store tests: actions, permissions, save rule (PLAN.md section 12). */
(function () {
  var R = window.HCP.rules, S = window.HCP.store, cfg = window.HCP.config;
  var T = window.T, test = T.test, eq = T.eq, ok = T.ok, rejects = T.rejects;

  function setup(today) {
    cfg.fixed_today = today || '2026-11-18';
    var mem = window.HCP.adapters.memory();
    S.setAdapter(mem);
    S.adminLogout();
    return S.createPlan('1234').then(function () { return S.adminLogin('ADMIN01', '1234'); })
      .then(function () { return mem; });
  }
  function tool(name) { return S.current().tools.find(function (t) { return t.name === name && !R.isPm(t); }); }
  function pmTool(name) { return S.current().tools.find(function (t) { return t.name === name && R.isPm(t); }); }
  function pmOpen(name) { var id = pmTool(name).id; return S.current().tasks.find(function (t) { return t.tool_id === id && t.status === 'open'; }); }
  function cleaningOnly(d) { return d.tools.filter(function (t) { return !R.isPm(t); }); }
  function openTask(name) { var id = tool(name).id; return S.current().tasks.find(function (t) { return t.tool_id === id && t.status === 'open'; }); }
  function day(d) { cfg.fixed_today = d; }

  test('first run creates Admin, the 6 real operators and 12 tools, each with one open cleaning, spread over the week', function () {
    return setup().then(function (mem) {
      var d = JSON.parse(mem.files['hirata_data.json']);
      eq(d.users.filter(function (u) { return u.role === 'operator'; }).map(function (u) { return u.name; }), S.SEED_OPERATORS);
      eq(d.users.some(function (u) { return /test/i.test(u.name); }), false);
      eq(cleaningOnly(d).length, 12);
      var cleanIds = cleaningOnly(d).map(function (t) { return t.id; });
      eq(d.tasks.filter(function (t) { return cleanIds.indexOf(t.tool_id) >= 0; }).length, 12);
      eq(d.users[0].operator_id, 'ADMIN01');
      ok(d.users[0].pin_hash.indexOf('pbkdf2$') === 0 && d.users[0].pin_hash.indexOf('1234') < 0, 'PIN is hashed');
      eq(openTask('LAC901').due_date, '2026-11-24');
      eq(openTask('BLY901').due_date, '2026-11-23');   // weekly on Monday (this Monday already passed)
      eq(openTask('TLA901').due_date, '2026-11-30');   // every 4 weeks, Monday, starts in 2 weeks
      var days = {}; cleaningOnly(d).forEach(function (t) { days[t.weekday] = 1; });
      eq(Object.keys(days).length, 5, 'Monday to Friday all used');
      cleaningOnly(d).forEach(function (t) { eq(t.start_date, d.tasks.find(function (x) { return x.tool_id === t.id; }).due_date, t.name + ' start = first cleaning'); });
      var starts = {}; cleaningOnly(d).forEach(function (t) { starts[t.start_date] = 1; });
      ok(Object.keys(starts).length >= 8, 'start dates differ between tools');
      return rejects(S.createPlan('1234'), 'exists');
    });
  });

  test('complete creates the next cleaning on the pattern and a history row', function () {
    return setup().then(function () {
      day('2026-11-26');
      return S.complete(openTask('AOP901').id, 'op001', 'all fine');
    }).then(function (r) {
      eq(r.user.name, 'Valeriia Kyrychenko');
      eq(r.next.due_date, '2026-12-08');
      var h = S.history({ action: 'completed' });
      eq(h.length, 1); eq(h[0].comment, 'all fine'); eq(h[0].operator_id, 'OP001');
    });
  });

  test('7. completing twice is refused; 8. unknown or inactive operator refused', function () {
    var id;
    return setup().then(function () {
      id = openTask('LAC901').id;
      return rejects(S.complete(id, 'NOPE'), 'badid');
    }).then(function () { return rejects(S.complete(id, ''), 'noid'); })
      .then(function () {
        var u = S.current().users.find(function (x) { return x.operator_id === 'OP002'; });
        return S.saveUser({ id: u.id, operator_id: 'OP002', name: u.name, role: 'operator', active: false });
      })
      .then(function () { return rejects(S.complete(id, 'OP002'), 'badid'); })
      .then(function () { return S.complete(id, 'OP001'); })
      .then(function () { return rejects(S.complete(id, 'OP001'), 'conflict'); });
  });

  test('4/5/6. postpone: no date -> next working day; Saturday -> Monday; count and pattern', function () {
    var id;
    return setup('2026-11-20').then(function () {           // Friday
      var t = openTask('LAC901'); id = t.id;
      return S.editTask(id, '2026-11-20');                  // due today (Friday)
    }).then(function () { return S.postpone(id, 'OP001'); })
      .then(function (r) { eq(r.task.due_date, '2026-11-23'); })
      .then(function () { return S.postpone(id, 'OP001', '2026-11-28', 'PROD on tool'); })
      .then(function (r) {
        eq(r.task.due_date, '2026-11-30'); ok(r.movedFromWeekend);
        eq(r.task.postpone_count, 2); eq(r.task.pattern_date, '2026-11-24'); eq(r.task.last_postpone_reason, 'PROD on tool');
        eq(S.history({ action: 'postponed' }).length, 2);
      })
      .then(function () { return rejects(S.postpone(id, 'OP001', '2026-11-01'), 'baddate'); });
  });

  test('postponing an overdue cleaning without a date moves it to the next working day after today', function () {
    return setup().then(function () {
      day('2026-12-02');                                    // LAC901 due 24 Nov -> overdue
      return S.postpone(openTask('LAC901').id, 'OP001');
    }).then(function (r) { eq(r.task.due_date, '2026-12-03'); });
  });

  test('postponed then completed: next cleaning goes back to the pattern', function () {
    return setup().then(function () {
      return S.postpone(openTask('AOP901').id, 'OP001', '2026-11-26');
    }).then(function (r) { day('2026-11-26'); return S.complete(r.task.id, 'OP001'); })
      .then(function (r) { eq(r.next.due_date, '2026-12-08'); });
  });

  test('9. one-off: completing it creates no next cleaning', function () {
    var before;
    return setup().then(function () { return S.addOneOff(tool('LAC901').id, '2026-11-19'); })
      .then(function (t) { before = S.current().tasks.length; return S.complete(t.id, 'OP001'); })
      .then(function (r) { eq(r.next, null); eq(S.current().tasks.length, before); })
      .then(function () { return rejects(S.addOneOff(tool('LAC901').id, '2026-11-21'), 'baddate'); });
  });

  test('10. reopen: task open again, untouched next cleaning removed; only the latest', function () {
    var first, second;
    return setup().then(function () { first = openTask('LAC901'); day('2026-11-24'); return S.complete(first.id, 'OP001'); })
      .then(function (r) { second = r.next; day('2026-12-01'); return S.complete(second.id, 'OP001'); })
      .then(function () { return rejects(S.reopen(first.id), 'notlatest'); })
      .then(function () { return S.reopen(second.id); })
      .then(function (t) {
        eq(t.status, 'open'); eq(t.completed_by, null);
        var open = S.current().tasks.filter(function (x) { return x.tool_id === tool('LAC901').id && x.status === 'open'; });
        eq(open.length, 1);
      });
  });

  test('11. tool down: not overdue; reactivate rejects weekend, sets the new date', function () {
    var id;
    return setup().then(function () { id = tool('LAC901').id; return S.toolDown(id, 'Broken axis'); })
      .then(function () {
        day('2026-12-10');
        eq(R.dailySummary(S.current(), '2026-12-10').overdue.map(function (x) { return x.tool; }).indexOf('LAC901'), -1);
        return rejects(S.reactivate(id, '2026-12-12'), 'baddate');
      })
      .then(function () { return S.reactivate(id, '2026-12-11'); })
      .then(function () { eq(tool('LAC901').status, 'active'); eq(openTask('LAC901').due_date, '2026-12-11'); });
  });

  test('12. changing the weekday moves the open cleaning; new tool gets first cleaning; duplicate name refused', function () {
    return setup().then(function () {
      var t = tool('LAC901');
      return S.saveTool(Object.assign({}, t, { weekday: 4 }));
    }).then(function () { eq(openTask('LAC901').due_date, '2026-11-26'); })
      .then(function () { return S.saveTool({ name: 'new901', schedule_type: 'months', interval: 1, month_day: 15, start_date: '2026-11-18' }); })
      .then(function (t) { eq(t.name, 'NEW901'); eq(openTask('NEW901').due_date, '2026-12-15'); })
      .then(function () { return rejects(S.saveTool({ name: 'lac901', schedule_type: 'weeks', interval: 1, weekday: 2, start_date: '2026-11-18' }), 'invalid'); })
      .then(function () { return rejects(S.saveTool({ name: 'X1', schedule_type: 'weeks', interval: 1, weekday: 6, start_date: '2026-11-18' }), 'invalid'); });
  });

  test('13. archive hides the tool from the board, history kept; restore brings it back', function () {
    var id;
    return setup().then(function () { id = tool('LAC901').id; return S.archiveTool(id, true); })
      .then(function () {
        eq(S.board('2026-11-24').rows.some(function (r) { return r.tool.id === id; }), false);
        ok(S.history({ toolId: id }).length >= 1);
        return S.archiveTool(id, false);
      })
      .then(function () { eq(S.board('2026-11-24').rows.some(function (r) { return r.tool.id === id; }), true); });
  });

  test('delete an open cleaning: the schedule continues', function () {
    return setup().then(function () { return S.deleteTask(openTask('LAC901').id); })
      .then(function (r) { eq(r.next.due_date, '2026-12-01'); });
  });

  test('14. admin-only actions refused without Admin login; wrong PIN refused', function () {
    return setup().then(function () {
      S.adminLogout();
      return rejects(S.toolDown(tool('LAC901').id, 'x'), 'forbidden');
    }).then(function () { return rejects(S.saveTool({ name: 'Z1', schedule_type: 'weeks', interval: 1, weekday: 2, start_date: '2026-11-18' }), 'forbidden'); })
      .then(function () { return rejects(S.adminLogin('ADMIN01', '9999'), 'badlogin'); })
      .then(function () { return rejects(S.adminLogin('OP001', '1234'), 'badlogin'); });
  });

  test('users: last active Admin cannot be removed; Admin needs a PIN; duplicate IDs refused', function () {
    return setup().then(function () {
      var a = S.current().users[0];
      return rejects(S.saveUser({ id: a.id, operator_id: 'ADMIN01', name: 'Khurana', role: 'operator' }), 'invalid');
    }).then(function () { return rejects(S.saveUser({ operator_id: 'AD2', name: 'Second', role: 'admin' }), 'invalid'); })
      .then(function () { return rejects(S.saveUser({ operator_id: 'op001', name: 'Dup', role: 'operator' }), 'invalid'); })
      .then(function () { return S.saveUser({ operator_id: 'AD2', name: 'Second', role: 'admin', pin: '5678' }); })
      .then(function () { S.adminLogout(); return S.adminLogin('ad2', '5678'); })
      .then(function (u) { eq(u.name, 'Second'); });
  });

  test('add missing standard operators: adds only the missing ones, no duplicates', function () {
    return setup().then(function (mem) {
      var d = JSON.parse(mem.files['hirata_data.json']);
      d.users = d.users.filter(function (u) { return u.name !== 'Anja KRALJ'; });   // an older plan without her
      mem.files['hirata_data.json'] = JSON.stringify(d);
      return S.addStandardOperators();
    }).then(function (added) { eq(added, ['Anja KRALJ']); return S.addStandardOperators(); })
      .then(function (added) { eq(added, []); eq(S.activeUsers().length, 7); });
  });

  test('names: complete by choosing a name (user id); new people get a short ID automatically; same name refused', function () {
    var lac;
    return setup().then(function () { return S.saveUser({ name: 'Marco Trummer', role: 'operator' }); })
      .then(function (u) {
        eq(u.operator_id, 'OP007');
        eq(S.activeUsers().length, 8);
        eq(S.activeUsers()[0].name, 'Anja KRALJ');
        lac = openTask('LAC901').id;
        return S.complete(lac, u.id, 'by name');
      })
      .then(function (r) { eq(r.user.name, 'Marco Trummer'); eq(S.history({ action: 'completed' })[0].who, 'Marco Trummer'); })
      .then(function () { return rejects(S.saveUser({ name: 'marco trummer', role: 'operator' }), 'invalid'); })
      .then(function () { var a = S.admins()[0]; S.adminLogout(); return S.adminLogin(a.id, '1234'); })
      .then(function (u) { eq(u.name, 'Khurana'); });
  });

  test('undo: Complete and Postpone can be undone right after; refused if changed meanwhile', function () {
    var id, tok;
    return setup().then(function () { id = openTask('LAC901').id; return S.complete(id, 'OP001', 'oops'); })
      .then(function (r) { tok = r.undo; return S.undo(tok); })
      .then(function (t) {
        eq(t.status, 'open'); eq(t.completion_comment, '');
        eq(S.current().tasks.filter(function (x) { return x.tool_id === tool('LAC901').id; }).length, 1, 'next cleaning removed');
        eq(S.history({ action: 'undone' }).length, 1);
        return rejects(S.undo(tok), 'conflict');                 // nothing to undo twice
      })
      .then(function () { return S.postpone(id, 'OP001', '2026-11-26', 'x'); })
      .then(function (r) { tok = r.undo; return S.undo(tok); })
      .then(function (t) { eq(t.due_date, '2026-11-24'); eq(t.postpone_count, 0); eq(t.last_postpone_reason, ''); })
      .then(function () { return S.postpone(id, 'OP001', '2026-11-26'); })
      .then(function (r) { tok = r.undo; return S.complete(id, 'OP002'); })
      .then(function () { return rejects(S.undo(tok), 'conflict'); });
  });

  test('R19: Admin moves and skips future cycles; they apply when the cycle comes; restore and permissions', function () {
    var id;
    return setup().then(function () {
      id = tool('LAC901').id;                                             // weekly Tue, open 24 Nov
      return rejects(S.moveCycle(id, '2026-12-01', '2026-11-24'), 'baddate');   // not after the open one
    }).then(function () { return S.skipCycle(id, '2026-12-01', 'shutdown'); })
      .then(function () { return S.moveCycle(id, '2026-12-08', '2026-12-10'); })
      .then(function () {
        var b = S.board('2026-12-07');
        var row = b.rows.find(function (r) { return r.tool.id === id; });
        eq(row.cells[3][0].moved, true);                                  // Thu 10 Dec
        eq(row.cells[1].length, 0);                                       // Tue 8 Dec empty
        day('2026-11-24'); return S.complete(openTask('LAC901').id, 'OP001');
      })
      .then(function (r) {
        eq(r.next.due_date, '2026-12-10'); eq(r.next.pattern_date, '2026-12-08');
        eq(S.current().exceptions.length, 0, 'exceptions consumed');
        return S.undo(r.undo);
      })
      .then(function () { eq(S.current().exceptions.length, 2, 'undo gives the exceptions back'); return S.restoreCycle(id, '2026-12-01'); })
      .then(function () { eq(S.current().exceptions.length, 1); S.adminLogout(); return rejects(S.skipCycle(id, '2026-12-15'), 'forbidden'); });
  });

  test('cleaning report and analytics: on time / late, days late, operators, reasons', function () {
    var A = window.HCP.analytics;
    return setup().then(function () { day('2026-11-24'); return S.complete(openTask('LAC901').id, 'OP002', 'ok'); })   // on time (Tue 24)
      .then(function () { return S.postpone(openTask('AOP901').id, 'OP001', '2026-11-26', 'PROD on tool'); })
      .then(function () { day('2026-11-26'); return S.complete(openTask('AOP901').id, 'OP001'); })                       // 2 days late
      .then(function () {
        day('2026-11-27');
        var st = A.stats(S.current(), '2026-11-16', '2026-11-27', '2026-11-27');
        var lac = st.rows.find(function (r) { return r.tool === 'LAC901' && r.done; });
        var aop = st.rows.find(function (r) { return r.tool === 'AOP901' && r.done; });
        eq([lac.status, lac.days_late, lac.who], ['Done on time', 0, 'Mohamed Ibrahem']);
        eq([aop.status, aop.days_late, aop.postponed, aop.reason], ['Done late', 2, 1, 'PROD on tool']);
        eq(st.kpi.done, 2); eq(st.kpi.onTimePct, 50); eq(st.kpi.avgLate, 1);
        eq(st.topReasons, [{ reason: 'PROD on tool', count: 1 }]);
        eq(st.byOperator.map(function (o) { return o.who; }).sort(), ['Mohamed Ibrahem', 'Valeriia Kyrychenko']);
        ok(st.rows.some(function (r) { return r.status === 'Overdue'; }), 'overdue rows listed');   // e.g. Mon/Tue tools not done
        var csv = S.reportCsv('2026-11-16', '2026-11-27');
        ok(csv.indexOf('Planned date') > 0 && csv.indexOf('Done late') > 0);
        var x = S.workbook('2026-11-16', '2026-11-27');
        eq([x[0], x[1]], [0x50, 0x4b]);   // a zip (xlsx)
        window.__lastWorkbook = x;
      });
  });

  test('14b. two PCs complete the same cleaning: only one succeeds', function () {
    var mem, id;
    return setup().then(function (m) { mem = m; id = openTask('LAC901').id; })
      .then(function () {
        // another PC writes first (simulated by changing the file behind our back)
        var d = JSON.parse(mem.files['hirata_data.json']);
        d.tasks.find(function (t) { return t.id === id; }).status = 'completed';
        mem.files['hirata_data.json'] = JSON.stringify(d);
        return rejects(S.complete(id, 'OP001'), 'conflict');
      });
  });

  test('saves keep a .prev.json copy and bump the revision', function () {
    var mem, rev;
    return setup().then(function (m) { mem = m; rev = S.current().revision; return S.complete(openTask('LAC901').id, 'OP001'); })
      .then(function () {
        eq(S.current().revision, rev + 1);
        eq(JSON.parse(mem.files['hirata_data.prev.json']).revision, rev);
      });
  });

  test('14c. damaged live file -> load falls back to .prev.json', function () {
    var mem;
    return setup().then(function (m) { mem = m; return S.complete(openTask('LAC901').id, 'OP001'); })
      .then(function () { mem.files['hirata_data.json'] = '{"tools": [ torn'; return S.load(); })
      .then(function (d) { ok(d && cleaningOnly(d).length === 12); ok(S.wasRecovered()); });
  });

  test('18. CSV: BOM, quoted commas, umlauts, no formula injection', function () {
    return setup().then(function () { return S.complete(openTask('LAC901').id, 'OP001', 'Rückstand, =SUM(A1) "ok"'); })
      .then(function () {
        var csv = S.historyCsv({ action: 'completed' });
        eq(csv.charCodeAt(0), 0xFEFF);
        ok(csv.indexOf('"Rückstand, =SUM(A1) ""ok"""') > 0, csv);
      })
      .then(function () { return S.complete(S.current().tasks.find(function (t) { return t.status === 'open'; }).id, 'OP001', '=HYPERLINK("x")'); })
      .then(function () {
        var csv = S.historyCsv({ action: 'completed' });
        ok(csv.indexOf('"\'=HYPERLINK(""x"")"') > 0, 'formula is neutralised: ' + csv);
      });
  });

  test('daily Teams message is sent once per working day', function () {
    var sent = [];
    function post(url, payload) { sent.push([url, payload]); return Promise.resolve(); }
    return setup().then(function () { return S.saveSettings({ teams_webhook_url: 'https://example.test/hook', theme_default: 'white' }); })
      .then(function () { day('2026-11-24'); return S.maybeSendDaily(post); })
      .then(function (r) { ok(r); return S.maybeSendDaily(post); })
      .then(function (r) {
        ok(!r); eq(sent.length, 1);
        ok(JSON.stringify(sent[0][1]).indexOf('LAC901') > 0, 'LAC901 is due today');
        day('2026-11-28'); return S.maybeSendDaily(post);   // Saturday
      }).then(function (r) { ok(!r); });
  });

  /* --- PM plan (PLAN 13e) ------------------------------------------- */

  test('PM seed: 23 PM tools, real owners, LXP902 not installed, DFS901/PNP901 down from 16 Nov, PMs only where the Excel shows a date', function () {
    return setup('2026-11-18').then(function () {
      var pms = S.current().tools.filter(R.isPm);
      eq(pms.length, 23);
      eq(pmTool('LXP902').status, 'planned');
      eq(pmTool('DFS901').status, 'down'); eq(pmTool('DFS901').down_from, '2026-11-16'); eq(pmTool('PNP901').down_until, null);
      eq(pmTool('QVM901').mnt_owner, 'Khaled Ismail');
      eq(pmOpen('QVM901').due_date, '2026-11-19');      // weekly, Thursday
      eq(pmOpen('AOP901').due_date, '2026-11-26');      // every 4 weeks, Thursday
      eq(pmOpen('BLY901'), undefined);                  // no start date yet -> no PM
      eq(pmOpen('FIB901'), undefined);                  // no PM
      eq(R.describeAny(pmTool('FIB901')), 'No PM');
      eq(R.describeAny(pmTool('BLY901')), 'Every 4 weeks, no start date yet');
      // names may repeat across the two lists
      ok(tool('AOP901') && pmTool('AOP901') && tool('AOP901').id !== pmTool('AOP901').id);
    });
  });

  test('PM board: own tools only, D on down days, red row for not installed, projected weekly PMs', function () {
    return setup('2026-11-18').then(function () {
      var b = S.board('2026-11-18', 'pm');
      eq(b.rows.length, 23);
      var dfs = b.rows.find(function (r) { return r.tool.name === 'DFS901'; });
      eq(dfs.downDays, [true, true, true, true, true]);
      var qvm = b.rows.find(function (r) { return r.tool.name === 'QVM901'; });
      eq(qvm.cells[3].map(function (i) { return i.status; }), ['upcoming']);
      var next = S.board('2026-11-25', 'pm').rows.find(function (r) { return r.tool.name === 'QVM901'; });
      eq(next.cells[3].map(function (i) { return i.status; }), ['projected']);
      eq(S.board('2026-11-18').rows.length, 12);       // cleaning board unchanged
    });
  });

  test('PM done / postpone only by the Admin; next PM back on the pattern', function () {
    return setup('2026-11-19').then(function () {
      S.adminLogout();
      return rejects(S.complete(pmOpen('QVM901').id, 'OP001'), 'forbidden');
    }).then(function () { return S.adminLogin('ADMIN01', '1234'); })
      .then(function () { return S.complete(pmOpen('QVM901').id, null, 'ok'); })
      .then(function (r) {
        eq(r.user.operator_id, 'ADMIN01');
        eq(r.next.due_date, '2026-11-26');
        return S.postpone(pmOpen('QVM901').id, null, '2026-11-28', 'parts');   // Saturday -> Monday
      }).then(function (r) { eq(r.task.due_date, '2026-11-30'); });
  });

  test('PM down with dates: D only in the period, task not overdue while down, Back up sets next PM', function () {
    var id;
    return setup('2026-11-18').then(function () {
      id = pmTool('PRF901').id;
      return S.toolDown(id, 'spare part', '2026-11-23', '2026-11-25');
    }).then(function () {
      var r = S.board('2026-11-23', 'pm').rows.find(function (x) { return x.tool.id === id; });
      eq(r.downDays, [true, true, true, false, false]);
      eq(r.cells[3].map(function (i) { return i.status; }), ['projected']);   // Thu 26 after the down period
      return rejects(S.toolDown(pmTool('AOI901').id, '', '2026-11-30', '2026-11-27'), 'baddate');
    }).then(function () { return S.reactivate(id, '2026-11-24'); })
      .then(function () { eq(pmTool('PRF901').status, 'active'); eq(pmTool('PRF901').down_from, null); eq(pmOpen('PRF901').due_date, '2026-11-24'); });
  });

  test('PM tool settings: no start date = no PM; set start date -> first PM; not installed removes it; seed button adds only missing', function () {
    var id;
    return setup('2026-11-18').then(function () {
      var t = pmTool('BLY901'); id = t.id;
      return S.saveTool({ id: id, name: 'BLY901', mnt_owner: t.mnt_owner, schedule_type: 'weeks', interval: 4, weekday: 2, start_date: '2026-11-01' });
    }).then(function () {
      eq(pmOpen('BLY901').due_date, '2026-12-01');   // pattern 3 Nov, 1 Dec ...: first one today or later
      return S.saveTool({ id: id, name: 'BLY901', mnt_owner: 'x', schedule_type: 'weeks', interval: 4, weekday: 2, start_date: '2026-11-01', planned: true });
    }).then(function () {
      eq(pmTool('BLY901').status, 'planned'); eq(pmOpen('BLY901'), undefined);
      return S.addPmTools();
    }).then(function (added) { eq(added, []); });
  });

  test('History and Excel: Type column, PMs sheet', function () {
    return setup('2026-11-19').then(function () { return S.complete(pmOpen('QVM901').id, null, ''); })
      .then(function () {
        eq(S.history({ type: 'PM', action: 'completed' }).length, 1);
        eq(S.history({ type: 'Cleaning', action: 'completed' }).length, 0);
        ok(S.historyCsv({}).indexOf('Date,Time,Type,Tool') > 0);
        var pmRows = window.HCP.analytics.reportRows(S.current(), '2026-11-01', '2026-11-30', '2026-11-19', 'pm');
        ok(pmRows.some(function (r) { return r.tool === 'QVM901' && r.done === '2026-11-19'; }));
        ok(window.HCP.analytics.reportRows(S.current(), '2026-11-01', '2026-11-30', '2026-11-19').every(function (r) { return r.tool !== 'QVM901'; }));
        ok(S.workbook('2026-11-01', '2026-11-30').length > 1000);
      });
  });

  /* --- Magazines (PLAN 13f) ----------------------------------------- */

  function mag(sn) { return S.magazines(true).find(function (m) { return m.sn === sn; }); }

  test('Magazines seed: 35 from the Excel, last check of 16 Nov with real names, repair flag from "Repair needed"', function () {
    return setup('2026-11-18').then(function () {
      eq(S.magazines().length, 35);
      eq(mag('M70073').status, 'repair'); eq(mag('M70073').repair_note, 'shutter loose (in Stocker)');
      eq(mag('M70074').last_by_name, 'Mohamed Ibrahem'); eq(mag('M70074').last_check, '2026-11-16'); eq(mag('M70074').status, 'ok');
      eq(mag('M70073').last_by_name, 'Talal AL-EFFAH');
      eq(mag('M70133').status, 'never');
      eq(mag('M70139').cart, 'Yes / X');
      eq(mag('M70342').lot_status, '19086.02');
    });
  });

  test('Magazines: check due after N weeks; check and repair done by name; Admin-only edits', function () {
    return setup('2026-11-18').then(function () {
      day('2026-12-14');
      eq(mag('M70074').status, 'due');                 // 4 weeks after 16 Nov
      return rejects(S.magCheck(mag('M70074').id, '', {}), 'noid');
    }).then(function () { return S.magCheck(mag('M70074').id, 'OP001', { cart: 'No', prod_use: 'Yes', lot_status: '20001', cleaned: true, repair_needed: true, comment: 'roller broken' }); })
      .then(function () {
        var m = mag('M70074');
        eq([m.status, m.last_check, m.cleaned_at, m.repair_since, m.prod_use], ['repair', '2026-12-14', '2026-12-14', '2026-12-14', 'Yes']);
        return S.magRepairDone(m.id, 'OP002', 'roller replaced');
      }).then(function () {
        eq(mag('M70074').status, 'ok');
        eq(S.history({ type: 'Magazine' }).map(function (r) { return r.action; }).sort(), ['mag_checked', 'mag_repaired']);
        return rejects(S.magRepairDone(mag('M70074').id, 'OP002', ''), 'conflict');
      }).then(function () { return S.saveMagazine({ sn: 'm70999', cr_type: 'cr100' }); })
      .then(function (m) {
        eq([m.sn, m.cr_type], ['M70999', 'CR100']);
        S.adminLogout();
        return rejects(S.saveMagazine({ sn: 'M71000' }), 'forbidden');
      }).then(function () { return S.adminLogin('ADMIN01', '1234'); })
      .then(function () { return rejects(S.saveMagazine({ sn: 'M70999' }), 'invalid'); })
      .then(function () { return S.addMagazines(); }).then(function (a) { eq(a, []); ok(S.workbook('2026-11-01', '2026-12-31').length > 1000); });
  });
})();
