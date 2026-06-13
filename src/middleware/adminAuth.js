/* ================================================================
   authAdmin.js — Admin Authentication API
   AnimeHunt Backend — Cloudflare Workers (Hono)

   Routes:
     POST /auth/login   — Login, JWT token return karo
     GET  /auth/me      — Token verify + user info return karo
     POST /auth/logout  — (optional) client-side logout confirm
     POST /auth/change-password — Password change

   Password hashing: PBKDF2-SHA512 via Web Crypto API
   JWT:              HMAC-SHA256 via Web Crypto API
   No external libs needed — pure Workers runtime
================================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* ================================================================
   ENSURE ADMIN TABLE
================================================================ */

async function ensureAdminTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        username     TEXT    NOT NULL UNIQUE,
        password     TEXT    NOT NULL,
        role         TEXT    DEFAULT 'admin',
        last_login   TEXT,
        login_count  INTEGER DEFAULT 0,
        created_at   TEXT
      )
    `).run()
  } catch (err) {
    console.error("ensureAdminTable:", err)
  }
}

/* ================================================================
   PBKDF2 HELPERS — Web Crypto API (Cloudflare Workers native)
================================================================ */

/*
   Password stored format:
   "pbkdf2:sha512:100000:<hex_salt>:<hex_hash>"
*/

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

    /* Constant-time comparison */
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
   JWT HELPERS — HMAC-SHA256 via Web Crypto
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
   SEED DEFAULT ADMIN — Agar table empty ho
   Username: admin
   Password: Nim3Chanchal2026UltraSecure  (PBKDF2-SHA512 hashed)
================================================================ */

async function seedDefaultAdmin(db) {
  try {
    const existing = await db.prepare(
      "SELECT id FROM admin_users WHERE username='admin'"
    ).first()

    if (!existing) {
      /*
         Pre-computed hash of: Nim3Chanchal2026UltraSecure
         Algorithm: PBKDF2-SHA512, 100000 iterations
         Generated: 2026-06-13
         ⚠️  Change this password after first login!
      */
      const storedPassword = "pbkdf2:sha512:100000:b3fd92b0200ec81f3c9c4cbea5cc23d6049cc9eda147b131207b13c012e6821d:74a8ca26ac534ecf885eeea06d5496b8b7aa932de58b2c91dddd775b11d212813e3b9c43dfadb14bace5542e289e8d25f7936e95c2317bb03ac2f8c0d4073dd4"

      await db.prepare(`
        INSERT INTO admin_users (username, password, role, created_at)
        VALUES ('admin', ?, 'admin', ?)
      `).bind(storedPassword, now()).run()

      console.log("✅ Default admin seeded")
    }
  } catch (err) {
    console.error("seedDefaultAdmin:", err)
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
    await seedDefaultAdmin(db)

    const { username, password } = body

    if (!username?.trim() || !password) {
      return c.json(failure("Username and password required"), 400)
    }

    /* Find user */
    const user = await db.prepare(
      "SELECT * FROM admin_users WHERE username=?"
    ).bind(username.trim().toLowerCase()).first()

    if (!user) {
      /* Timing-safe — still verify to prevent username enumeration */
      await verifyPassword(password, "pbkdf2:sha512:100000:fake:fake")
      return c.json(failure("Invalid credentials"), 401)
    }

    /* Verify password */
    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return c.json(failure("Invalid credentials"), 401)
    }

    /* Generate JWT — 24 hour expiry */
    const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
    const payload = {
      sub:      String(user.id),
      username: user.username,
      role:     user.role,
      iat:      Math.floor(Date.now() / 1000),
      exp:      Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    }

    const token = await signJWT(payload, secret)

    /* Update last_login */
    await db.prepare(
      "UPDATE admin_users SET last_login=?, login_count=login_count+1 WHERE id=?"
    ).bind(now(), user.id).run()

    return c.json(success({
      token,
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
================================================================ */

app.get("/auth/me", async (c) => {
  try {
    /* Extract Bearer token */
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null

    if (!token) {
      return c.json(failure("Token required"), 401)
    }

    const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
    const payload = await verifyJWT(token, secret)

    if (!payload) {
      return c.json(failure("Invalid or expired token"), 401)
    }

    /* Optional: Verify user still exists in DB */
    const db   = c.env.DB
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
   POST /auth/logout — Client-side confirm (optional)
================================================================ */

app.post("/auth/logout", async (c) => {
  /* JWT is stateless — actual logout is client-side (token removal)
     This endpoint is just a courtesy response */
  return c.json(success({ loggedOut: true }))
})

/* ================================================================
   POST /auth/change-password
================================================================ */

app.post("/auth/change-password", async (c) => {
  try {
    /* Verify token */
    const authHeader = c.req.header("Authorization") || ""
    const token      = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null

    if (!token) return c.json(failure("Token required"), 401)

    const secret  = c.env.JWT_SECRET || "animehunt-fallback-secret-change-in-env"
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

    /* Hash new password */
    const newHash = await hashPassword(body.newPassword)

    await db.prepare(
      "UPDATE admin_users SET password=? WHERE id=?"
    ).bind(newHash, user.id).run()

    return c.json(success({ changed: true }))

  } catch (err) {
    console.error("auth/change-password:", err)
    return c.json(failure("Password change failed"), 500)
  }
})

export default app
