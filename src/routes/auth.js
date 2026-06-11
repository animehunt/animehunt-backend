import { Hono } from "hono"
import { adminAuth } from "../middleware/adminAuth.js"

const auth = new Hono()

// SHA-256 Hex Generator
async function getSHA256(plainText) {
  const enc = new TextEncoder()
  const data = enc.encode(plainText)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Simple WebCrypto JWT Signer
async function signJWT(payload, secret) {
  const enc = new TextEncoder()
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + (24 * 3600) } // 24 Hours Expire
  const payloadB64 = btoa(JSON.stringify(fullPayload)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payloadB64}`))
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  
  return `${header}.${payloadB64}.${sig}`
}

/* ================= LOGIN ROUTE ================= */
auth.post("/login", async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    if (!username || !password) {
      return c.json({ success: false, message: "Username aur Password dono zaroori hain!" }, 400)
    }

    // Cloudflare Environment Se Values Lena
    const envUser = c.env.ADMIN_USERNAME
    const envHash = c.env.ADMIN_PASSWORD_HASH
    const jwtSecret = c.env.JWT_SECRET

    // Username Verification
    if (username.trim() !== envUser) {
      return c.json({ success: false, message: "Galat Username!" }, 401)
    }

    // Password Verification (SHA-256 Match)
    const inputHash = await getSHA256(password.trim())
    if (inputHash !== envHash) {
      return c.json({ success: false, message: "Galat Password!" }, 401)
    }

    // Create Token
    const token = await signJWT({ username: envUser, role: "admin" }, jwtSecret)

    return c.json({
      success: true,
      data: { token, username: envUser, role: "admin" }
    })

  } catch (err) {
    return c.json({ success: false, message: `Server Error: ${err.message}` }, 500)
  }
})

/* ================= OTHER ROUTES ================= */
auth.get("/me", adminAuth, async (c) => {
  const admin = c.get("admin")
  return c.json({ success: true, data: admin })
})

auth.post("/logout", (c) => {
  return c.json({ success: true, message: "Logged out successfully" })
})

export default auth
