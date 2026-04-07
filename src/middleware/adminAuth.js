import jwt from "jsonwebtoken"

/* =========================
HELPERS
========================= */

function unauthorized(c, message = "Unauthorized") {
  return c.json({
    success: false,
    error: message
  }, 401)
}

function forbidden(c, message = "Forbidden") {
  return c.json({
    success: false,
    error: message
  }, 403)
}

function getBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== "string") return null

  const trimmed = authHeader.trim()

  if (!trimmed.toLowerCase().startsWith("bearer ")) return null

  const token = trimmed.slice(7).trim()
  return token || null
}

function decodeJwtPayloadUnsafe(token) {
  const parts = token.split(".")
  if (parts.length < 2) throw new Error("Malformed token")

  const base64Url = parts[1]
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)

  const json = atob(padded)
  return JSON.parse(json)
}

function isProbablyExpired(decoded) {
  if (!decoded || typeof decoded.exp !== "number") return false
  const nowSeconds = Math.floor(Date.now() / 1000)
  return decoded.exp < nowSeconds
}

/* =========================
MAIN MIDDLEWARE
========================= */

export async function verifyAdmin(c, next) {
  try {
    const authHeader = c.req.header("Authorization")
    const token = getBearerToken(authHeader)

    if (!token) {
      return unauthorized(c, "No valid Authorization header")
    }

    const secret = c.env.JWT_SECRET

    if (!secret || typeof secret !== "string") {
      console.error("ADMIN AUTH ERROR: JWT_SECRET missing")
      return c.json({
        success: false,
        error: "Auth configuration missing"
      }, 500)
    }

    let decoded = null

    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ["HS256", "HS384", "HS512"]
      })
    } catch (err) {
      console.warn("JWT verify failed:", err?.message || err)

      /* Fallback decode:
         - only used to read payload shape
         - does NOT bypass role/expiry checks
         - still rejected if malformed/expired
      */
      try {
        decoded = decodeJwtPayloadUnsafe(token)
      } catch {
        return unauthorized(c, "Invalid token")
      }

      if (isProbablyExpired(decoded)) {
        return unauthorized(c, "Token expired")
      }

      /* If signature verification fails, reject.
         Unsafe decode is only for safer diagnostics/parsing.
      */
      return unauthorized(c, "Invalid token")
    }

    if (!decoded || typeof decoded !== "object") {
      return unauthorized(c, "Invalid token payload")
    }

    if (isProbablyExpired(decoded)) {
      return unauthorized(c, "Token expired")
    }

    if (decoded.role !== "admin") {
      return forbidden(c, "Admin access required")
    }

    c.set("admin", {
      id: decoded.id || decoded.userId || null,
      email: decoded.email || null,
      role: decoded.role
    })

    await next()
  } catch (err) {
    console.error("ADMIN AUTH ERROR:", err)
    return c.json({
      success: false,
      error: "Auth failed"
    }, 500)
  }
}
