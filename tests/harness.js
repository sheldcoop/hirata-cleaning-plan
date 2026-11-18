/** Tiny test harness: works in Edge (tests/index.html) and in Node (tests/run-node.js). */
window.T = (function () {
  var tests = [];
  function test(name, fn) { tests.push({ name: name, fn: fn }); }
  function eq(actual, expected, msg) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error((msg ? msg + ': ' : '') + 'expected ' + e + ' but got ' + a);
  }
  function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }
  function rejects(promise, code) {
    return promise.then(function () { throw new Error('expected an error' + (code ? ' (' + code + ')' : '')); },
      function (e) { if (code && e.code !== code) throw new Error('expected error code ' + code + ' but got ' + e.code + ': ' + e.message); });
  }
  function run(report) {
    var results = [], chain = Promise.resolve();
    tests.forEach(function (t) {
      chain = chain.then(function () {
        window.HCP.config.fixed_today = null;
        return Promise.resolve().then(t.fn).then(
          function () { results.push({ name: t.name, ok: true }); report(t.name, true); },
          function (e) { results.push({ name: t.name, ok: false, error: e.message }); report(t.name, false, e.message); });
      });
    });
    return chain.then(function () { return results; });
  }
  return { test: test, eq: eq, ok: ok, rejects: rejects, run: run };
})();
