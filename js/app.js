/**
 * Hirata Cleaning Plan - app.js
 * Start-up (browser check, data folder, first run), top bar, navigation,
 * Admin login, theme, auto refresh (R18) and the daily Teams message.
 */
(function () {
  'use strict';

  var HCP = window.HCP, cfg = HCP.config, R = HCP.rules, S = HCP.store, U = HCP.ui, h = U.h;
  var storage = HCP.adapters.storageFolder;
  var THEME_KEY = cfg.local_prefix + 'theme';
  var ADMIN_KEY = cfg.local_prefix + 'admin';
  var REFRESH_MS = 60000;

  var main = document.getElementById('main');
  var topbar = document.getElementById('topbar-right');
  var view = 'board';
  var lastRevision = null;
  var lastDay = R.today();

  S.setAdapter(storage);

  var app = {
    render: render,
    reload: reload,
    folderLabel: function () { return storage.label(); },
    postTeams: postTeams
  };

  /* --- Theme -------------------------------------------------------- */

  var themeChoice = null;   // this visit (also kept in localStorage when allowed)
  function theme() {
    var t = themeChoice;
    if (!t) { try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ } }
    var d = S.current();
    return t || (d && d.settings && d.settings.theme_default) || 'white';
  }
  function applyTheme() { document.documentElement.setAttribute('data-theme', theme()); }
  function toggleTheme() {
    themeChoice = theme() === 'teal' ? 'white' : 'teal';
    try { localStorage.setItem(THEME_KEY, themeChoice); } catch (e) { /* ignore */ }
    applyTheme(); renderTop();
  }

  /* --- Start-up ----------------------------------------------------- */

  function screen(nodes) { U.clear(main); U.add(main, h('div', { class: 'center-card' }, nodes)); }

  function start() {
    applyTheme();
    document.getElementById('version').textContent = 'v' + cfg.version;
    document.getElementById('logo').appendChild(HCP.icon('logo', 26));
    if (!storage.isSupported()) { screen([h('h2', { text: 'Please use Microsoft Edge' }), h('p', { text: storage.unsupportedMessage() })]); return; }
    storage.reconnect({ silent: true }).then(function (ok) {
      if (ok) return open();
      return storage.savedLabel().then(connectScreen);
    }).catch(function (e) { connectScreen(null, e); });
  }

  function connectScreen(savedName, error) {
    renderTop();
    var btn = h('button', { class: 'btn big', text: savedName ? 'Reconnect data folder' : 'Connect data folder' });
    btn.addEventListener('click', function () {
      storage.reconnect({ silent: false }).then(function (ok) { return ok ? null : storage.connect(); })
        .then(open)
        .catch(function (e) { if (e && e.name === 'AbortError') return; connectScreen(savedName, e); });
    });
    screen([
      h('h2', { text: 'Hirata Cleaning Plan' }),
      savedName ? h('p', { text: 'Click the button to reopen the data folder "' + savedName + '". Edge asks once per session.' })
        : h('p', {}, ['First time on this PC: click the button and choose the ', h('b', { text: 'data' }), ' folder next to index.html on the shared drive. Edge remembers it.']),
      error ? h('p', { class: 'form-error', text: U.errorText(error) }) : null,
      btn
    ]);
  }

  function open() {
    return S.load().then(function (d) {
      if (!d) { firstRun(); return; }
      if (S.wasRecovered()) U.toast('The plan file was damaged; the backup copy was loaded. Ask the Admin to check.', 'error');
      lastRevision = d.revision;
      var savedAdmin = null;
      try { savedAdmin = sessionStorage.getItem(ADMIN_KEY); } catch (e) { /* ignore */ }
      if (savedAdmin) S.resumeAdmin(savedAdmin);
      applyTheme();
      route();
      startRefresh();
      sendDaily();
    }).catch(function (e) { connectScreen(storage.label(), e); });
  }

  function firstRun() {
    renderTop();
    var pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'new-password' });
    var pin2 = h('input', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'new-password' });
    var msg = h('p', { class: 'form-error', hidden: true });
    var btn = h('button', { class: 'btn big', text: 'Create new plan' });
    btn.addEventListener('click', function () {
      if (pin.value !== pin2.value) { msg.textContent = 'The two PINs are not the same.'; msg.hidden = false; return; }
      btn.disabled = true;
      S.createPlan(pin.value).then(function () { return S.adminLogin('ADMIN01', pin.value); })
        .then(function (u) { rememberAdmin(u); U.toast('Plan created with 12 tools. You are logged in as Admin.'); location.hash = '#settings'; open(); })
        .catch(function (e) { msg.textContent = U.errorText(e); msg.hidden = false; btn.disabled = false; });
    });
    screen([
      h('h2', { text: 'Create a new cleaning plan' }),
      h('p', { text: 'The folder "' + storage.label() + '" has no plan yet. This creates it with the 12 loader tools and the first Admin (Khurana). Add the operators afterwards in Settings → Users.' }),
      h('p', { class: 'muted', text: 'If your team already has a plan, you chose the wrong folder: reload the page and pick the shared data folder.' }),
      U.field('Admin PIN (4–8 digits)', pin), U.field('Repeat PIN', pin2), msg, btn
    ]);
  }

  /* --- Navigation --------------------------------------------------- */

  function route() {
    var hash = (location.hash || '#board').slice(1);
    view = ['board', 'history', 'analytics', 'settings'].indexOf(hash) >= 0 ? hash : 'board';
    render();
  }
  window.addEventListener('hashchange', function () { if (S.current()) route(); });

  function renderTop() {
    U.clear(topbar);
    var d = S.current();
    var adminUser = S.currentAdmin();
    if (d) {
      U.add(topbar, h('nav', { class: 'nav' }, [['board', 'Board'], ['history', 'History'], ['analytics', 'Analytics'], ['settings', 'Settings']].map(function (n) {
        return h('a', { href: '#' + n[0], class: view === n[0] ? 'active' : '', text: n[1] });
      })));
      U.add(topbar, adminUser
        ? h('span', { class: 'admin-chip' }, [HCP.icon('user', 14), 'Admin: ' + adminUser.name, h('button', { class: 'link', text: 'Log out', onclick: logout })])
        : h('button', { class: 'btn small ghost on-dark', onclick: loginDialog }, [HCP.icon('user', 14), ' Admin login']));
    }
    var teal = theme() === 'teal';
    U.add(topbar, h('button', { class: 'theme-btn', title: 'Switch to ' + (teal ? 'Light' : 'Dark') + ' theme', 'aria-label': 'Switch theme', onclick: toggleTheme },
      [HCP.icon(teal ? 'sun' : 'moon', 15), teal ? ' Light' : ' Dark']));
  }

  function render() {
    if (!S.current()) return;
    renderTop();
    U.clear(main);
    if (view === 'settings' && !S.currentAdmin()) {
      U.add(main, h('div', { class: 'center-card' }, [h('h2', { text: 'Settings' }), h('p', { text: 'Settings are for Admins.' }),
        h('button', { class: 'btn', text: 'Admin login', onclick: loginDialog })]));
      return;
    }
    HCP.views[view].render(main, app);
  }

  /** Re-read the file (another PC may have saved) and redraw. */
  function reload() {
    return S.load().then(function (d) {
      if (!d) { firstRun(); return; }
      lastRevision = d.revision;
      if (S.currentAdmin() === null) forgetAdmin();
      render();
    }).catch(function (e) { U.toast(U.errorText(e), 'error'); });
  }

  /* --- Admin login -------------------------------------------------- */

  function rememberAdmin(u) { try { sessionStorage.setItem(ADMIN_KEY, u.id); } catch (e) { /* ignore */ } }
  function forgetAdmin() { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* ignore */ } }

  function loginDialog() {
    var who = U.personField(S.admins(), 'Choose your name…');
    var id = who.input;
    var pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'current-password' });
    var msg = h('p', { class: 'form-error', hidden: true });
    var btn = h('button', { class: 'btn', text: 'Log in' });
    function go() {
      btn.disabled = true;
      S.adminLogin(id.value, pin.value).then(function (u) {
        rememberAdmin(u); U.closeModal(); U.toast('Logged in as ' + u.name + '.'); render();
      }).catch(function (e) { msg.textContent = U.errorText(e); msg.hidden = false; btn.disabled = false; pin.value = ''; pin.focus(); });
    }
    btn.addEventListener('click', go);
    pin.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    U.modal('Admin login', [U.field('Name', who.node), U.field('PIN', pin), msg,
      h('p', { class: 'hint', text: 'The login lasts until you log out or close this tab.' }),
      h('div', { class: 'actions' }, [btn, h('button', { class: 'btn ghost', text: 'Cancel', onclick: U.closeModal })])]);
  }

  function logout() {
    S.adminLogout(); forgetAdmin(); U.toast('Logged out.');
    if (view === 'settings') location.hash = '#board'; else render();
  }

  /* --- Auto refresh (R18) ------------------------------------------- */

  function refreshIfChanged() {
    if (!S.current() || U.isModalOpen() || document.hidden) return;
    var dayChanged = R.today() !== lastDay;
    lastDay = R.today();
    S.load().then(function (d) {
      if (!d) return;
      if (d.revision !== lastRevision || dayChanged) { lastRevision = d.revision; render(); }
      if (dayChanged) sendDaily();
    }).catch(function () { /* share briefly unreachable: try again next time */ });
  }

  var refreshTimer = null;
  function startRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(refreshIfChanged, REFRESH_MS);
    window.addEventListener('focus', refreshIfChanged);
  }

  /* --- Teams -------------------------------------------------------- */

  /** Fire-and-forget POST (no-cors: the page cannot read the answer). */
  function postTeams(url, payload) {
    return fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) })
      .then(function () { return true; }, function () { throw new Error('Could not reach Teams. Check the webhook URL and the network.'); });
  }

  function sendDaily() {
    S.maybeSendDaily(postTeams).catch(function () { /* never block the board for a reminder */ });
  }

  start();
})();
