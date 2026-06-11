import { Hono } from "hono"
import { adminAuth } from "../middleware/adminAuth.js"

const auth = new Hono()

async function getSHA256(plainText) {
  const enc = new TextEncoder()
  const data = enc.encode(plainText)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function signJWT(payload, secret) {
  const enc = new TextEncoder()
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + (24 * 3600) }
  const payloadB64 = btoa(JSON.stringify(fullPayload)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  const jwtSecret = secret || "SuperSecretFallbackKey2026"
  const key = await crypto.subtle.importKey("raw", enc.encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payloadB64}`))
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")
  return `${header}.${payloadB64}.${sig}`
}

/* ================= LOGIN ROUTE ================= */
auth.post("/login", async (c) => {
  try {
    const body = await c.req.json()
    const username = (body.username || "").trim()
    const password = (body.password || "").trim()

    if (!username || !password) {
      return c.json({ success: false, message: "Username and Password required" }, 400)
    }

    // Direct Check taaki wrangler.toml ka koi lafda hi na rahe
    const isUserValid = (username === "anime_moderator_007")
    const isPassValid = (password === "Nim3Chanchal2026UltraSecure")

    if (!isUserValid || !isPassValid) {
      return c.json({ success: false, message: "Invalid credentials" }, 401)
    }

    const jwtSecret = c.env.JWT_SECRET || "SuperSecretFallbackKey2026"
    const token = await signJWT({ username: "anime_moderator_007", role: "admin" }, jwtSecret)

    return c.json({
      success: true,
      data: { token, username: "anime_moderator_007", role: "admin" }
    })

  } catch (err) {
    return c.json({ success: false, message: `Server Error: ${err.message}` }, 500)
  }
})

auth.get("/me", adminAuth, async (c) => {
  const admin = c.get("admin")
  return c.json({ success: true, data: admin })
})

auth.post("/logout", (c) => c.json({ success: true, message: "Logged out" }))

export default auth
