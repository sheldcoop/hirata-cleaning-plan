/** Rule tests (PLAN.md section 12). */
(function () {
  var R = window.HCP.rules, T = window.T, test = T.test, eq = T.eq, ok = T.ok;
  var tue2w = { schedule_type: 'weeks', interval: 2, weekday: 2, start_date: '2026-11-18' };

  test('date helpers: weekday, weekend shift, next working day', function () {
    eq(R.weekday('2026-11-18'), 3);
    eq(R.toWorkingDay('2026-11-21'), '2026-11-23');   // Sat -> Mon
    eq(R.toWorkingDay('2026-11-22'), '2026-11-23');   // Sun -> Mon
    eq(R.nextWorkingDay('2026-11-20'), '2026-11-23'); // Fri -> Mon
    eq(R.mondayOf('2026-11-22'), '2026-11-16');
    eq(R.isoWeek('2026-11-18'), 47);
    ok(!R.isDate('2026-02-30'));
  });

  test('1. every 2 weeks on Tuesday, start Wed 2026-11-18 -> first date Tue 2026-11-24', function () {
    eq(R.firstRuleDate(tue2w, '2026-11-18').pattern, '2026-11-24');
  });

  test('2. completed on Thu 2026-11-26 -> next date Tue 2026-12-08 (back to pattern)', function () {
    var task = { pattern_date: '2026-11-24', nominal_date: '2026-11-24' };
    eq(R.nextAfterCompletion(tue2w, task, '2026-11-26').pattern, '2026-12-08');
  });

  test('3. completed 5 weeks late -> first pattern date after today', function () {
    var task = { pattern_date: '2026-11-24', nominal_date: '2026-11-24' };
    // completed Tue 2026-12-29: pattern dates 12-08, 12-22, 01-05 -> 2027-01-05
    eq(R.nextAfterCompletion(tue2w, task, '2026-12-29').pattern, '2027-01-05');
    // completed exactly on a pattern date -> the next one, never the same day
    eq(R.nextAfterCompletion(tue2w, task, '2026-12-22').pattern, '2027-01-05');
  });

  test('weekly tool postponed a week and done on the new date -> next is a week later, not today', function () {
    var weekly = { schedule_type: 'weeks', interval: 1, weekday: 2 };
    var task = { pattern_date: '2026-11-24', nominal_date: '2026-11-24' };
    eq(R.nextAfterCompletion(weekly, task, '2026-12-01').pattern, '2026-12-08');
  });

  test('12b. monthly day 31 -> last day of shorter months; weekend -> Monday; no drift', function () {
    var m31 = { schedule_type: 'months', interval: 1, month_day: 31, start_date: '2026-04-01' };
    eq(R.firstRuleDate(m31, '2026-04-01'), { pattern: '2026-04-30', nominal: '2026-04-30' });
    var r = R.stepRule(m31, '2026-04-30');
    eq(r, { pattern: '2026-06-01', nominal: '2026-05-31' }); // 31 May 2026 is a Sunday
    eq(R.stepRule(m31, r.nominal).nominal, '2026-06-30');
    var m15 = { schedule_type: 'months', interval: 1, month_day: 15 };
    var first = R.firstRuleDate(m15, '2026-08-01');           // 15 Aug 2026 is a Saturday
    eq(first, { pattern: '2026-08-17', nominal: '2026-08-15' });
    eq(R.stepRule(m15, first.nominal).pattern, '2026-09-15');  // back to day 15
  });

  test('every 3 months', function () {
    var q = { schedule_type: 'months', interval: 3, month_day: 10 };
    eq(R.previewDates(Object.assign({ start_date: '2026-11-01' }, q), '2026-11-01', 3), ['2026-11-10', '2027-02-10', '2027-05-10']);
  });

  test('projected dates skip anything on or before the open task due date', function () {
    var weekly = { schedule_type: 'weeks', interval: 1, weekday: 2 };
    var open = { pattern_date: '2026-11-24', nominal_date: '2026-11-24', due_date: '2026-12-02' }; // postponed past next Tue
    eq(R.projected(weekly, open, '2026-11-30', '2026-12-04'), []);
    eq(R.projected(weekly, open, '2026-12-07', '2026-12-11'), ['2026-12-08']);
  });

  test('validateSchedule catches bad input', function () {
    ok(R.validateSchedule({ schedule_type: 'weeks', interval: 0, weekday: 2, start_date: '2026-11-18' }));
    ok(R.validateSchedule({ schedule_type: 'weeks', interval: 1, weekday: 6, start_date: '2026-11-18' }));
    ok(R.validateSchedule({ schedule_type: 'months', interval: 1, month_day: 32, start_date: '2026-11-18' }));
    eq(R.validateSchedule(tue2w), '');
  });

  test('describeSchedule', function () {
    eq(R.describeSchedule(tue2w), 'Every 2 weeks on Tuesday');
    eq(R.describeSchedule({ schedule_type: 'months', interval: 1, month_day: 5 }), 'Every month on day 5');
  });

  test('taskStatus', function () {
    var t = { status: 'open', due_date: '2026-11-18', postpone_count: 0 };
    eq(R.taskStatus(t, {}, '2026-11-18'), 'today');
    eq(R.taskStatus(t, {}, '2026-11-19'), 'overdue');
    eq(R.taskStatus(t, { status: 'down' }, '2026-11-19'), 'down');
    eq(R.taskStatus(Object.assign({}, t, { postpone_count: 1 }), {}, '2026-11-17'), 'postponed');
    eq(R.taskStatus(Object.assign({}, t, { status: 'completed' }), {}, '2026-11-19'), 'done');
  });

  test('board: overdue carried into today, projected cells, completed on completion day', function () {
    var tool = { id: 'a', name: 'LAC901', schedule_type: 'weeks', interval: 1, weekday: 2, status: 'active', archived: false };
    var data = { tools: [tool], tasks: [
      { id: 't1', tool_id: 'a', status: 'open', is_one_off: 0, pattern_date: '2026-11-10', nominal_date: '2026-11-10', due_date: '2026-11-10', postpone_count: 0 },
      { id: 't0', tool_id: 'a', status: 'completed', is_one_off: 0, pattern_date: '2026-11-03', due_date: '2026-11-03', completed_at: '2026-11-04T09:00:00' }
    ] };
    var b = R.buildBoard(data, '2026-11-18', '2026-11-18');
    eq(b.days, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    eq(b.rows[0].cells[2].map(function (i) { return i.status; }), ['overdue']);   // carried into Wednesday
    ok(b.rows[0].cells[2][0].carried);
    eq(b.rows[0].cells[1].map(function (i) { return i.status; }), ['projected']); // Tue 17 projected
    var past = R.buildBoard(data, '2026-11-04', '2026-11-18');
    eq(past.rows[0].cells[2].map(function (i) { return i.status; }), ['done']);   // completed Wed 4 Nov
    eq(past.rows[0].cells[1], []);                                                // R14c: nothing at Tue 3
  });

  test('board: archived tools hidden, down tools have no projections', function () {
    var data = { tools: [
      { id: 'a', name: 'A', schedule_type: 'weeks', interval: 1, weekday: 2, status: 'down', archived: false },
      { id: 'b', name: 'B', schedule_type: 'weeks', interval: 1, weekday: 2, status: 'active', archived: true }
    ], tasks: [{ id: 't', tool_id: 'a', status: 'open', is_one_off: 0, pattern_date: '2026-11-24', nominal_date: '2026-11-24', due_date: '2026-11-24', postpone_count: 0 }] };
    var b = R.buildBoard(data, '2026-11-30', '2026-11-18');
    eq(b.rows.length, 1);
    ok(!b.rows[0].hasItems);
    eq(R.buildBoard(data, '2026-11-24', '2026-11-18').rows[0].cells[1][0].status, 'down');
  });
})();
