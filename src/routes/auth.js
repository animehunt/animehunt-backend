/* ================================================
   auth.js — Admin Login + DEBUGGING MODE (FIXED)
================================================ */

import { Hono } from "hono"
import { adminAuth } from "../middleware/adminAuth.js"

const auth = new Hono()

/* ================================================
   JWT Sign (HS256) — WebCrypto (Works in Workers)
================================================ */
async function signJWT(payload, secret, expiresInHours = 24) {
  const enc = new TextEncoder()
  const header  = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + (expiresInHours * 3600) }
  const payloadB64 = btoa(JSON.stringify(fullPayload)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  const keyData = enc.encode(secret)
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payloadB64}`))
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  return `${header}.${payloadB64}.${sig}`
}

/* ================================================
   SHA-256 Helper (For comparison and debugging)
================================================ */
async function getSHA256(plain) {
  const enc = new TextEncoder()
  const data = enc.encode(plain)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/* ================================================
   POST /api/admin/login (WITH DETAILED DEBUG)
================================================ */
auth.post("/login", async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    if (!username || !password) {
      return c.json({ success: false, message: "Missing username or password" }, 400)
    }

    const ADMIN_USERNAME      = c.env.ADMIN_USERNAME
    const ADMIN_PASSWORD_HASH = c.env.ADMIN_PASSWORD_HASH
    const JWT_SECRET          = c.env.JWT_SECRET

    // 1. Check Configuration
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !JWT_SECRET) {
      return c.json({ 
        success: false, 
        message: `SERVER ENV MISSING: Username=${!!ADMIN_USERNAME}, Hash=${!!ADMIN_PASSWORD_HASH}, Secret=${!!JWT_SECRET}` 
      }, 500)
    }

    // 2. Debug Username Mismatch
    if (username.trim() !== ADMIN_USERNAME) {
      return c.json({ 
        success: false, 
        message: `USERNAME MISMATCH! Entered: '${username}', Expected: '${ADMIN_USERNAME}'` 
      }, 401)
    }

    // 3. Debug Password Hash Mismatch
    const enteredHash = await getSHA256(password)
    if (enteredHash !== ADMIN_PASSWORD_HASH) {
      return c.json({ 
        success: false, 
        message: `PASSWORD MISMATCH!\n• Entered Pass Hash: ${enteredHash}\n• Server Env Current Hash: ${ADMIN_PASSWORD_HASH}\n(If current hash starts with $2a$, it means Cloudflare is still using old bcrypt!)` 
      }, 401)
    }

    /* Generate JWT if everything is correct */
    const token = await signJWT({ username: ADMIN_USERNAME, role: "admin" }, JWT_SECRET, 24)

    return c.json({
      success: true,
      data: { token, username: ADMIN_USERNAME, role: "admin", expiresIn: "24h" }
    })

  } catch (err) {
    return c.json({ success: false, message: `Catch Error: ${err.message}` }, 500)
  }
})

auth.get("/me", adminAuth, async (c) => {
  const admin = c.get("admin")
  if (!admin) return c.json({ success: false, message: "Not authenticated" }, 401)
  return c.json({ success: true, data: { username: admin.username, role: admin.role } })
})

auth.post("/logout", (c) => c.json({ success: true, message: "Logged out" }))

export default auth
