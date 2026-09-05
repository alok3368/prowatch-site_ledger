require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add a Postgres connection string to .env (see README).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
});

async function initDb() {
  // one row holds the whole shared ledger; session store manages its own table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      last_edited_by TEXT,
      last_edited_by_name TEXT,
      last_edited_at TIMESTAMPTZ,
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
}

// ---------- Access control ----------
// Comma-separated list of Gmail addresses allowed to log in, e.g. "alok@prowatch.in,kapil@prowatch.in"
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// Optional: instead of/alongside a list, allow an entire domain, e.g. "prowatch.in"
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || '').trim().toLowerCase();

function isAllowed(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (ALLOWED_EMAILS.length === 0 && !ALLOWED_DOMAIN) return true; // no restriction configured
  if (ALLOWED_EMAILS.includes(e)) return true;
  if (ALLOWED_DOMAIN && e.endsWith('@' + ALLOWED_DOMAIN)) return true;
  return false;
}

// ---------- Passport / Google OAuth ----------
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
  },
  (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    if (!isAllowed(email)) {
      return done(null, false, { message: 'not-allowed' });
    }
    const user = {
      email,
      name: profile.displayName,
      picture: profile.photos && profile.photos[0] && profile.photos[0].value,
    };
    return done(null, user);
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ---------- Middleware ----------
app.set('trust proxy', 1); // needed on Render/Railway/etc so secure cookies work behind their proxy
app.use(express.json({ limit: '5mb' }));
app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));
app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'not-authenticated' });
}

// ---------- Auth routes ----------
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?login=denied' }),
  (req, res) => res.redirect('/')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.json(req.user);
  }
  res.status(401).json({ error: 'not-authenticated' });
});

// ---------- Shared ledger data (Postgres) ----------
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data, last_edited_by, last_edited_by_name, last_edited_at FROM ledger_state WHERE id = 1');
    if (rows.length === 0) return res.status(204).end(); // no data yet -> client seeds it
    const row = rows[0];
    const state = row.data;
    if (row.last_edited_by) {
      state._meta = {
        lastEditedBy: row.last_edited_by,
        lastEditedByName: row.last_edited_by_name,
        lastEditedAt: row.last_edited_at,
      };
    }
    res.json(state);
  } catch (e) {
    console.error('read state failed', e);
    res.status(500).json({ error: 'read-failed' });
  }
});

app.post('/api/state', requireAuth, async (req, res) => {
  try {
    const state = { ...(req.body || {}) };
    delete state._meta; // meta is derived server-side, don't store it inside the JSON blob
    const meta = {
      lastEditedBy: req.user.email,
      lastEditedByName: req.user.name,
      lastEditedAt: new Date().toISOString(),
    };
    await pool.query(
      `INSERT INTO ledger_state (id, data, last_edited_by, last_edited_by_name, last_edited_at)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET data = $1, last_edited_by = $2, last_edited_by_name = $3, last_edited_at = $4`,
      [state, meta.lastEditedBy, meta.lastEditedByName, meta.lastEditedAt]
    );
    res.json({ ok: true, meta });
  } catch (e) {
    console.error('write state failed', e);
    res.status(500).json({ error: 'write-failed' });
  }
});

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site-ledger.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Site Ledger running on port ${PORT}`);
      if (ALLOWED_EMAILS.length === 0 && !ALLOWED_DOMAIN) {
        console.warn('WARNING: ALLOWED_EMAILS / ALLOWED_DOMAIN not set — any Gmail account can log in.');
      }
    });
  })
  .catch(e => {
    console.error('Failed to initialize database', e);
    process.exit(1);
  });

