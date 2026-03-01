import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const security = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET CONFIG
================================ */
security.get("/", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT * FROM security_settings WHERE id = 1")
    .first()

  if (!row) return c.json({})

  return c.json({
    ultra: !!row.ultra,
    firewallLevel: row.firewallLevel,

    geo: {
      indiaOnly: !!row.geo_indiaOnly,
      blockForeign: !!row.geo_blockForeign
    },

    admin: {
      loginLimit: !!row.admin_loginLimit,
      deviceLock: !!row.admin_deviceLock,
      sessionMonitor: !!row.admin_sessionMonitor
    },

    ai: {
      autoBan: !!row.ai_autoBan,
      brute: !!row.ai_brute,
      bot: !!row.ai_bot,
      learning: !!row.ai_learning
    },

    system: {
      hideServer: !!row.system_hideServer,
      hideTech: !!row.system_hideTech
    }
  })
})

/* ===============================
   SAVE CONFIG
================================ */
security.post("/", async (c) => {

  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE security_settings SET
      ultra = ?,
      firewallLevel = ?,

      geo_indiaOnly = ?,
      geo_blockForeign = ?,

      admin_loginLimit = ?,
      admin_deviceLock = ?,
      admin_sessionMonitor = ?,

      ai_autoBan = ?,
      ai_brute = ?,
      ai_bot = ?,
      ai_learning = ?,

      system_hideServer = ?,
      system_hideTech = ?

    WHERE id = 1
  `).bind(
    body.ultra ? 1 : 0,
    body.firewallLevel ?? 3,

    body.geo?.indiaOnly ? 1 : 0,
    body.geo?.blockForeign ? 1 : 0,

    body.admin?.loginLimit ? 1 : 0,
    body.admin?.deviceLock ? 1 : 0,
    body.admin?.sessionMonitor ? 1 : 0,

    body.ai?.autoBan ? 1 : 0,
    body.ai?.brute ? 1 : 0,
    body.ai?.bot ? 1 : 0,
    body.ai?.learning ? 1 : 0,

    body.system?.hideServer ? 1 : 0,
    body.system?.hideTech ? 1 : 0
  ).run()

  return c.json({ success: true })
})

/* ===============================
   ULTRA MODE TOGGLE
================================ */
security.post("/ultra", async (c) => {

  const { enable } = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE security_settings SET ultra = ?
    WHERE id = 1
  `).bind(enable ? 1 : 0).run()

  return c.json({ ultra: enable })
})

export default security
