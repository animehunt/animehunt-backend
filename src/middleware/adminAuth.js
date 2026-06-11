/* ================================================
   adminAuth.js — JWT Middleware for Admin Routes
   All /api/admin/* routes (except /login) use this
================================================ */

export async function adminAuth(c, next) {
  try {
    const authHeader = c.req.header("Authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ success: false, message: "No token provided" }, 401)
    }

    const token = authHeader.replace("Bearer ", "").trim()

    if (!token) {
      return c.json({ success: false, message: "Empty token" }, 401)
    }

    const secret = c.env.JWT_SECRET
    if (!secret) {
      return c.json({ success: false, message: "JWT_SECRET not configured" }, 500)
    }

    /* ---- Verify JWT ---- */
    const payload = await verifyJWT(token, secret)

    if (!payload) {
      return c.json({ success: false, message: "Invalid or expired token" }, 401)
    }

    /* ---- Attach admin info to context ---- */
    c.set("admin", payload)

    await next()

  } catch (err) {
    console.error("adminAuth error:", err)
    return c.json({ success: false, message: "Auth failed" }, 401)
  }
}

/* ================================================
   Simple JWT verify (HS256)
   Works in Cloudflare Workers (WebCrypto)
================================================ */

async function verifyJWT(token, secret) {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, sigB64] = parts

    /* Verify signature */
    const enc = new TextEncoder()
    const keyData = enc.encode(secret)

    const key = await crypto.subtle.importKey(
      "raw", keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    )

    const sigBuf = base64UrlDecode(sigB64)
    const data   = enc.encode(`${headerB64}.${payloadB64}`)

    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, data)
    if (!valid) return null

    /* Parse payload */
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    )

    /* Check expiry */
    if (payload.exp && Date.now() / 1000 > payload.exp) return null

    return payload

  } catch {
    return null
  }
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/")
  while (str.length % 4) str += "="
  const bin = atob(str)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}
