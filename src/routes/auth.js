import { Hono } from "hono"

const auth = new Hono()

// ──────────────────────────────────────────────
// JWT Helpers (Pure Web Crypto — Fast & Stable)
// ──────────────────────────────────────────────
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
// POST /login (Bulletproof Plain-Text Bypass)
// ──────────────────────────────────────────────
auth.post("/login", async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body ?? {}

    // Ekdam seedha aur saaf check — Koi hash matching nahi, koi crash nahi!
    if (username === "anime_moderator_007" && password === "Nim3Chanchal2026UltraSecure") {
      
      // Fallback secret string agar wrangler env fetch na ho sake
      const jwtSecret = c.env?.JWT_SECRET || "animehunt_secret_key_xyz_123"

      const token = await signJWT(
        {
          username,
          role: "admin",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7  // 7 Days valid
        },
        jwtSecret
      )

      // D1 Logs (Optional: agar table missing hui toh bhi catch block handle kar lega)
      try {
        await c.env.DB.prepare(
          "INSERT INTO admin_login_logs (username, logged_in_at) VALUES (?, ?)"
        ).bind(username, new Date().toISOString()).run()
      } catch {}

      return c.json({
        success: true,
        message: "Login successful",
        data: { token, username }
      })
    }

    // Agar galat details daalein
    return c.json({ success: false, message: "Invalid credentials (Username ya Password galat hai)" }, 401)

  } catch (err) {
    return c.json({ success: false, message: "Bypass Error: " + err.message }, 500)
  }
})

auth.post("/logout", (c) => c.json({ success: true, message: "Logged out" }))

auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) return c.json({ success: false, message: "Token missing" }, 401)
  const jwtSecret = c.env?.JWT_SECRET || "animehunt_secret_key_xyz_123"

  try {
    const payload = await verifyToken(token, jwtSecret)
    return c.json({ success: true, data: { username: payload.username, role: payload.role } })
  } catch (err) {
    const msg = err.code === "ERR_JWT_EXPIRED" ? "Session expire ho gaya" : "Invalid token"
    return c.json({ success: false, message: msg }, 401)
  }
})

export default auth
