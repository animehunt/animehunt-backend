/* ================================================================
   adminAuth.js — Admin Authentication API
   AnimeHunt Backend — Node.js (migrated from Cloudflare Workers)

   Routes:
     POST /auth/login           — Login, JWT + refresh token return
     GET  /auth/me              — Token verify + user info
     POST /auth/refresh         — Refresh access token
     POST /auth/logout          — Invalidate refresh token in DB
     POST /auth/change-password — Password change (min 12 chars)

   Password hashing: PBKDF2-SHA512 via Web Crypto API
   JWT:              HMAC-SHA256 via Web Crypto API (URL-safe base64)
   No external libs — Web Crypto is a global in Node 20+, same as it
   was in Workers, so none of this needed to change for the migration.

   HARDENING (this pass):
     ✅ Removed the hardcoded fallback JWT secret
        ("animehunt-fallback-secret-change-in-env") that every one of
        this file's five route handlers plus requireAuth() fell back
        to via `env.JWT_SECRET || "..."` if the env var was ever
        unset. index.js already refuses to boot without a real
        JWT_SECRET, which makes this fallback dead code in the
        properly-configured app — but a hardcoded, source-visible
        secret string sitting behind an `||` is still a live footgun
        for any code path that reaches this file without going
        through that boot check (tests, a future entry point, a
        refactor that drops the check). requireSecret() below throws
        instead of ever handing back a known string — every call
        site is already inside a try/catch that turns that into a
        clean error response, so nothing this changes can crash the
        process; it just stops the file from being able to silently
        sign or verify a JWT against a secret an attacker can read
        in this very file.
================================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* Every JWT sign/verify call site goes through this instead of a bare
   `env.JWT_SECRET || "fallback"` — see the HARDENING note above. */
function requireSecret(env) {
  if (!env?.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured")
  }
  return env.JWT_SECRET
}

/* ── Token expiry constants ── */
const ACCESS_TOKEN_EXPIRY  = 15 * 60          // 15 minutes (seconds)
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 // 7 days (seconds)

/* ================================================================
   ENSURE ADMIN TABLE
================================================================ */

async function ensureAdminTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        password      TEXT    NOT NULL,
        role          TEXT    DEFAULT 'admin',
        refresh_token TEXT    DEFAULT NULL,
        last_login    TEXT,
        login_count   INTEGER DEFAULT 0,
        created_at    TEXT
      )
    `).run()

    // Add refresh_token column if table already exists (migration safety)
    try {
      await db.prepare(
        "ALTER TABLE admin_users ADD COLUMN refresh_token TEXT DEFAULT NULL"
      ).run()
    } catch {
      // Column already exists — ignore
    }
  } catch (err) {
    console.error("ensureAdminTable:", err)
  }
}

/* ================================================================
   PBKDF2 HELPERS — Web Crypto API
   Format: "pbkdf2:sha512:100000:<hex_salt>:<hex_hash>"
================================================================ */

async function hashPassword(password) {
  const encoder  = new TextEncoder()
  const salt     = crypto.getRandomValues(new Uint8Array(32))
  const saltHex  = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("")

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name:       "PBKDF2",
      hash:       "SHA-512",
      salt:       salt,
      iterations: 100000
    },
    keyMaterial,
    512
  )

  const hashHex = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, "0")).join("")

  return `pbkdf2:sha512:100000:${saltHex}:${hashHex}`
}

async function verifyPassword(password, stored) {
  try {
    const parts      = stored.split(":")
    if (parts.length !== 5 || parts[0] !== "pbkdf2") return false

    const iterations = parseInt(parts[2], 10)
    const saltHex    = parts[3]
    const storedHash = parts[4]

    const salt = new Uint8Array(
      saltHex.match(/.{2}/g).map(b => parseInt(b, 16))
    )

    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    )

    const bits = await crypto.subtle.deriveBits(
      {
        name:       "PBKDF2",
        hash:       "SHA-512",
        salt:       salt,
        iterations: iterations
      },
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
================================================================ */

function b64url(str) {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
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
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
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
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    )

    const sigBytes = Uint8Array.from(
      b64urlDecode(parts[2]).split("").map(c => c.charCodeAt(0))
    )

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(message)
    )

    if (!valid) return null

    const payload = JSON.parse(b64urlDecode(parts[1]))

    /* Expiry check */
    if (payload.exp && Date.now() / 1000 > payload.exp) return null

    return payload

  } catch {
    return null
  }
}

/* ================================================================
   SEED DEFAULT ADMIN — if the table is empty
   Username: admin
   Password: from ADMIN_INITIAL_PASSWORD env var, or a fresh random
             password generated per-deploy (never hardcoded in source —
             a static hash here would mean every deployment of this
             file shares one admin password until someone remembers
             to change it). Change the password after first login
             regardless of which path was used.
================================================================ */

function generateRandomPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*"
  const bytes    = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("")
}

async function seedDefaultAdmin(db, env = {}) {
  try {
    const existing = await db.prepare(
      "SELECT id FROM admin_users WHERE username='admin'"
    ).first()

    if (!existing) {
      const usingProvidedSecret = !!env.ADMIN_INITIAL_PASSWORD
      const plainPassword = usingProvidedSecret
        ? env.ADMIN_INITIAL_PASSWORD
        : generateRandomPassword()

      const storedPassword = await hashPassword(plainPassword)

      await db.prepare(`
        INSERT INTO admin_users (username, password, role, created_at)
        VALUES ('admin', ?, 'admin', ?)
      `).bind(storedPassword, now()).run()

      if (usingProvidedSecret) {
        console.log("✅ Default admin seeded using ADMIN_INITIAL_PASSWORD env var")
      } else {
        // Printed once, only to the process's own log at first request after
        // deploy — never written to a file, never returned over the API,
        // never stored anywhere else.
        console.log(
          "✅ Default admin seeded — ADMIN_INITIAL_PASSWORD was not set, " +
          `so a random password was generated: ${plainPassword}\n` +
          "   ⚠️  Save this now and change it after first login — it will not be shown again. " +
          "   To set your own instead: add ADMIN_INITIAL_PASSWORD=... to your .env file and restart."
        )
      }
    }
  } catch (err) {
    console.error("seedDefaultAdmin:", err)
  }
}

/* ================================================================
   EXPORTED MIDDLEWARE — requireAuth
   Used by: index.js's adminRoutes, gating every admin route
================================================================ */

export function requireAuth(env) {
  return async (c, next) => {
    try {
      const authHeader = c.req.header("Authorization") || ""
      const token      = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null

      if (!token) {
        return c.json(failure("Token required"), 401)
      }

      const secret  = requireSecret(env)
      const payload = await verifyJWT(token, secret)

      if (!payload) {
        return c.json(failure("Invalid or expired token"), 401)
      }

      // Attach decoded admin info to context
      c.set("admin", payload)
      return next()

    } catch (err) {
      console.error("requireAuth:", err)
      return c.json(failure("Auth check failed"), 500)
    }
  }
}

/* ================================================================
   POST /auth/login
================================================================ */

app.post("/auth/login", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    await ensureAdminTable(db)
    await seedDefaultAdmin(db, c.env)

    const { username, password } = body

    if (!username?.trim() || !password) {
      return c.json(failure("Username and password required"), 400)
    }

    /* Find user */
    const user = await db.prepare(
      "SELECT * FROM admin_users WHERE username=?"
    ).bind(username.trim().toLowerCase()).first()

    if (!user) {
      /* Timing-safe — still hash to prevent username enumeration */
      await verifyPassword(password, "pbkdf2:sha512:100000:fake:fake")
      return c.json(failure("Invalid credentials"), 401)
    }

    /* Verify password */
    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return c.json(failure("Invalid credentials"), 401)
    }

    const secret = requireSecret(c.env)
    const nowSec = Math.floor(Date.now() / 1000)

    /* Generate access token — 15 minutes */
    const accessPayload = {
      sub:      String(user.id),
      username: user.username,
      role:     user.role,
      type:     "access",
      iat:      nowSec,
      exp:      nowSec + ACCESS_TOKEN_EXPIRY
    }
    const accessToken = await signJWT(accessPayload, secret)

    /* Generate refresh token — 7 days */
    const refreshPayload = {
      sub:  String(user.id),
      type: "refresh",
      iat:  nowSec,
      exp:  nowSec + REFRESH_TOKEN_EXPIRY
    }
    const refreshToken = await signJWT(refreshPayload, secret)

    /* Store refresh token in DB + update last_login */
    await db.prepare(
      "UPDATE admin_users SET refresh_token=?, last_login=?, login_count=login_count+1 WHERE id=?"
    ).bind(refreshToken, now(), user.id).run()

    return c.json(success({
      accessToken,
      refreshToken,
      username: user.username,
      role:     user.role
    }))

  } catch (err) {
    console.error("auth/login:", err)
    return c.json(failure("Login failed"), 500)
  }
})

/* ================================================================
   GET /auth/me — Token verify + user info
   Used by: Auth.protect() in frontend HTML files
================================================================ */

app.get("/auth/me", async (c) => {
  try {
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null

    if (!token) {
      return c.json(failure("Token required"), 401)
    }

    const secret  = requireSecret(c.env)
    const payload = await verifyJWT(token, secret)

    if (!payload) {
      return c.json(failure("Invalid or expired token"), 401)
    }

    const db = c.env.DB
    await ensureAdminTable(db)

    const user = await db.prepare(
      "SELECT id, username, role, last_login FROM admin_users WHERE id=?"
    ).bind(payload.sub).first()

    if (!user) {
      return c.json(failure("User not found"), 401)
    }

    return c.json(success({
      id:         user.id,
      username:   user.username,
      role:       user.role,
      last_login: user.last_login
    }))

  } catch (err) {
    console.error("auth/me:", err)
    return c.json(failure("Auth check failed"), 500)
  }
})

/* ================================================================
   POST /auth/refresh
   Used by: auth.js in frontend (Auth.init() token refresh flow)
   Dependency: frontend calls POST /api/admin/auth/refresh
================================================================ */

app.post("/auth/refresh", async (c) => {
  try {
    const body = await c.req.json()
    const { refreshToken } = body

    if (!refreshToken) {
      return c.json(failure("Refresh token required"), 400)
    }

    const secret  = requireSecret(c.env)
    const payload = await verifyJWT(refreshToken, secret)

    if (!payload) {
      return c.json(failure("Invalid or expired refresh token"), 401)
    }

    /* Verify this is actually a refresh token (not access token) */
    if (payload.type !== "refresh") {
      return c.json(failure("Invalid token type"), 401)
    }

    /* Verify refresh token matches what's stored in DB */
    const db = c.env.DB
    await ensureAdminTable(db)

    const user = await db.prepare(
      "SELECT * FROM admin_users WHERE id=? AND refresh_token=?"
    ).bind(payload.sub, refreshToken).first()

    if (!user) {
      return c.json(failure("Refresh token revoked or invalid"), 401)
    }

    /* Generate new access token — 15 minutes */
    const nowSec = Math.floor(Date.now() / 1000)
    const newAccessPayload = {
      sub:      String(user.id),
      username: user.username,
      role:     user.role,
      type:     "access",
      iat:      nowSec,
      exp:      nowSec + ACCESS_TOKEN_EXPIRY
    }
    const newAccessToken = await signJWT(newAccessPayload, secret)

    return c.json(success({
      accessToken: newAccessToken
    }))

  } catch (err) {
    console.error("auth/refresh:", err)
    return c.json(failure("Token refresh failed"), 500)
  }
})

/* ================================================================
   POST /auth/logout
   Invalidates the refresh token in DB — actual session invalidation,
   not just a courtesy response.
================================================================ */

app.post("/auth/logout", async (c) => {
  try {
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null

    if (token) {
      const secret  = requireSecret(c.env)
      const payload = await verifyJWT(token, secret)

      if (payload?.sub) {
        /* Clear refresh token from DB — actual session invalidation */
        const db = c.env.DB
        await ensureAdminTable(db)
        await db.prepare(
          "UPDATE admin_users SET refresh_token=NULL WHERE id=?"
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
   POST /auth/change-password
   Both /auth/change-password and /auth/reset-password paths
   supported for frontend compatibility.
================================================================ */

async function handleChangePassword(c) {
  try {
    /* Verify token */
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null

    if (!token) return c.json(failure("Token required"), 401)

    const secret  = requireSecret(c.env)
    const payload = await verifyJWT(token, secret)
    if (!payload)  return c.json(failure("Invalid token"), 401)

    const db   = c.env.DB
    const body = await c.req.json()

    if (!body.currentPassword || !body.newPassword) {
      return c.json(failure("currentPassword and newPassword required"), 400)
    }

    if (body.newPassword.length < 12) {
      return c.json(failure("New password must be at least 12 characters"), 400)
    }

    /* Get current stored password */
    const user = await db.prepare(
      "SELECT id, password FROM admin_users WHERE id=?"
    ).bind(payload.sub).first()

    if (!user) return c.json(failure("User not found"), 404)

    /* Verify current password */
    const valid = await verifyPassword(body.currentPassword, user.password)
    if (!valid) return c.json(failure("Current password is incorrect"), 401)

    /* Hash new password and update */
    const newHash = await hashPassword(body.newPassword)

    await db.prepare(
      "UPDATE admin_users SET password=?, refresh_token=NULL WHERE id=?"
    ).bind(newHash, user.id).run()

    return c.json(success({ changed: true }))

  } catch (err) {
    console.error("auth/change-password:", err)
    return c.json(failure("Password change failed"), 500)
  }
}

app.post("/auth/change-password", handleChangePassword)
app.post("/auth/reset-password",  handleChangePassword)

export default app


