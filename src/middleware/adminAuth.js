// adminAuth.js — verifyToken directly yahan hai, koi import nahi

export async function adminAuth(c, next) {
  if (c.req.method === "OPTIONS") return await next()

  const authHeader = c.req.header("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  const cookieHeader = c.req.header("cookie") ?? ""
  const cookieMatch = cookieHeader.match(/ah_token=([^;]+)/)
  const cookieToken = cookieMatch ? cookieMatch[1] : null

  const finalToken = token || cookieToken

  if (!finalToken) {
    return c.json({ success: false, message: "Unauthorized: Token missing" }, 401)
  }

  try {
    const payload = await verifyToken(finalToken, c.env.JWT_SECRET)
    c.set("admin", { username: payload.username, role: payload.role })
    await next()
  } catch (err) {
    const expired = err?.code === "ERR_JWT_EXPIRED"
    return c.json({
      success: false,
      message: expired ? "Session expire ho gaya" : "Unauthorized: Invalid token"
    }, 401)
  }
}

// ── verifyToken directly yahan — koi bahari import nahi ──
async function verifyToken(token, secret) {
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
    err.code = "ERR_JWT_EXPIRED"
    throw err
  }

  return payload
}
