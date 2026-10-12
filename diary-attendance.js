// Read-only view of Site Diary attendance (photo, time, location) inside the Ledger.
//  - GET /api/diary-attendance?from=&to=      : signed-in users; asks the Site Diary (server to server, INTERNAL_KEY)
//  - GET /api/diary-attendance/photo/:id      : signed-in users; streams one attendance photo from the Site Diary
//  - GET /diary-attendance.js                 : the panel script, injected into the app page by diary-check.js
// This module never reads or writes ledger_state. Wages and the Labour page are not touched.
const path = require('path');

module.exports = function mount(app, requireAuth) {
  const DIARY_URL = () => (process.env.DIARY_URL || 'https://prowatch-site-diary.onrender.com').replace(/\/$/, '');
  const re = /^\d{4}-\d{2}-\d{2}$/;

  app.get('/api/diary-attendance', requireAuth, async (req, res) => {
    if (!process.env.INTERNAL_KEY) return res.json({ ok: false, error: 'INTERNAL_KEY not set' });
    const q = new URLSearchParams();
    if (re.test(req.query.from || '')) q.set('from', req.query.from);
    if (re.test(req.query.to || '')) q.set('to', req.query.to);
    try {
      const r = await fetch(`${DIARY_URL()}/api/internal/attendance?${q}`, { headers: { 'x-internal-key': process.env.INTERNAL_KEY }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) return res.json({ ok: false, error: 'diary http ' + r.status });
      const j = await r.json();
      res.set('Cache-Control', 'no-store').json({ ok: true, sites: j.sites || [], days: j.days || [] });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.get('/api/diary-attendance/photo/:id', requireAuth, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !process.env.INTERNAL_KEY) return res.status(404).end();
    try {
      const r = await fetch(`${DIARY_URL()}/api/internal/attendance-photo/${req.params.id}`, { headers: { 'x-internal-key': process.env.INTERNAL_KEY }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) return res.status(r.status === 404 ? 404 : 502).end();
      res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg').set('Cache-Control', 'private, max-age=86400').send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.status(502).end(); }
  });

  app.get('/diary-attendance.js', (req, res) => res.type('js').set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'public', 'diary-attendance.js')));
};
