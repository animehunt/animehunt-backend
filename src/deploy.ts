import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const deploy = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET STATUS
================================ */
deploy.get("/", async (c) => {

  const state = await c.env.DB
    .prepare("SELECT * FROM system_state WHERE id=1")
    .first()

  const versions = await c.env.DB
    .prepare("SELECT * FROM versions ORDER BY date DESC")
    .all()

  const backups = await c.env.DB
    .prepare("SELECT * FROM backups ORDER BY date DESC")
    .all()

  return c.json({
    state,
    versions: versions.results,
    backups: backups.results
  })
})

/* ===============================
   DEPLOY
================================ */
deploy.post("/deploy", async (c) => {

  const id = crypto.randomUUID()
  const date = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO versions (id, name, date)
    VALUES (?, ?, ?)
  `).bind(id, id.slice(0,8), date).run()

  return c.json({ success: true })
})

/* ===============================
   FREEZE
================================ */
deploy.patch("/freeze", async (c) => {

  await c.env.DB.prepare(`
    UPDATE system_state
    SET frozen=1, updatedAt=?
    WHERE id=1
  `).bind(new Date().toISOString()).run()

  return c.json({ success: true })
})

deploy.patch("/unfreeze", async (c) => {

  await c.env.DB.prepare(`
    UPDATE system_state
    SET frozen=0, updatedAt=?
    WHERE id=1
  `).bind(new Date().toISOString()).run()

  return c.json({ success: true })
})

/* ===============================
   CREATE VERSION
================================ */
deploy.post("/version", async (c) => {

  const id = crypto.randomUUID()
  const date = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO versions (id, name, date)
    VALUES (?, ?, ?)
  `).bind(id, id.slice(0,8), date).run()

  const versions = await c.env.DB
    .prepare("SELECT * FROM versions ORDER BY date DESC")
    .all()

  return c.json({ versions: versions.results })
})

/* ===============================
   BACKUP
================================ */
deploy.post("/backup", async (c) => {

  const id = crypto.randomUUID()
  const date = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO backups (id, name, date)
    VALUES (?, ?, ?)
  `).bind(id, id.slice(0,8), date).run()

  const backups = await c.env.DB
    .prepare("SELECT * FROM backups ORDER BY date DESC")
    .all()

  return c.json({ backups: backups.results })
})

/* ===============================
   RESTORE
================================ */
deploy.post("/restore/:id", async (c) => {

  const { id } = c.req.param()

  // simulated restore
  return c.json({ restored: id })
})

/* ===============================
   EMERGENCY
================================ */
deploy.post("/emergency/shutdown", async (c) => {

  await c.env.DB.prepare(`
    UPDATE system_state
    SET emergency=1, updatedAt=?
    WHERE id=1
  `).bind(new Date().toISOString()).run()

  return c.json({ success: true })
})

deploy.post("/emergency/recover", async (c) => {

  await c.env.DB.prepare(`
    UPDATE system_state
    SET emergency=0, updatedAt=?
    WHERE id=1
  `).bind(new Date().toISOString()).run()

  return c.json({ success: true })
})

export default deploy
