// Diary <-> Ledger cross-check.
//  - GET /api/internal/labour : server-to-server (X-Internal-Key), used by the Site Diary weekly report
//  - GET /api/diary-check     : signed-in users (same allowlist as the rest of the app), compares
//                               Ledger attendance with Site Diary entries and returns flags
//  - GET /diary-check.js      : banner script, injected into the app page by server.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRESENT = 'उपस्थित', HALF = 'आधा दिन';
const DIARY_URL = () => (process.env.DIARY_URL || 'https://prowatch-site-diary.onrender.com').replace(/\/$/, '');

function istNow() { return new Date(Date.now() + 5.5 * 3600 * 1000); }
function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameKey = (got) => {
  const want = process.env.INTERNAL_KEY || '';
  if (want.length < 16) return false;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(String(got || '')).digest();
  return crypto.timingSafeEqual(a, b);
};

module.exports = function mount(app, pool, requireAuth) {
  async function loadState() {
    const { rows } = await pool.query('SELECT data FROM ledger_state WHERE id = 1');
    return rows[0] ? rows[0].data : { projects: [], attendance: [] };
  }

  function attendanceByProject(state, from, to) {
    const out = {};
    for (const a of (state.attendance || [])) {
      if (!a.date || a.date < from || a.date > to) continue;
      const k = a.project + '|' + a.date;
      const o = out[k] || (out[k] = { project: a.project, date: a.date, present: 0, half: 0, absent: 0 });
      if (a.status === PRESENT) o.present++; else if (a.status === HALF) o.half++; else o.absent++;
    }
    return Object.values(out);
  }

  app.get('/api/internal/labour', async (req, res) => {
    if (!sameKey(req.get('x-internal-key'))) return res.status(401).json({ error: 'unauthorized' });
    try {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      const from = re.test(req.query.from || '') ? req.query.from : '1970-01-01';
      const to = re.test(req.query.to || '') ? req.query.to : '2999-12-31';
      const state = await loadState();
      res.json({
        projects: (state.projects || []).map(p => ({ id: p.id, name: p.name, status: p.status })),
        attendance: attendanceByProject(state, from, to),
      });
    } catch (e) { console.error('internal labour failed', e); res.status(500).json({ error: 'failed' }); }
  });

  const diaryCheck = async (req, res) => {
    const now = istNow();
    const today = now.toISOString().slice(0, 10);
    const afterSix = now.getUTCHours() >= 18;
    const from = addDays(today, -7);
    const flags = [];
    try {
      const state = await loadState();
      let diary;
      try {
        if (!process.env.INTERNAL_KEY) throw new Error('INTERNAL_KEY not set');
        const r = await fetch(`${DIARY_URL()}/api/internal/diary?from=${from}&to=${today}`, {
          headers: { 'x-internal-key': process.env.INTERNAL_KEY },
          signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) throw new Error('diary http ' + r.status);
        diary = await r.json();
      } catch (e) {
        return res.json({ ok: false, today, flags: [{ level: 'warn', type: 'unavailable', text: 'Site Diary check could not run (' + e.message + ').' }] });
      }
      const projects = state.projects || [];
      const att = attendanceByProject(state, from, today);
      const attDays = {}; // projectId -> Set of dates with someone present/half
      for (const a of att) if (a.present + a.half > 0) (attDays[a.project] = attDays[a.project] || new Set()).add(a.date);
      const diaryDays = {}; // siteId -> Set
      for (const d of diary.days) (diaryDays[d.siteId] = diaryDays[d.siteId] || new Set()).add(d.date);

      const linked = new Set();
      for (const site of diary.sites) {
        let proj = projects.find(p => site.ledgerProjectId && p.id === site.ledgerProjectId);
        if (!proj) {
          const m = projects.filter(p => norm(p.name) === norm(site.name));
          if (m.length > 1) {
            flags.push({ level: 'info', type: 'ambiguous_link', site: site.name, text: `Diary site "${site.name}" matches ${m.length} Ledger projects with the same name. Link it to one (or rename one) so it can be cross-checked.` });
            continue;
          }
          proj = m[0];
        }
        const dd = diaryDays[site.id] || new Set();
        if (!proj) {
          flags.push({ level: 'info', type: 'unlinked_site', site: site.name, text: `Diary site "${site.name}" is not linked to a Ledger project, so it is not cross-checked.` });
          continue;
        }
        linked.add(proj.id);
        const ad = attDays[proj.id] || new Set();
        for (let i = 7; i >= 0; i--) {
          const d = addDays(today, -i);
          const isToday = d === today;
          if (isToday && !afterSix) continue; // today is only judged after 6pm IST
          if (ad.has(d) && !dd.has(d)) flags.push({ level: 'warn', type: 'attendance_no_diary', site: site.name, date: d, text: `${site.name}: attendance marked on ${d} but no Site Diary entry.` });
          else if (dd.has(d) && !ad.has(d)) flags.push({ level: 'warn', type: 'diary_no_attendance', site: site.name, date: d, text: `${site.name}: Site Diary entry on ${d} but no attendance in the Ledger.` });
        }
        if (afterSix && !dd.has(today) && !ad.has(today) && [...dd].some(x => x >= addDays(today, -3))) {
          flags.push({ level: 'warn', type: 'missed_entry', site: site.name, date: today, text: `${site.name}: no Site Diary entry today (active in the last 3 days).` });
        }
      }
      for (const p of projects) {
        if (!linked.has(p.id) && attDays[p.id] && attDays[p.id].size) {
          flags.push({ level: 'info', type: 'unlinked_project', site: p.name, text: `Ledger project "${p.name}" has attendance but no matching Diary site.` });
        }
      }
      flags.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1));
      res.json({ ok: true, today, afterSixIST: afterSix, checked: linked.size, flags });
    } catch (e) {
      console.error('diary-check failed', e);
      res.status(500).json({ ok: false, flags: [{ level: 'warn', type: 'error', text: 'Diary check failed.' }] });
    }
  };
  app.get('/api/diary-check', requireAuth, diaryCheck);
  // Key-based copy for scheduled digests (same JSON as /api/diary-check)
  app.get('/api/internal/diary-flags', (req, res, next) => {
    if (!sameKey(req.get('x-internal-key'))) return res.status(401).json({ error: 'unauthorized' });
    diaryCheck(req, res).catch(next);
  });

  app.get('/diary-check.js', (req, res) => res.type('js').set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'public', 'diary-check-banner.js')));

  // App shell with the banner script added, without editing site-ledger.html
  app.get(['/', '/site-ledger.html'], (req, res, next) => {
    fs.readFile(path.join(__dirname, 'public', 'site-ledger.html'), 'utf8', (err, html) => {
      if (err) return next(err);
      const i = html.lastIndexOf('</body>'); // last one: earlier ones sit inside JS strings
      const out = i < 0 ? html : html.slice(0, i) + '<script src="/diary-check.js" defer></script>' + html.slice(i);
      res.set('Cache-Control', 'no-cache').type('html').send(out);
    });
  });
};
