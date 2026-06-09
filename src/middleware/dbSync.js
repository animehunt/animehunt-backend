// ============================================================
// src/middleware/dbSync.js  —  Auto DB Sync Middleware
// ============================================================
// Ye middleware har write request ke baad
// Turso + Supabase ko background mein sync karta hai.
// Routes mein manually kuch nahi karna — bas getDB() use karo.
// ============================================================

import { getDB } from "../db.js"

export async function dbSync(c, next) {
  // DB instance request context mein inject karo
  // taaki har route mein c.get("db") se mil sake
  c.set("db", getDB(c.env))
  await next()
}
