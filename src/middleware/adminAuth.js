import { verifyToken } from "../routes/auth.js"

export async function adminAuth(c, next) {
  // CORS Preflight options check
  if (c.req.method === "OPTIONS") return await next()

  // 1. Authorization Header check (Bearer <token>)
  const authHeader = c.req.header("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  // 2. Cookie fallback check
  const cookieHeader = c.req.header("cookie") ?? ""
  const cookieMatch = cookieHeader.match(/ah_token=([^;]+)/)
  const cookieToken = cookieMatch ? cookieMatch[1] : null

  const finalToken = token || cookieToken

  if (!finalToken) {
    return c.json({ success: false, message: "Unauthorized: Token missing. Please log in." }, 401)
  }

  try {
    // Secret sync with auth.js fallback
    const jwtSecret = c.env?.JWT_SECRET || "default_ultra_secure_secret_key_2026"
    
    const payload = await verifyToken(finalToken, jwtSecret)
    
    // Set admin context
    c.set("admin", { username: payload.username, role: payload.role })
    
    await next()
  } catch (err) {
    const expired = err?.code === "ERR_JWT_EXPIRED"
    return c.json({
      success: false,
      message: expired ? "Session expire ho gaya, dobara login karein" : "Unauthorized: Invalid token"
    }, 401)
  }
}
