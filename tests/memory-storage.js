/** Test-only storage adapter: files kept in memory. Same interface as storage-folder.js. */
window.HCP = window.HCP || {};
window.HCP.adapters = window.HCP.adapters || {};
window.HCP.adapters.memory = function () {
  var files = {};
  return {
    id: 'memory', files: files,
    isSupported: function () { return true; },
    read: function (p) { return Promise.resolve(Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null); },
    write: function (p, t) { files[p] = String(t); return Promise.resolve(); },
    remove: function (p) { delete files[p]; return Promise.resolve(); }
  };
};
