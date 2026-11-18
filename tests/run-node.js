/** Run the tests in Node (developer only; users open tests/index.html in Edge). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, TextEncoder, Uint8Array, Promise, Date, Math, JSON, setTimeout };
ctx.window = ctx; ctx.crypto = globalThis.crypto;
vm.createContext(ctx);
['js/config.js', 'js/rules.js', 'js/store.js', 'tests/memory-storage.js', 'tests/harness.js', 'tests/rules.test.js', 'tests/store.test.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
ctx.T.run((name, ok, msg) => console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + msg)))
  .then(r => { const bad = r.filter(x => !x.ok).length; console.log(`\n${r.length - bad} passed, ${bad} failed`); process.exit(bad ? 1 : 0); });
