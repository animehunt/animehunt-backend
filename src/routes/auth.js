
import { Hono } from "hono"

const auth = new Hono()

// ──────────────────────────────────────────────
// SHA-256 hex
// ──────────────────────────────────────────────
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

// ──────────────────────────────────────────────
// JWT sign (HS256) — pure Web Crypto, no jose
// ──────────────────────────────────────────────
// Unicode-safe base64url encode
function b64url(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ""
  bytes.forEach(b => binary += String.fromCharCode(b))
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

async function signJWT(payload, secret) {
  const header  = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body    = b64url(JSON.stringify(payload))
  const data    = `${header}.${body}`

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  const sig    = b64url(String.fromCharCode(...new Uint8Array(sigBuf)))
  return `${data}.${sig}`
}

// ──────────────────────────────────────────────
// JWT verify — exported for adminAuth.js
// ──────────────────────────────────────────────
export async function verifyToken(token, secret) {
  const parts = token.split(".")
  if (parts.length !== 3) throw new Error("Invalid token format")

  const [header, body, sig] = parts
  const data = `${header}.${body}`

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  )

  const sigBytes = Uint8Array.from(
    atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  )
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data))
  if (!valid) throw new Error("Invalid token signature")

  const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")))
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    const err = new Error("Token expired")
    err.code  = "ERR_JWT_EXPIRED"
    throw err
  }

  return payload
}

// ──────────────────────────────────────────────
// POST /login
// ──────────────────────────────────────────────
auth.post("/login", async (c) => {
  let body
  try { body = await c.req.json() }
  catch { return c.json({ success: false, message: "Invalid JSON body" }, 400) }

  const { username, password } = body ?? {}

  if (!username || !password) {
    return c.json({ success: false, message: "Username aur password dono required hain" }, 400)
  }

  if (username !== c.env.ADMIN_USERNAME) {
    return c.json({ success: false, message: "Invalid credentials" }, 401)
  }

  const hash = await sha256Hex(password)
  if (hash !== c.env.ADMIN_PASSWORD_HASH) {
    return c.json({ success: false, message: "Invalid credentials" }, 401)
  }

  const token = await signJWT(
    {
      username,
      role: "admin",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7  // 7 days
    },
    c.env.JWT_SECRET
  )

  // D1 login log (optional — table na ho toh crash nahi hoga)
  try {
    await c.env.DB.prepare(
      "INSERT INTO admin_login_logs (username, logged_in_at) VALUES (?, ?)"
    ).bind(username, new Date().toISOString()).run()
  } catch {}

  return c.json({ success: true, message: "Login successful", data: { token, username } })
})

// ──────────────────────────────────────────────
// POST /logout
// ──────────────────────────────────────────────
auth.post("/logout", (c) => {
  return c.json({ success: true, message: "Logged out" })
})

// ──────────────────────────────────────────────
// GET /me
// ──────────────────────────────────────────────
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) return c.json({ success: false, message: "Token missing" }, 401)

  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET)
    return c.json({ success: true, data: { username: payload.username, role: payload.role } })
  } catch (err) {
    const msg = err.code === "ERR_JWT_EXPIRED" ? "Session expire ho gaya, dobara login karein" : "Invalid token"
    return c.json({ success: false, message: msg }, 401)
  }
})

export default auth
