/* ================================================================
   routes/auth.js — Public Site-User Authentication API
   AnimeHunt Backend — Cloudflare Workers (Hono)

   ⚠️  WHY THIS FILE WAS REBUILT FROM SCRATCH
   The ZIP this module was extracted from did not contain a real
   backend routes/auth.js at all. A file named "auth.js" was present,
   but its content was the *browser* helper that admin HTML pages load
   via <script src="/js/auth.js"> (window.Auth = {...}) — a completely
   different file that happens to share a filename with this one in
   the original project (src/routes/auth.js on the server vs
   public/js/auth.js in the browser). That frontend file has been kept
   and correctly documented separately; see the comment inside it.

   index.js does:
       import auth from "./routes/auth.js"
       app.route("/api/auth", auth)
   ...and mounts it BEFORE the firewall/systemGuard middleware skip
   this exact path prefix, so this route group must default-export a
   Hono app and must keep working even during maintenance mode/DB
   circuit issues, matching the "public, always-reachable" behavior
   index.js already special-cases for /api/auth/*.

   Nothing in the rest of this ZIP specifies what public/site-visitor
   accounts should look like (no `users` table, no signup form, no
   session references anywhere), so this implementation is intentionally
   scoped to a complete, secure, minimal register/login/session flow —
   using the exact same crypto conventions already established by
   middleware/adminAuth.js (PBKDF2-SHA512 password hashing, HMAC-SHA256
   JWTs, both via Web Crypto — no Node.js built-ins, since none of
   those exist in the Workers runtime) so the codebase stays consistent.

   Table: site_users (deliberately NOT named "users" or "admin_users"
   to avoid any collision with the admin table owned by adminAuth.js
   or a possible "users" table owned by another module).

   Routes:
     POST /register          — Create a site_users account
     POST /login              — Login, JWT + refresh token return
     GET  /me                 — Token verify + user info
     POST /refresh             — Refresh access token
     POST /logout               — Invalidate refresh token in DB
     POST /change-password       — Password change (min 8 chars)
================================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* ── Token expiry constants ──
   Shorter-lived than admin tokens by design — site visitors are a much
   larger, less-trusted population than the handful of CMS admins. */
const ACCESS_TOKEN_EXPIRY  = 30 * 60          // 30 minutes (seconds)
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 // 30 days (seconds)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ================================================================
   ENSURE SITE_USERS TABLE
================================================================ */

async function ensureSiteUsersTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS site_users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT    NOT NULL UNIQUE,
        username      TEXT    NOT NULL UNIQUE,
        password      TEXT    NOT NULL,
        refresh_token TEXT    DEFAULT NULL,
        status        TEXT    DEFAULT 'active',
        last_login    TEXT,
        login_count   INTEGER DEFAULT 0,
        created_at    TEXT
      )
    `).run()
  } catch (err) {
    console.error("ensureSiteUsersTable:", err)
  }
}

/* ================================================================
   PBKDF2 HELPERS — Web Crypto API (Cloudflare Workers native)
   Identical scheme to middleware/adminAuth.js for consistency.
   Format: "pbkdf2:sha512:100000:<hex_salt>:<hex_hash>"
================================================================ */

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const salt    = crypto.getRandomValues(new Uint8Array(32))
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("")

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-512", salt, iterations: 100000 },
    keyMaterial,
    512
  )

  const hashHex = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, "0")).join("")

  return `pbkdf2:sha512:100000:${saltHex}:${hashHex}`
}

async function verifyPassword(password, stored) {
  try {
    const parts = stored.split(":")
    if (parts.length !== 5 || parts[0] !== "pbkdf2") return false

    const iterations = parseInt(parts[2], 10)
    const saltHex     = parts[3]
    const storedHash   = parts[4]

    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))

    const encoder      = new TextEncoder()
    const keyMaterial   = await crypto.subtle.importKey(
      "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]
    )

    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-512", salt, iterations },
      keyMaterial,
      512
    )

    const computedHash = Array.from(new Uint8Array(bits))
      .map(b => b.toString(16).padStart(2, "0")).join("")

    /* Constant-time comparison — prevents timing attacks */
    if (computedHash.length !== storedHash.length) return false
    let diff = 0
    for (let i = 0; i < computedHash.length; i++) {
      diff |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i)
    }
    return diff === 0

  } catch {
    return false
  }
}

/* ================================================================
   JWT HELPERS — HMAC-SHA256 via Web Crypto (URL-safe base64)
   Identical scheme to middleware/adminAuth.js. A distinct `type`
   claim ("site_access" / "site_refresh") keeps these tokens from
   being interchangeable with admin tokens even though both are
   signed with the same JWT_SECRET.
================================================================ */

function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/")
  while (str.length % 4) str += "="
  return atob(str)
}

async function signJWT(payload, secret) {
  const encoder = new TextEncoder()
  const header  = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body    = b64url(JSON.stringify(payload))
  const message = `${header}.${body}`

  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )

  const sig    = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  const sigHex = b64url(String.fromCharCode(...new Uint8Array(sig)))

  return `${message}.${sigHex}`
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    const encoder = new TextEncoder()
    const message = `${parts[0]}.${parts[1]}`

    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    )

    const sigBytes = Uint8Array.from(b64urlDecode(parts[2]).split("").map(c => c.charCodeAt(0)))

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(message))
    if (!valid) return null

    const payload = JSON.parse(b64urlDecode(parts[1]))
    if (payload.exp && Date.now() / 1000 > payload.exp) return null

    return payload
  } catch {
    return null
  }
}

/* ================================================================
   EXPORTED MIDDLEWARE — requireSiteAuth
   Available for any future public route in this module (e.g. a
   "my downloads" or "watch history" endpoint) that needs a logged-in
   site visitor without pulling in the admin auth middleware.
================================================================ */

export function requireSiteAuth(env) {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null

    if (!token) return c.json(failure("Token required"), 401)

    const secret  = env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
    const payload = await verifyJWT(token, secret)

    if (!payload || payload.type !== "site_access") {
      return c.json(failure("Invalid or expired token"), 401)
    }

    c.set("siteUser", payload)
    return next()
  }
}

/* ================================================================
   POST /register
================================================================ */

app.post("/register", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json().catch(() => ({}))
    await ensureSiteUsersTable(db)

    const email    = (body.email    || "").trim().toLowerCase()
    const username = (body.username || "").trim().toLowerCase()
    const password = body.password  || ""

    if (!email || !EMAIL_RE.test(email)) {
      return c.json(failure("A valid email is required"), 400)
    }
    if (!username || username.length < 3) {
      return c.json(failure("Username must be at least 3 characters"), 400)
    }
    if (password.length < 8) {
      return c.json(failure("Password must be at least 8 characters"), 400)
    }

    const existing = await db.prepare(
      "SELECT id FROM site_users WHERE email=? OR username=?"
    ).bind(email, username).first()

    if (existing) {
      return c.json(failure("Email or username already in use"), 409)
    }

    const hashed = await hashPassword(password)

    const result = await db.prepare(`
      INSERT INTO site_users (email, username, password, status, created_at)
      VALUES (?, ?, ?, 'active', ?)
    `).bind(email, username, hashed, now()).run()

    return c.json(success({
      id:       result.meta?.last_row_id,
      email,
      username,
      registered: true
    }), 201)

  } catch (err) {
    console.error("auth/register:", err)
    return c.json(failure("Registration failed"), 500)
  }
})

/* ================================================================
   POST /login
================================================================ */

app.post("/login", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json().catch(() => ({}))
    await ensureSiteUsersTable(db)

    const identifier = (body.email || body.username || "").trim().toLowerCase()
    const password    = body.password || ""

    if (!identifier || !password) {
      return c.json(failure("Email/username and password required"), 400)
    }

    const user = await db.prepare(
      "SELECT * FROM site_users WHERE email=? OR username=?"
    ).bind(identifier, identifier).first()

    if (!user) {
      /* Timing-safe — still hash to prevent enumeration */
      await verifyPassword(password, "pbkdf2:sha512:100000:fake:fake")
      return c.json(failure("Invalid credentials"), 401)
    }

    if (user.status && user.status !== "active") {
      return c.json(failure("This account is not active"), 403)
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return c.json(failure("Invalid credentials"), 401)
    }

    const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
    const nowSec  = Math.floor(Date.now() / 1000)

    const accessToken = await signJWT({
      sub: String(user.id), username: user.username, email: user.email,
      type: "site_access", iat: nowSec, exp: nowSec + ACCESS_TOKEN_EXPIRY
    }, secret)

    const refreshToken = await signJWT({
      sub: String(user.id), type: "site_refresh", iat: nowSec, exp: nowSec + REFRESH_TOKEN_EXPIRY
    }, secret)

    await db.prepare(
      "UPDATE site_users SET refresh_token=?, last_login=?, login_count=login_count+1 WHERE id=?"
    ).bind(refreshToken, now(), user.id).run()

    return c.json(success({
      accessToken,
      refreshToken,
      username: user.username,
      email:    user.email
    }))

  } catch (err) {
    console.error("auth/login:", err)
    return c.json(failure("Login failed"), 500)
  }
})

/* ================================================================
   GET /me
================================================================ */

app.get("/me", async (c) => {
  try {
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null

    if (!token) return c.json(failure("Token required"), 401)

    const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
    const payload = await verifyJWT(token, secret)

    if (!payload || payload.type !== "site_access") {
      return c.json(failure("Invalid or expired token"), 401)
    }

    const db = c.env.DB
    await ensureSiteUsersTable(db)

    const user = await db.prepare(
      "SELECT id, email, username, status, last_login FROM site_users WHERE id=?"
    ).bind(payload.sub).first()

    if (!user) return c.json(failure("User not found"), 401)

    return c.json(success(user))

  } catch (err) {
    console.error("auth/me:", err)
    return c.json(failure("Auth check failed"), 500)
  }
})

/* ================================================================
   POST /refresh
================================================================ */

app.post("/refresh", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const { refreshToken } = body

    if (!refreshToken) return c.json(failure("Refresh token required"), 400)

    const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
    const payload = await verifyJWT(refreshToken, secret)

    if (!payload || payload.type !== "site_refresh") {
      return c.json(failure("Invalid or expired refresh token"), 401)
    }

    const db = c.env.DB
    await ensureSiteUsersTable(db)

    const user = await db.prepare(
      "SELECT * FROM site_users WHERE id=? AND refresh_token=?"
    ).bind(payload.sub, refreshToken).first()

    if (!user) return c.json(failure("Refresh token revoked or invalid"), 401)

    const nowSec = Math.floor(Date.now() / 1000)
    const newAccessToken = await signJWT({
      sub: String(user.id), username: user.username, email: user.email,
      type: "site_access", iat: nowSec, exp: nowSec + ACCESS_TOKEN_EXPIRY
    }, secret)

    return c.json(success({ accessToken: newAccessToken }))

  } catch (err) {
    console.error("auth/refresh:", err)
    return c.json(failure("Token refresh failed"), 500)
  }
})

/* ================================================================
   POST /logout
================================================================ */

app.post("/logout", async (c) => {
  try {
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null

    if (token) {
      const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
      const payload = await verifyJWT(token, secret)

      if (payload?.sub) {
        const db = c.env.DB
        await ensureSiteUsersTable(db)
        await db.prepare(
          "UPDATE site_users SET refresh_token=NULL WHERE id=?"
        ).bind(payload.sub).run()
      }
    }

    return c.json(success({ loggedOut: true }))
  } catch (err) {
    console.error("auth/logout:", err)
    return c.json(success({ loggedOut: true })) // Always return success on logout
  }
})

/* ================================================================
   POST /change-password
================================================================ */

app.post("/change-password", async (c) => {
  try {
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!token) return c.json(failure("Token required"), 401)

    const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
    const payload = await verifyJWT(token, secret)
    if (!payload || payload.type !== "site_access") return c.json(failure("Invalid token"), 401)

    const db   = c.env.DB
    const body = await c.req.json().catch(() => ({}))

    if (!body.currentPassword || !body.newPassword) {
      return c.json(failure("currentPassword and newPassword required"), 400)
    }
    if (body.newPassword.length < 8) {
      return c.json(failure("New password must be at least 8 characters"), 400)
    }

    const user = await db.prepare(
      "SELECT id, password FROM site_users WHERE id=?"
    ).bind(payload.sub).first()

    if (!user) return c.json(failure("User not found"), 404)

    const valid = await verifyPassword(body.currentPassword, user.password)
    if (!valid) return c.json(failure("Current password is incorrect"), 401)

    const newHash = await hashPassword(body.newPassword)

    await db.prepare(
      "UPDATE site_users SET password=?, refresh_token=NULL WHERE id=?"
    ).bind(newHash, user.id).run()

    return c.json(success({ changed: true }))

  } catch (err) {
    console.error("auth/change-password:", err)
    return c.json(failure("Password change failed"), 500)
  }
})

export default app

