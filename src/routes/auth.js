import { Hono } from "hono"

const auth = new Hono()

// Bypass Login: Kuch bhi daalo, seedhe andar!
auth.post("/login", async (c) => {
  return c.json({
    success: true,
    data: {
      token: "dummy-bypass-token-xyz",
      username: "anime_moderator_007",
      role: "admin"
    }
  })
})

auth.get("/me", async (c) => {
  return c.json({
    success: true,
    data: { username: "anime_moderator_007", role: "admin" }
  })
})

auth.post("/logout", (c) => c.json({ success: true, message: "Logged out" }))

export default auth
