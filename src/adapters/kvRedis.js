/* ================================================================
   src/adapters/kvRedis.js
   KV-COMPATIBLE ADAPTER — backed by Redis (via ioredis)

   Every call site in this codebase uses exactly four operations:
     env.KV.get(key, "json"?)
     env.KV.put(key, value, { expirationTtl })
     env.KV.delete(key)
     env.KV.list({ prefix }) -> { keys: [{ name }, ...] }

   This file re-implements that exact shape on top of Redis, so every
   existing call site (dbSync.js, systemGuard.js, firewall.js, ads.js,
   public.js, seoAdmin.js, securityAdmin.js, playerEngine.js, etc.)
   keeps working completely unmodified.
================================================================ */

export class RedisKV {
  /** @param {import("ioredis").Redis} redisClient */
  constructor(redisClient) {
    this.r = redisClient
  }

  /**
   * @param {string} key
   * @param {"json"|undefined} type
   */
  async get(key, type) {
    const v = await this.r.get(key)
    if (v === null) return null
    if (type === "json") {
      try { return JSON.parse(v) } catch { return null }
    }
    return v
  }

  /**
   * @param {string} key
   * @param {string} value
   * @param {{ expirationTtl?: number }} [opts]
   */
  async put(key, value, opts = {}) {
    const val = typeof value === "string" ? value : JSON.stringify(value)
    if (opts.expirationTtl) {
      await this.r.set(key, val, "EX", opts.expirationTtl)
    } else {
      await this.r.set(key, val)
    }
    return null
  }

  async delete(key) {
    await this.r.del(key)
    return null
  }

  /**
   * @param {{ prefix?: string }} [opts]
   * @returns {Promise<{ keys: { name: string }[] }>}
   */
  async list({ prefix = "" } = {}) {
    const keys = []
    let cursor = "0"
    do {
      // SCAN, not KEYS — KEYS blocks the whole Redis instance on a large
      // keyspace; SCAN walks it incrementally and is safe under load.
      const [next, batch] = await this.r.scan(
        cursor, "MATCH", `${prefix}*`, "COUNT", 200
      )
      cursor = next
      keys.push(...batch)
    } while (cursor !== "0")

    return { keys: keys.map(name => ({ name })) }
  }
}
