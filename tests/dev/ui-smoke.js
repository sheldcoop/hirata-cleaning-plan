/**
 * Developer-only UI smoke test: loads index.html in jsdom with an in-memory
 * data folder and clicks through the main flows. Needs jsdom (not part of
 * the app): NODE_PATH=/path/to/node_modules node tests/dev/ui-smoke.js
 */
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..', '..');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdom: ' + (e.stack || e.message)));
vc.on('error', e => errors.push('console.error: ' + e));

const wait = ms => new Promise(r => setTimeout(r, ms));
let step = '';
function ok(v, msg) { if (!v) throw new Error(step + ': ' + msg); }

JSDOM.fromFile(path.join(root, 'index.html'), {
  runScripts: 'dangerously', resources: 'usable', virtualConsole: vc, url: 'file://' + path.join(root, 'index.html'),
  beforeParse(w) {
    Object.defineProperty(w, 'crypto', { value: globalThis.crypto });
    w.TextEncoder = TextEncoder;
    w.HCP = { config: {} };
    // in-memory folder that pretends to be already connected
    const files = {};
    w.__files = files;
    w.__fakeFolder = {
      id: 'folder', isSupported: () => true, unsupportedMessage: () => '', hasSaved: () => Promise.resolve(true),
      connect: () => Promise.resolve(), reconnect: () => Promise.resolve(true), savedLabel: () => Promise.resolve('data'), label: () => 'data',
      read: p => Promise.resolve(p in files ? files[p] : null), write: (p, t) => { files[p] = t; return Promise.resolve(); },
      list: () => Promise.resolve([]), remove: p => { delete files[p]; return Promise.resolve(); }
    };
    w.HCP.adapters = {};
    Object.defineProperty(w.HCP.adapters, 'storageFolder', { get: () => w.__fakeFolder, set: () => {}, enumerable: true });
    w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
    w.__downloads = [];
    w.HTMLAnchorElement.prototype.click = function () { w.__downloads.push(this.download); };
  }
}).then(async dom => {
  const w = dom.window, d = w.document;
  await new Promise(res => { if (d.readyState === 'complete') res(); else w.addEventListener('load', res); });
  await wait(300);
  const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
  const btn = text => $$('button').find(b => b.textContent.trim().startsWith(text) && !b.disabled);
  const click = async (el, ms = 120) => { ok(el, 'element to click is missing'); el.click(); await wait(ms); };
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };

  step = 'first run';
  ok(d.body.textContent.includes('Create a new cleaning plan'), 'first-run screen shown: ' + d.body.textContent.slice(0, 300));
  const pins = $$('input[type=password]');
  type(pins[0], '1234'); type(pins[1], '1234');
  await click(btn('Create new plan'), 1500);
  ok(w.__files['hirata_data.json'], 'plan file written');
  ok(d.body.textContent.includes('Admin: Khurana'), 'logged in as Admin: ' + d.body.textContent.slice(0, 400) + errors.join('|'));
  ok($$('.tab').length === 4, 'settings tabs shown');

  step = 'settings: users';
  await click($$('.tab').find(t => t.textContent === 'General'));
  await click(btn('Add demo operators'), 300);
  await click($$('.tab').find(t => t.textContent === 'Users'));
  ok(d.body.textContent.includes('OP001'), 'demo operator listed');

  step = 'settings: add tool';
  await click($$('.tab').find(t => t.textContent === 'Tools'));
  ok($$('table.list tbody tr').length === 12, '12 tools listed');
  await click(btn('+ Add tool'));
  const m = $('.modal');
  type(m.querySelector('input[type=text]'), 'test901');
  type(m.querySelector('select'), 'months');
  type(m.querySelectorAll('input[type=number]')[1], '15');
  ok(m.querySelector('.preview').textContent.includes('Every 2 months on day 15'), 'preview: ' + m.querySelector('.preview').textContent);
  await click(btn('Add tool'), 300);
  ok($$('table.list tbody tr').length === 13, 'tool added');

  step = 'board';
  w.location.hash = '#board'; await wait(200);
  ok($('.week-label').textContent.startsWith('Week '), 'week label');
  ok($$('table.grid tbody tr').length === 13, 'rows: ' + $$('table.grid tbody tr').length);
  await click(btn('›')); await click(btn('›'));
  ok($$('.chip.s-projected').length > 0, 'projected cells in a later week');
  await click(btn('Today'));
  // jump to the week with the first cleanings (Tuesday on/after today)
  let guard = 0;
  while (!$('button.chip') && guard++ < 3) await click(btn('›'));
  const chip = $('button.chip');
  ok(chip, 'clickable cleaning chip');

  step = 'complete';
  await click(chip);
  await click(btn('✓ Complete'));
  await click(btn('Continue'));
  ok($('.form-error') && !$('.form-error').hidden, 'operator ID required');
  type($('.modal .opid'), 'op001');
  ok($('.modal .who').textContent === 'Test Operator 1', 'name shown for ID');
  type($('.modal textarea'), 'Filter dirty, replaced');
  await click(btn('Continue'));
  ok($('.confirm-q').textContent.includes('Test Operator 1'), 'confirmation shows name');
  await click(btn('Yes, completed'), 400);
  ok(!$('.modal'), 'modal closed after complete');
  ok($$('.chip.s-done').length === 1, 'done chip on the board');

  step = 'postpone';
  const open2 = $$('button.chip').find(c => !c.classList.contains('s-done'));
  await click(open2);
  await click(btn('🕓 Postpone'));
  type($('.modal .opid'), 'OP002');
  await click(btn('Continue'));
  await click(btn('Yes, postpone'), 400);
  ok($$('.toast').some(t => t.textContent.includes('postponed to')), 'postpone toast');

  step = 'tool down';
  await click($('.tool-name'));
  await click(btn('⛔ Set tool down'));
  type($('.modal textarea'), 'No use allowed');
  await click(btn('Continue'));
  await click(btn('Yes, set down'), 400);
  ok($$('.badge.down').length === 1, 'DOWN badge');

  step = 'history + export';
  w.location.hash = '#history'; await wait(200);
  ok($$('table.list tbody tr').length >= 4, 'history rows');
  await click(btn('⬇ Export CSV'));
  ok(w.__downloads[0] && w.__downloads[0].endsWith('.csv'), 'csv download');

  step = 'theme + logout';
  await click($('.icon-btn.on-dark'));
  ok(d.documentElement.getAttribute('data-theme') === 'teal', 'theme switched');
  await click(btn('Log out'));
  ok(!d.body.textContent.includes('Admin: Khurana'), 'logged out');
  w.location.hash = '#settings'; await wait(200);
  ok(d.body.textContent.includes('Settings are for Admins'), 'settings locked');

  step = 'admin login';
  await click(btn('Admin login'));
  type($('.modal input[type=text]'), 'admin01'); type($('.modal input[type=password]'), '1234');
  await click(btn('Log in'), 800);
  ok(d.body.textContent.includes('Admin: Khurana'), 'logged in again');

  if (errors.length) throw new Error('Script errors:\n' + errors.join('\n'));
  console.log('UI smoke test passed');
  process.exit(0);
}).catch(e => { console.error('UI smoke test FAILED:', e.message, errors.join('\n')); process.exit(1); });
