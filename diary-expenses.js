// Supervisor money entries from the Site Diary, shown in the Ledger as PENDING until someone here approves them.
//  - GET  /api/diary-expenses?status=pending|all   : signed-in users; asks the Site Diary (server to server, INTERNAL_KEY)
//  - GET  /api/diary-expenses/photo/:id            : signed-in users; streams one receipt photo from the Site Diary
//  - POST /api/diary-expenses/:id/decision         : signed-in users; tells the Diary the entry was approved (with the Ledger transaction id) or rejected
//  - GET  /diary-expenses.js                       : the panel script, injected into the app page by diary-check.js
// This module never reads or writes ledger_state. The browser panel adds an approved entry to the Ledger through the
// app's own save, so the Ledger's normal revision check applies.
const path = require('path');

module.exports = function mount(app, requireAuth) {
  const DIARY_URL = () => (process.env.DIARY_URL || 'https://prowatch-site-diary.onrender.com').replace(/\/$/, '');
  const UUID = /^[0-9a-f-]{36}$/i;
  const H = () => ({ 'x-internal-key': process.env.INTERNAL_KEY });

  app.get('/api/diary-expenses', requireAuth, async (req, res) => {
    if (!process.env.INTERNAL_KEY) return res.json({ ok: false, error: 'INTERNAL_KEY not set' });
    const q = new URLSearchParams();
    if (req.query.status === 'all') q.set('status', 'all');
    try {
      const r = await fetch(`${DIARY_URL()}/api/internal/transactions?${q}`, { headers: H(), signal: AbortSignal.timeout(45000) });
      if (!r.ok) return res.json({ ok: false, error: 'diary http ' + r.status });
      const j = await r.json();
      res.set('Cache-Control', 'no-store').json({ ok: true, sites: j.sites || [], items: j.items || [] });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.get('/api/diary-expenses/photo/:id', requireAuth, async (req, res) => {
    if (!UUID.test(req.params.id) || !process.env.INTERNAL_KEY) return res.status(404).end();
    try {
      const r = await fetch(`${DIARY_URL()}/api/internal/txn-photo/${req.params.id}`, { headers: H(), signal: AbortSignal.timeout(45000) });
      if (!r.ok) return res.status(r.status === 404 ? 404 : 502).end();
      res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg').set('Cache-Control', 'private, max-age=86400').send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.status(502).end(); }
  });

  app.post('/api/diary-expenses/:id/decision', requireAuth, async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ ok: false, error: 'invalid_id' });
    if (!process.env.INTERNAL_KEY) return res.json({ ok: false, error: 'INTERNAL_KEY not set' });
    const b = req.body || {};
    if (b.status !== 'approved' && b.status !== 'rejected') return res.status(400).json({ ok: false, error: 'invalid_status' });
    const by = String((req.user && (req.user.name || req.user.email)) || 'Ledger').slice(0, 120);
    try {
      const r = await fetch(`${DIARY_URL()}/api/internal/transactions/${req.params.id}/decision`, {
        method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, H()),
        body: JSON.stringify({ status: b.status, ledgerTxId: b.ledgerTxId, note: b.note, by }), signal: AbortSignal.timeout(45000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.json({ ok: false, error: j.error || 'diary http ' + r.status });
      res.json({ ok: true, status: j.status });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  app.get('/diary-expenses.js', (req, res) => res.type('js').set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'public', 'diary-expenses.js')));
};
