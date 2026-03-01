import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const player = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET PLAYER SETTINGS
================================ */
player.get("/", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT * FROM player_settings WHERE id = 1")
    .first()

  if (!row) {
    return c.json({})
  }

  return c.json({
    defaultServer: row.defaultServer,
    autoplay: !!row.autoplay,
    resume: !!row.resume,
    autoswitch: !!row.autoswitch,
    mode: row.mode,
    ui: {
      servers: !!row.ui_servers,
      download: !!row.ui_download,
      subscribe: !!row.ui_subscribe,
      related: !!row.ui_related
    }
  })
})

/* ===============================
   SAVE PLAYER SETTINGS
================================ */
player.post("/", async (c) => {

  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE player_settings
    SET
      defaultServer = ?,
      autoplay = ?,
      resume = ?,
      autoswitch = ?,
      mode = ?,
      ui_servers = ?,
      ui_download = ?,
      ui_subscribe = ?,
      ui_related = ?
    WHERE id = 1
  `).bind(
    body.defaultServer || "Server 1",
    body.autoplay ? 1 : 0,
    body.resume ? 1 : 0,
    body.autoswitch ? 1 : 0,
    body.mode || "responsive",
    body.ui?.servers ? 1 : 0,
    body.ui?.download ? 1 : 0,
    body.ui?.subscribe ? 1 : 0,
    body.ui?.related ? 1 : 0
  ).run()

  return c.json({ success: true })
})

export default player
