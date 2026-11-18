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
  function tool(name) { return S.current().tools.find(function (t) { return t.name === name; }); }
  function openTask(name) { var id = tool(name).id; return S.current().tasks.find(function (t) { return t.tool_id === id && t.status === 'open'; }); }
  function day(d) { cfg.fixed_today = d; }

  test('first run creates Admin, the 6 real operators and 12 tools, each with one open cleaning, spread over the week', function () {
    return setup().then(function (mem) {
      var d = JSON.parse(mem.files['hirata_data.json']);
      eq(d.users.filter(function (u) { return u.role === 'operator'; }).map(function (u) { return u.name; }), S.SEED_OPERATORS);
      eq(d.users.some(function (u) { return /test/i.test(u.name); }), false);
      eq(d.tools.length, 12);
      eq(d.tasks.length, 12);
      eq(d.users[0].operator_id, 'ADMIN01');
      ok(d.users[0].pin_hash.indexOf('pbkdf2$') === 0 && d.users[0].pin_hash.indexOf('1234') < 0, 'PIN is hashed');
      eq(openTask('LAC901').due_date, '2026-11-24');
      eq(openTask('BLY901').due_date, '2026-11-23');   // weekly on Monday (this Monday already passed)
      eq(openTask('TLA901').due_date, '2026-11-30');   // every 4 weeks, Monday, starts in 2 weeks
      var days = {}; d.tools.forEach(function (t) { days[t.weekday] = 1; });
      eq(Object.keys(days).length, 5, 'Monday to Friday all used');
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
      .then(function (d) { ok(d && d.tools.length === 12); ok(S.wasRecovered()); });
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
})();
