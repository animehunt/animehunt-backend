# README_MIGRATION.md — what changed in this copy of the codebase

This is your `animehunt-backend` with the Cloudflare → VPS migration applied,
per the full migration report (`AnimeHunt_Migration_Report.md`). Read this
file before deploying anything.

## ⚠️ SQL schema audit (separate upload) found 2 more real bugs, now fixed here

A separate `sql.zip` upload (6 conflicting schema export files) got the same full-coverage audit treatment — see `SQL_AUDIT_REPORT.md` and `FINAL_COMPLETE_schema.sql` if you have them alongside this zip. Two of the findings required matching code changes, already applied in this backend:

- **`system_settings` name collision** — `system.js` and `seoAdmin.js`/`publicSEO.js` independently used the same table name for two incompatible designs. Fixed `publicSEO.js` and `seoAdmin.js` (2 spots) to read/write a `robots_txt` column on the real (wide-row) table instead of a conflicting key/value table.
- **FTS5 search index datatype bug** — `anime_fts` was external-content mode tied to `anime.id`, which is `TEXT` (UUID) — confirmed against a real SQLite engine that this throws `datatype mismatch` on the first real insert. Fixed `searchAdmin.js` (table creation + rebuild-index) and `publicSearch.js` (the JOIN) to use a standalone FTS5 table instead. Tested working end-to-end.

## ✅ RESOLVED: `src/routes/auth.js` — deleted

Confirmed: the live site has no public/visitor login, only the admin
panel requires auth. The fabricated `routes/auth.js` file (see git
history / the earlier zip if you want to see what it contained) has been
removed, along with its import and mount in `index.js`. Admin login
(`adminAuth.js` / `adminAuthApp`, mounted at `/api/admin/auth/login`) is
untouched and unaffected — it was never the file in question.

## Auth strategy going forward

- **Admin panel** — keep the existing custom system. Already verified solid (PBKDF2 password hashing, HMAC-signed JWT via Web Crypto), low user count, no reason to add a paid dependency for this.
- **No public/visitor auth needed** — confirmed, nothing to build.
- If visitor accounts ever become a real feature later: Supabase Auth is worth a look before building custom again — you already have the Supabase account (it's DB2 in the trio), its free tier covers 50,000 monthly *active* (i.e. actually-logging-in) users which is a very different, much smaller number than total daily visitors, and it avoids adding a new paid vendor when this whole migration was partly about reducing vendor costs.

## New files

| File | What it does |
|---|---|
| `src/adapters/d1Libsql.js` | Makes Turso look like `env.DB` did on Workers, so every route file's `env.DB.prepare(...).bind(...).all()/.first()/.run()` call works unmodified. |
| `src/adapters/kvRedis.js` | Same idea for `env.KV`, backed by Redis. |
| `src/adapters/r2S3.js` | Same idea for `env.R2_BUCKET` (used only by `dbRestore.js`'s snapshot/restore feature), backed by R2's S3-compatible API — you keep the same R2 bucket, just talk to it differently. Returns `null` (same as an unbound Workers binding) if you leave the `R2_*` env vars blank, which the existing code already handles gracefully. |
| `.env.example` | Every environment variable the app needs now. Copy to `.env` and fill in real values. |
| `ecosystem.config.js` | PM2 process-manager config. |
| `deploy/nginx.conf.example` | Reverse proxy + where the admin panel gets served from. |

## Modified files

- **`src/index.js`** — rewritten entry point: loads `.env`, builds the `env` object from `process.env` + the three adapters above, starts a real Node server via `@hono/node-server` instead of exporting `{fetch, scheduled}`, and adds a secret-protected `POST /internal/run-cron` route to replace the Workers Cron Trigger (wire this to a real crontab entry — the exact line is in a comment right above that route). **Every route import and every `app.route(...)` registration is otherwise byte-for-byte identical to your original file** — none of that needed to change.
- **`package.json`** — Workers/wrangler scripts replaced with `start`/`dev`; added `@hono/node-server`, `@libsql/client`, `ioredis`, `@aws-sdk/client-s3`, `dotenv`.
- **7 files with a `CF-Connecting-IP` fallback added** (`middleware/dbSync.js`, `routes/ads.js`, `routes/publicSearch.js`, `routes/analytics.js`, `routes/banners.js`, `ai/playerEngine.js` ×3 call sites) — each now tries `CF-Connecting-IP` first, falls back to `x-forwarded-for`, same as `middleware/firewall.js` already did. Works whether or not you keep Cloudflare in front (report §1.1) — if you do, `CF-Connecting-IP` keeps winning and nothing changes; if you don't, the fallback kicks in automatically.
- **`ai/playerEngine.js`** — additionally: removed the dead `.pages.dev`/`.workers.dev` origin checks, removed the Workers-only `cf:{cacheTtl:0}` fetch option (was already a harmless no-op on Node, just cleaned up), and added a comment on the `cf-ipcountry` region-block explaining it only works if Cloudflare stays in front.
- **`routes/dashboard.js`** — `dbD1` status now actually tests the connection instead of being hardcoded to `"Connected"`.
- **`routes/deploy.js`** — added a comment clarifying that `d1: true` and the `turso` check below it now report on the same underlying connection.
- **`routes/auth.js`** — deleted (see resolved note at the top of this README).
- **Admin panel: `index.html`, `system-settings.html`, `deploy-backup.html`** — the hardcoded "Cloudflare D1" text label now says "Turso (libSQL)".

## What was *not* touched, on purpose

Every other route/middleware file works with the D1 and KV adapters exactly
as they were written — no per-file changes needed. See the full report for
why (short version: this codebase already used a small, consistent set of
methods for both, and D1/Turso share the same SQL dialect).

## Final architecture (updated after review)

100% cloud, no local SQLite file, no Bun — stayed on Node.js since almost
everything below was already built and tested:

- **DB1 Primary** — your existing Turso DB, via `src/adapters/d1Libsql.js` (unchanged from before)
- **DB2 Replica** — Supabase (unchanged, was already wired up)
- **DB3 Replica** — a **second, independent Turso database**, credentials in `.env` as `TURSO_REPLICA_URL`/`TURSO_REPLICA_AUTH_TOKEN`, exposed as `c.env.TURSO_REPLICA` (a ready `@libsql/client`). Optional — leave blank to skip it for now, same as R2.
- **KV** — Redis via `src/adapters/kvRedis.js` (already used `SCAN`, not `KEYS`, no changes needed)

**DB3 wiring — done.** All 17 files' write/read/health-check functions that were re-hitting the primary Turso credentials under a different name now correctly target `TURSO_REPLICA_URL`/`TURSO_REPLICA_AUTH_TOKEN` instead: the 15 per-route `syncToReplicas()`-style helpers, `src/db.js`'s core `tursoQuery()` (the function the whole D1→Turso→Supabase fallback waterfall routes through), `dbRestore.js`'s `checkTursoHealth`/`fetchAllFromTurso`/`bulkWriteToTurso`/the two replay/dead-letter-queue write paths, and `dashboard.js`'s `/dashboard/sync-check`. Verified via `node --check` across the whole project after each change, plus a final exhaustive grep sweep for any remaining bare `TURSO_AUTH_TOKEN` reference. The only intentionally-untouched `TURSO_URL`/`TURSO_AUTH_TOKEN` references left are the 4 legitimate "is my primary configured" status-display booleans (`system.js`, `deploy.js`, `dashboard.js`) and the primary connection setup in `index.js` itself.

**On the "auto-heal a wiped replica" idea:** deliberately not built as
automatic. `src/routes/dbRestore.js` (untouched, already existed) already
has exactly what was asked for instead — `POST /db/reconcile` and four
`POST /db/restore/*` routes, all behind `requireAuth` (mounted under
`adminRoutes` in `index.js`), each doing real conflict/checksum comparison
before touching anything. Nothing fires on its own; a human — or your own
scheduled task, if you later choose to add one deliberately — has to call
these endpoints.

## CI/CD — secure deploy pipeline

New: `.github/workflows/deploy.yml`, `deploy/deploy.sh`, and
`deploy/DEPLOY_USER_SETUP.md`. **Read `DEPLOY_USER_SETUP.md` and do those
steps before adding the GitHub secrets** — it walks through creating a
locked-down `deploy` user whose SSH key can only ever run `deploy.sh`
(enforced server-side via a `command=` restriction in `authorized_keys`,
not by trusting the workflow YAML to behave), instead of using a root key
in `VPS_SSH_KEY`.



## ⚠️ Pre-existing bugs found during final QA pass

Ran a systematic scan (every route registration across every file, cross-referenced against mount points in `index.js`) rather than relying on manual reading alone. Found 3 real route conflicts, 2 now fixed:

1. **`downloads.js` vs `bulk-upload.js`** — both register `POST /bulk-upload/download-links`, two genuinely different implementations of CSV import. `downloads.js`'s version wins (mounted first); `bulk-upload.js`'s is dead code. **Not fixed** — both looked like comparably complete implementations, not an obvious "one is obsolete" case like the two below, so picking one is a product call, not mine to make. Worth deciding and deleting the other.
2. **`robots.js` vs `publicSEO.js`** — both handled `GET /robots.txt`. `robots.js` was a tiny 13-line static stub; `publicSEO.js`'s version (which was already winning) is a full implementation with KV caching and an admin-configurable custom robots.txt via `system_settings`. **Fixed — `robots.js` deleted**, it was pure dead weight.
3. **`sitemap.js` vs `publicSEO.js`** — both handled `GET /sitemap.xml`. `sitemap.js` generated a real XML sitemap directly; `publicSEO.js`'s version (already winning) 301-redirects to `/sitemap-index.xml`, a separate, fully-implemented, KV-cached route also in `publicSEO.js`. Verified that redirect target is real and complete before deleting anything. **Fixed — `sitemap.js` deleted.**

One near-miss worth mentioning: my first pass of this scan also flagged 3 `DELETE /api/admin/seo:robots` "conflicts" in `seoAdmin.js` — investigated and these were false positives, `"seo:robots"` there is a Redis/KV cache key being deleted (`c.env.KV.delete("seo:robots")`), not a route registration; my scanner's regex didn't distinguish HTTP-router `.delete()` from object `.delete()`.

While fixing #2/#3, I made and then caught my own mistake: removing the `robots`/`sitemap` imports briefly took the `recommendations` and `trending` route mounts down with them (bad copy-paste on my end). Caught immediately by re-running the same verification scripts afterward — restored, then re-verified clean.

Also ran a bracket-depth-aware scan of all 367 static `.prepare(sql).bind(args)` calls in the codebase, checking SQL `?` placeholder counts against actual bound argument counts (a real, classic bug class). All clean — a first pass of this check flagged 29 false positives from a bug in my own extraction regex (nested function calls like `JSON.stringify(x)` inside a `.bind()` call were tripping up naive paren-matching), corrected and re-verified at 0 real mismatches.

## Additional verification pass (CSRF + admin panel XSS)

- **CSRF**: verified, not just assumed — `middleware/adminAuth.js` has zero `Set-Cookie`/cookie usage anywhere. Tokens go in the JSON response body and the client attaches them manually as an `Authorization` header, so there's no browser-automatic-cookie-attachment for a malicious page to exploit. Not applicable here in the classic sense.
- **Admin panel XSS**: audited all 23 HTML files for unescaped dynamic data going into `innerHTML`. Found and fixed 3 genuine gaps (`analytics.html`'s dimension-key display, `system-settings.html`'s log viewer, `performance.html`'s tips list — the last one lower-risk since it's server-generated text, fixed anyway for consistency). Checked `deploy-backup.html`'s one unescaped interpolation and confirmed it's always a hardcoded caller string, not user data — left as-is. All fixes use the same `escapeHtml()` pattern already used consistently elsewhere in this admin panel.

## What you still need to do (can't be done from here)

1. **Export your real D1 data**: `wrangler d1 export animehunt --output=schema-and-data.sql` against your actual live database — this upload didn't include `schema.sql`, so nothing here has your real schema/data.
2. **Provision the VPS**: Node LTS (pin via nvm), Redis (`maxmemory 256mb`, `maxmemory-policy allkeys-lru`), nginx, PM2, `ufw`, log rotation — see `deploy/SECURITY_CHECKLIST.md` for the full, prioritized list.
3. **Create real credentials**: primary Turso DB, DB3 (second Turso DB), Supabase, and R2 API token if you're keeping the snapshot feature — fill these into your real `.env`.
4. **Decide on §1.1**: keep Cloudflare's proxy in front of the VPS (recommended — free DDoS protection, `CF-Connecting-IP`/`cf-ipcountry` keep working with zero further changes) or go fully origin-direct (the `x-forwarded-for` fallbacks already added will carry the load instead).
5. ~~Resolve the `auth.js` question~~ — done, deleted, no public login exists.
6. ~~Wire DB3 into the write/read paths~~ — done, see "Final architecture" above.
7. ~~Verify CSRF risk and audit the admin panel for XSS~~ — done, see above.
8. **Point an uptime monitor** at `/api/system/health`.
9. Follow `deploy/DEPLOY_USER_SETUP.md` on your real VPS, then deploy, smoke-test auth + a few read/write routes, then cut DNS over. Keep the Workers deployment as a rollback path for a week or two.

**Everything above this list is code/config, and it's done.** Items 2, 3, 4, 8, and 9 are the ones that only happen on your actual server — no amount of further code from me closes those out, they need your hands on the real VPS.

