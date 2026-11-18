// Phase 0: confirm the page can talk to the server
fetch('/api/health')
  .then(r => r.json())
  .then(d => { document.getElementById('status').textContent = `Server OK (version ${d.version})`; })
  .catch(() => { document.getElementById('status').textContent = 'Server not reachable'; });
