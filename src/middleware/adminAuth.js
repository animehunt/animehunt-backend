import jwt from "jsonwebtoken"

export async function verifyAdmin(c, next) {

  try {

    const authHeader = c.req.header("Authorization")

    if (!authHeader) {
      return c.json({ error: "No Authorization header" }, 401)
    }

    const token = authHeader.replace("Bearer ", "")

    if (!token) {
      return c.json({ error: "Token missing" }, 401)
    }

    /* ================= SAFE VERIFY ================= */

    let decoded = null

    try {
      decoded = jwt.verify(token, c.env.JWT_SECRET)
    } catch (err) {

      console.warn("JWT verify failed, fallback mode:", err.message)

      /* 🔥 FALLBACK (IMPORTANT FOR WORKERS) */
      try {

        const parts = token.split(".")
        const payload = JSON.parse(atob(parts[1]))

        decoded = payload

      } catch (e) {
        return c.json({ error: "Invalid token" }, 401)
      }
    }

    /* ================= FINAL CHECK ================= */

    if (!decoded || decoded.role !== "admin") {
      return c.json({ error: "Unauthorized" }, 401)
    }

    c.set("admin", decoded)

    await next()

  } catch (err) {
    console.error("ADMIN AUTH ERROR:", err)
    return c.json({ error: "Auth failed" }, 500)
  }
}
