
import { Hono } from "hono"

const ads = new Hono()

ads.get("/health", (c) => {
  return c.json({
    success: true
  })
})

export default ads
