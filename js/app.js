/**
 * Hirata Cleaning Plan - app.js (Phase 0)
 * Start-up: check the browser, connect the data folder once, prove we can
 * read and write it. The weekly board comes in Phase 2.
 */
(function () {
  'use strict';
  var cfg = window.HCP.config;
  var storage = window.HCP.adapters.storageFolder;
  var el = function (id) { return document.getElementById(id); };

  function show(state, text) {
    el('status').textContent = text;
    el('status').className = 'status ' + state;
    el('connect').hidden = state === 'ok';
  }

  /** Read/write round trip on a small test file. */
  function check() {
    var stamp = new Date().toISOString();
    return storage.write('connection_test.txt', 'Last opened ' + stamp)
      .then(function () { return storage.read('connection_test.txt'); })
      .then(function (txt) {
        if (txt !== 'Last opened ' + stamp) throw new Error('Read back did not match');
        return storage.read(cfg.data_file);
      })
      .then(function (data) {
        show('ok', 'Data folder connected: ' + storage.label() +
          (data ? ' (plan file found)' : ' (no plan file yet, it is created in Phase 1)'));
      });
  }

  function fail(e) { show('error', 'Problem: ' + (e && e.message ? e.message : e)); }

  function start() {
    el('version').textContent = 'v' + cfg.version;
    if (!storage.isSupported()) { show('error', storage.unsupportedMessage()); el('connect').hidden = true; return; }
    storage.reconnect({ silent: true }).then(function (ok) {
      if (ok) return check();
      return storage.savedLabel().then(function (name) {
        show('wait', name ? 'Click "Connect data folder" to reopen "' + name + '".'
                          : 'First time on this PC: click "Connect data folder" and choose the "data" folder next to index.html.');
      });
    }).catch(fail);
  }

  el('connect').addEventListener('click', function () {
    storage.reconnect({ silent: false }).then(function (ok) {
      return ok ? check() : storage.connect().then(check);
    }).catch(function (e) { if (e && e.name === 'AbortError') return; fail(e); });
  });

  start();
})();
