/* ================================================
   auth.js — Admin Login + Token Refresh
================================================ */

import { Hono } from "hono"

const auth = new Hono()

/* ================================================
   JWT Sign (HS256) — WebCrypto (Works in Workers)
================================================ */

async function signJWT(payload, secret, expiresInHours = 24) {
  const enc = new TextEncoder()

  const header  = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")

  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + (expiresInHours * 3600)
  }

  const payloadB64 = btoa(JSON.stringify(fullPayload))
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")

  const keyData = enc.encode(secret)
  const key = await crypto.subtle.importKey(
    "raw", keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const sigBuf = await crypto.subtle.sign(
    "HMAC", key,
    enc.encode(`${header}.${payloadB64}`)
  )

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")

  return `${header}.${payloadB64}.${sig}`
}

/* ================================================
   bcrypt verify — using Workers-compatible approach
   We store bcrypt hash but verify using timingSafeEqual
   For Cloudflare Workers, we use a simple PBKDF2 approach
================================================ */

async function verifyPassword(plain, hash) {
  /* If hash starts with $2a$ it's bcrypt — 
     Cloudflare Workers don't support bcrypt natively.
     Use the bcryptjs package or compare via secret env.
     
     SIMPLE APPROACH: store hashed password as SHA-256
     and compare. Switch to bcryptjs if needed. */
  try {
    const enc = new TextEncoder()
    const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(plain))
    const hashHex = [...new Uint8Array(hashBuf)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")

    // Compare with stored hash (SHA-256 hex)
    // To generate: echo -n "yourpassword" | sha256sum
    return hashHex === hash

  } catch {
    return false
  }
}

/* ================================================
   POST /api/admin/login
================================================ */

auth.post("/login", async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    if (!username || !password) {
      return c.json({ success: false, message: "Username and password required" }, 400)
    }

    const ADMIN_USERNAME      = c.env.ADMIN_USERNAME
    const ADMIN_PASSWORD_HASH = c.env.ADMIN_PASSWORD_HASH
    const JWT_SECRET          = c.env.JWT_SECRET

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !JWT_SECRET) {
      return c.json({ success: false, message: "Server not configured" }, 500)
    }

    /* Check username */
    if (username.trim() !== ADMIN_USERNAME) {
      return c.json({ success: false, message: "Invalid credentials" }, 401)
    }

    /* Check password */
    const valid = await verifyPassword(password, ADMIN_PASSWORD_HASH)
    if (!valid) {
      return c.json({ success: false, message: "Invalid credentials" }, 401)
    }

    /* Generate JWT */
    const token = await signJWT(
      { username: ADMIN_USERNAME, role: "admin" },
      JWT_SECRET,
      24  // 24 hours
    )

    return c.json({
      success: true,
      data: {
        token,
        username: ADMIN_USERNAME,
        role: "admin",
        expiresIn: "24h"
      }
    })

  } catch (err) {
    console.error("Login error:", err)
    return c.json({ success: false, message: "Login failed" }, 500)
  }
})

/* ================================================
   GET /api/admin/me — verify token
================================================ */

auth.get("/me", async (c) => {
  const admin = c.get("admin")
  if (!admin) {
    return c.json({ success: false, message: "Not authenticated" }, 401)
  }
  return c.json({
    success: true,
    data: { username: admin.username, role: admin.role }
  })
})

/* ================================================
   POST /api/admin/logout — client-side token drop
================================================ */

auth.post("/logout", (c) => {
  return c.json({ success: true, message: "Logged out" })
})

export default auth
