import jwt from "jsonwebtoken"

export async function verifyAdmin(c, next) {
  try {

    // 🔹 Authorization header
    const authHeader = c.req.header("Authorization")

    if (!authHeader) {
      return c.json({ error: "No Authorization header" }, 401)
    }

    // 🔹 Extract token
    const parts = authHeader.split(" ")

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return c.json({ error: "Invalid Authorization format" }, 401)
    }

    const token = parts[1]

    if (!token) {
      return c.json({ error: "Token missing" }, 401)
    }

    // 🔹 Check secret exists
    if (!c.env.JWT_SECRET) {
      console.error("JWT_SECRET missing in env")
      return c.json({ error: "Server config error" }, 500)
    }

    // 🔹 Verify token
    let decoded
    try {
      decoded = jwt.verify(token, c.env.JWT_SECRET)
    } catch (err) {
      console.error("JWT VERIFY ERROR:", err.message)
      return c.json({ error: "Invalid or expired token" }, 401)
    }

    // 🔹 Attach admin to context
    c.set("admin", decoded)

    // 🔹 Continue request
    await next()

  } catch (err) {
    console.error("ADMIN AUTH CRASH:", err)
    return c.json({ error: "Auth failed" }, 500)
  }
}
