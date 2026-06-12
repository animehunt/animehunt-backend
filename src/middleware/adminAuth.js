import { verifyToken } from "../routes/auth.js"

export async function adminAuth(c, next) {
  if (c.req.method === "OPTIONS") return await next()

  const authHeader = c.req.header("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  const cookieHeader = c.req.header("cookie") ?? ""
  const cookieMatch = cookieHeader.match(/ah_token=([^;]+)/)
  const cookieToken = cookieMatch ? cookieMatch[1] : null

  const finalToken = token || cookieToken

  if (!finalToken) {
    return c.json({ success: false, message: "Unauthorized: Token missing." }, 401)
  }

  try {
    const jwtSecret = c.env?.JWT_SECRET || "animehunt_secret_key_xyz_123"
    
    const payload = await verifyToken(finalToken, jwtSecret)
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
