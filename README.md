# साइट लेजर — Setup Guide

This turns the Site Ledger into a real shared web app: everyone on the team
logs in with their own Gmail/Google Workspace account, and everyone reads and
writes the **same** ledger — stored permanently in a Postgres database, not
in the browser. It also has a Hindi/English toggle in the sidebar.

## What changed from the old artifact version
- Data now lives in a Postgres database instead of browser-only storage.
- Login is required (Google OAuth) before the app loads.
- Every new transaction is stamped with the email of whoever added it.
- The sidebar shows who last saved changes and when.
- A हिंदी / English toggle switches all UI text (data you type — descriptions,
  project/party names, custom categories — stays exactly as you typed it,
  since that's your content, not app text).

---

## 1. Create Google OAuth credentials (10 min, one-time)

1. Go to https://console.cloud.google.com/ and create a new project (or use an existing one).
2. Go to **APIs & Services → OAuth consent screen**.
   - User type: **Internal** if you have Google Workspace for your domain (recommended — restricts login to your company domain automatically), otherwise **External**.
   - Fill in app name ("Prowatch Site Ledger"), your email, save.
   - If External: add the emails of your team under **Test users** while the app is unpublished (unpublished apps work fine indefinitely for a small internal team).
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorized redirect URIs: add `https://YOUR-DOMAIN/auth/google/callback`
     (use `http://localhost:3000/auth/google/callback` for local testing).
4. Copy the **Client ID** and **Client Secret** — you'll need them below.

## 2. Get a Postgres database

Any Postgres works. Easiest options:
- **Render.com**: New → PostgreSQL → free tier is enough for a small team. Once created, copy its "Internal Connection String" (use the internal one if your web service is also on Render — it's faster and free; use the external one if connecting from elsewhere).
- **Railway.app**: New → Database → PostgreSQL, then copy the connection string from its Variables tab.
- **Supabase**: also has a generous free Postgres tier if you prefer that.

## 3. Configure environment variables

Copy `.env.example` to `.env` and fill in:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://YOUR-DOMAIN/auth/google/callback
SESSION_SECRET=<random string>
DATABASE_URL=postgres://user:password@host:5432/dbname
ALLOWED_EMAILS=alok@yourcompany.com,kapil@yourcompany.com
```

`ALLOWED_EMAILS` is your safeguard — only these Gmail addresses can log in,
even though Google login itself is open. Add every teammate's Gmail here,
comma-separated. (If your team uses Google Workspace with a single company
domain, you can use `ALLOWED_DOMAIN=yourcompany.com` instead and skip listing
each person.)

## 4. Run it

Locally, to test:
```
npm install
npm start
```
Open http://localhost:3000 — you'll be asked to log in with Google, then land on the ledger.
The app creates its own database table automatically on first start — no manual migration needed.

## 5. Deploy so your team can reach it

**Render.com** (simplest — and keeps your app and database on the same platform)
1. Push this folder to a GitHub repo (private repo is fine).
2. On Render: New → Web Service → connect the repo.
3. Build command: `npm install`, Start command: `npm start`.
4. Add the same environment variables from `.env` in Render's dashboard — for `DATABASE_URL`, use the Internal Connection String from the Postgres database you created in step 2.
5. Once deployed, copy the `https://your-app.onrender.com` URL, go back to
   Google Cloud Console and update the Authorized redirect URI and
   `GOOGLE_CALLBACK_URL` to match it exactly.

**Railway.app** — same idea: connect repo, set env vars, deploy.

Either way, the URL Render/Railway gives you is what you share with your team
(e.g. bookmark it, or point a subdomain like `ledger.theprowatch.com` at it
later if you want a nicer address).

## Notes
- Data now persists in Postgres, so it will **not** be lost on redeploys or restarts — this was the main gap in the earlier file-based version.
- Back up your database periodically regardless (most hosts offer automated daily backups on paid tiers — worth turning on once this holds real accounting data).
- The language toggle is a per-device preference (stored in the browser), so each teammate can pick Hindi or English independently without affecting anyone else.

