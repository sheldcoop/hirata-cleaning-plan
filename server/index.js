// Hirata Cleaning Plan - server entry point (Phase 0 skeleton)
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check (used later by IT hosting)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'hirata-cleaning-plan', version: require('../package.json').version });
});

app.listen(PORT, () => {
  console.log(`Hirata Cleaning Plan running at http://localhost:${PORT}`);
});
