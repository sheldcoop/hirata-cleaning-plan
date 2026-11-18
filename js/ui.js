/**
 * Hirata Cleaning Plan - ui.js
 * Small DOM helpers shared by all screens: element builder, modal, toast,
 * confirmation, operator-ID field, error text.
 */
window.HCP = window.HCP || {};
window.HCP.ui = (function () {
  'use strict';

  /** h('div', {class: 'x', onclick: fn}, [children or text]) */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    add(el, children);
    return el;
  }
  function add(el, children) {
    if (children == null) return el;
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* --- Toast -------------------------------------------------------- */

  /** toast(msg, kind, {action: {label, fn}, ms}) - an action button (e.g. Undo) shows a countdown bar. */
  function toast(msg, kind, opts) {
    var o = opts || {};
    var ms = o.ms || (kind === 'error' ? 6000 : 3500);
    var box = document.getElementById('toasts');
    var t = h('div', { class: 'toast ' + (kind || 'ok'), role: 'status' }, h('span', { class: 'toast-msg', text: msg }));
    var gone = false;
    function remove() { if (gone) return; gone = true; t.classList.add('fade'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }
    if (o.action) {
      var b = h('button', { class: 'toast-action' }, [window.HCP.icon(o.action.icon || 'undo', 14), o.action.label]);
      b.addEventListener('click', function () { b.disabled = true; remove(); o.action.fn(); });
      t.appendChild(b);
      var bar = h('span', { class: 'toast-bar' });
      bar.style.animationDuration = ms + 'ms';
      t.appendChild(bar);
    }
    box.appendChild(t);
    setTimeout(remove, ms);
  }

  function errorText(e) {
    if (!e) return 'Something went wrong.';
    if (e.code) return e.message;
    if (e.name === 'NotAllowedError') return 'Edge did not allow access to the data folder. Click "Connect data folder" again.';
    return 'Something went wrong: ' + (e.message || e);
  }

  /* --- Modal -------------------------------------------------------- */

  var openModal = null;

  /** modal(title, bodyNode) -> {body, close}. Esc / backdrop / X close it. */
  function modal(title, content, opts) {
    closeModal();
    var o = opts || {};
    var body = h('div', { class: 'modal-body' }, content);
    var box = h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'modal-head' }, [
        h('h2', { text: title }),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', title: 'Close (Esc)', onclick: closeModal }, window.HCP.icon('plus', 20))
      ]),
      body
    ]);
    var back = h('div', { class: 'backdrop', onmousedown: function (ev) { if (ev.target === back) closeModal(); } }, box);
    document.body.appendChild(back);
    openModal = { el: back, onClose: o.onClose };
    var first = box.querySelector('input, select, textarea, button.btn');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return { body: body, close: closeModal };
  }
  function closeModal() {
    if (!openModal) return;
    var m = openModal; openModal = null;
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (m.onClose) m.onClose();
  }
  function isModalOpen() { return !!openModal; }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeModal(); });

  /** Replace the content of an element with a "are you sure" step.
   *  onYes returns a Promise; while it runs the buttons are disabled. */
  function confirmStep(container, question, yesLabel, onYes, onBack, danger) {
    var msg = h('p', { class: 'form-error', hidden: true });
    var yes = h('button', { class: 'btn' + (danger ? ' danger' : ''), text: yesLabel });
    var no = h('button', { class: 'btn ghost', text: 'Back' });
    yes.addEventListener('click', function () {
      yes.disabled = no.disabled = true;
      yes.textContent = 'Saving…';
      Promise.resolve().then(onYes).catch(function (e) {
        msg.textContent = errorText(e); msg.hidden = false;
        yes.disabled = no.disabled = false; yes.textContent = yesLabel;
      });
    });
    no.addEventListener('click', onBack);
    clear(container);
    add(container, [h('p', { class: 'confirm-q', text: question }), msg, h('div', { class: 'actions' }, [yes, no])]);
    yes.focus();
  }

  /** "Who are you?" list of names. value = user id. */
  function personField(users, placeholder) {
    var input = h('select', { class: 'person' }, [h('option', { value: '', text: placeholder || 'Choose your name…' })].concat(users.map(function (u) {
      return h('option', { value: u.id, text: u.name });
    })));
    var node = users.length ? input : h('p', { class: 'form-error', text: 'No people in the list yet. An Admin adds them in Settings → Users.' });
    return { input: input, node: node };
  }

  function field(label, control, hint) {
    return h('label', { class: 'field' }, [h('span', { class: 'label', text: label }), control, hint ? h('span', { class: 'hint', text: hint }) : null]);
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  return { h: h, add: add, clear: clear, toast: toast, errorText: errorText, modal: modal, closeModal: closeModal,
    isModalOpen: isModalOpen, confirmStep: confirmStep, personField: personField, field: field, download: download };
})();
