# SECURITY_CHECKLIST.md — everything, in one place, in priority order

Cross-referenced from `README_MIGRATION.md`. Where something already has a
full walkthrough elsewhere (deploy user, nginx/TLS), this points there
instead of repeating it.

## Tier 1 — do before you go live

- [ ] **`.gitignore` is now in this repo** — covers `.env`, keys, `node_modules`. Still double check: `git status` right after your first `git init`/clone on the VPS, before your first commit, and make sure `.env` never shows as trackable.
- [ ] **Redis: require a password, bind to localhost only.** A bare Redis with no auth, reachable from the internet, is one of the most commonly auto-scanned-and-exploited misconfigurations there is. In `/etc/redis/redis.conf`:
  ```
  bind 127.0.0.1 -::1
  requirepass <generate with: openssl rand -hex 32>
  maxmemory 256mb
  maxmemory-policy allkeys-lru
  ```
  Then update `REDIS_URL` in your real `.env` to `redis://:<that password>@127.0.0.1:6379`, and `sudo systemctl restart redis`.
- [ ] **SSH: key-only, no root login, fail2ban.**
  ```
  # /etc/ssh/sshd_config
  PasswordAuthentication no
  PermitRootLogin no
  ```
  ```
  sudo apt install fail2ban && sudo systemctl enable --now fail2ban
  ```
  fail2ban auto-bans IPs after repeated failed SSH attempts — real, automated protection against the brute-force scanning every public IP gets within minutes of going live.
- [ ] **ufw firewall** — only open what's actually needed:
  ```
  sudo ufw allow 22
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw enable
  ```
  Redis's 6379 and your Node app's 3000 should NOT be in this list — they're only reached via `127.0.0.1` (Redis) or nginx's reverse proxy (Node), never directly from outside.
- [ ] **Real TLS, not just the nginx starting point.** `deploy/nginx.conf.example` gives you the reverse-proxy shape; run certbot against it for real certificates and the HTTP→HTTPS redirect (see the comment at the top of that file for the exact command).
- [ ] **`.env` file permissions on the VPS**: `chmod 600 .env` — don't leave secrets world-readable on a multi-user box.
- [ ] **Deploy user setup** — see `deploy/DEPLOY_USER_SETUP.md` in full, don't skip it. This is what stops a leaked CI/CD key from meaning "someone has your whole server."

## Tier 2 — do in the first week

- [ ] **OS security patches on autopilot:**
  ```
  sudo apt install unattended-upgrades
  sudo dpkg-reconfigure --priority=low unattended-upgrades
  ```
- [ ] **`npm audit`** after `npm ci`, and actually read the output — this is a real production app with real dependencies now, not something Cloudflare patched for you at the platform level.
- [ ] **Test a real restore, once.** The R2/checksum reconciliation code is solid, but "the code exists" and "I've confirmed a restore actually works" are different things. Trigger `/db/snapshot` then `/db/restore/*` against a throwaway table once, before you need it for real.
- [ ] **Rotate anything that touched this conversation.** Any credential you pasted into an AI chat, a document, or shared with anyone else during this whole process — Turso tokens, Supabase key, JWT_SECRET, ImageKit private key — treat as best practice to rotate before/shortly after going live, simply because more eyes have seen it than a production secret ideally should.

## Already true — verified, not just assumed

Checked directly against the code, not from memory:

- **Admin login is already rate-limited**: `middleware/firewall.js` has `"/api/admin/auth/login": { limit: 5, window: 300 }` — 5 attempts per 5 minutes, specifically, tighter than the general 200/60s default. This survived the migration untouched.
- **Passwords/JWTs already use PBKDF2 + HMAC-SHA256** via Web Crypto (`adminAuth.js`) — this was already solid before any of this migration work started.
- **The app won't boot without `JWT_SECRET` set** — added during the migration (`index.js`), so it can't silently fall back to the hardcoded placeholder string that's still in the code as a defensive default.
- **DB reconciliation requires admin auth and does checksum comparison before acting** (`dbRestore.js`, `/db/reconcile`) — verified in the previous turn, untouched code, not automatic.
- **CI/CD SSH key can only run one script, ever** — `deploy/DEPLOY_USER_SETUP.md`'s `command=` restriction, not just "the workflow file says to."

## Not code — things only you can decide/do

- Actually create the deploy user (Tier 1) and follow `DEPLOY_USER_SETUP.md`'s steps on your real VPS — I can't SSH in and do this part.
- Get real Turso/Supabase/ImageKit credentials into a real `.env` — I only have placeholders.
- Decide whether to point the per-route `syncToReplicas()` helpers at `TURSO_REPLICA_URL` (the DB3 follow-up mentioned last turn) — still open, say the word.

- 
