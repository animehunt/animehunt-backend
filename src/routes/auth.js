import { Hono } from "hono"
const auth = new Hono()

auth.post("/login", async (c) => {
  const { username, password } = await c.req.json()
  if (username === "anime_moderator_007" && password === "Nim3Chanchal2026") {
    return c.json({ success: true, data: { token: "admin-token-123", username } })
  }
  return c.json({ success: false, message: "Invalid credentials" }, 401)
})

auth.post("/logout", (c) => c.json({ success: true }))
auth.get("/me", (c) => c.json({ success: true }))

export default auth
