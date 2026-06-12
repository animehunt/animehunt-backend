import { Hono } from "hono"
const adminAuth = async (c, next) => {
  await next()
}

export { adminAuth }
