/* ================================================
   adminServers.js — Streaming Server Management
   Auth handled by adminAuth middleware in index.js
   NO local verifyAdmin here
================================================ */

import { Hono } from "hono"

const app = new Hono()

/* ================= HELPERS ================= */

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

function format(s) {
  return {
    id:         s.id,
    name:       s.name,
    anime:      s.anime,
    anime_id:   s.anime_id,
    season:     s.season,
    episode:    s.episode,
    embed:      s.embed,
    type:       s.type,
    priority:   s.priority,
    active:     !!s.active,
    verified:   !!s.verified,
    fail_count: s.fail_count || 0,
    last_check: s.last_check,
    created_at: s.created_at,
    updated_at: s.updated_at
  }
}

/* ================= VALIDATION ================= */

function validate(body) {
  if (!body.name?.trim())  return "Server name required"
  if (!body.anime?.trim()) return "Anime name required"
  if (!body.embed?.trim()) return "Embed URL required"
  try { new URL(body.embed) } catch { return "Invalid embed URL" }
  return null
}

/* ================= SYNC TO REPLICAS ================= */

async function syncToReplicas(env, action, data) {
  const promises = []

  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    promises.push(
      fetch(`${env.TURSO_URL}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify(buildTursoPayload(action, data))
      }).catch(e => console.error("Turso sync:", e))
    )
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    promises.push(
      syncSupabase(env, action, data)
        .catch(e => console.error("Supabase sync:", e))
    )
  }

  Promise.all(promises)
}

function buildTursoPayload(action, data) {
  if (action === "insert") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql: `INSERT OR REPLACE INTO servers (
            id,name,anime,anime_id,season,episode,embed,type,
            priority,active,verified,fail_count,last_check,
            created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: data.id },
            { type:"text",    value: data.name },
            { type:"text",    value: data.anime },
            { type:"text",    value: data.anime_id || "" },
            { type:"integer", value: data.season },
            { type:"integer", value: data.episode },
            { type:"text",    value: data.embed },
            { type:"text",    value: data.type },
            { type:"integer", value: data.priority },
            { type:"integer", value: data.active },
            { type:"integer", value: data.verified },
            { type:"integer", value: data.fail_count },
            { type:"text",    value: data.last_check || "" },
            { type:"text",    value: data.created_at },
            { type:"text",    value: data.updated_at }
          ]
        }
      }]
    }
  }
  if (action === "delete") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql:  "DELETE FROM servers WHERE id=?",
          args: [{ type:"text", value: data.id }]
        }
      }]
    }
  }
  return { requests: [] }
}

async function syncSupabase(env, action, data) {
  const base    = `${env.SUPABASE_URL}/rest/v1/servers`
  const headers = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates"
  }
  if (action === "insert") {
    await fetch(base, { method:"POST", headers, body: JSON.stringify(data) })
  }
  if (action === "delete") {
    await fetch(`${base}?id=eq.${data.id}`, { method:"DELETE", headers })
  }
}

/* ================================================
   PUBLIC ROUTES — before /:id
================================================ */

/* Public: get servers for episode (frontend watch page) */
app.get("/servers/public/:animeId/:season/:episode", async (c) => {
  try {
    const db      = c.env.DB
    const animeId = c.req.param("animeId")
    const season  = c.req.param("season")
    const episode = c.req.param("episode")

    const { results } = await db.prepare(`
      SELECT id,name,embed,type,priority
      FROM servers
      WHERE (anime_id=? OR anime=?)
        AND season=?
        AND episode=?
        AND active=1
      ORDER BY priority ASC
    `).bind(animeId, animeId, Number(season), Number(episode)).all()

    return c.json(success(results))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* Legacy public route (old format) */
app.get("/servers/public/:anime/:ep", async (c) => {
  try {
    const db    = c.env.DB
    const anime = c.req.param("anime")
    const ep    = c.req.param("ep")

    const { results } = await db.prepare(`
      SELECT id,name,embed,type,priority
      FROM servers
      WHERE (anime=? OR anime_id=?)
        AND episode=?
        AND active=1
      ORDER BY priority ASC
    `).bind(anime, anime, Number(ep)).all()

    return c.json(success(results))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= CREATE ================= */

app.post("/servers", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const id        = crypto.randomUUID()
    const timestamp = now()

    const row = {
      id,
      name:       body.name.trim(),
      anime:      body.anime.trim(),
      anime_id:   body.anime_id   || "",
      season:     Number(body.season   || 1),
      episode:    Number(body.episode  || 1),
      embed:      body.embed.trim(),
      type:       body.type       || "iframe",
      priority:   Number(body.priority || 99),
      active:     body.active !== false ? 1 : 0,
      verified:   0,
      fail_count: 0,
      last_check: "",
      created_at: timestamp,
      updated_at: timestamp
    }

    await db.prepare(`
      INSERT INTO servers (
        id,name,anime,anime_id,season,episode,embed,type,
        priority,active,verified,fail_count,last_check,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.name, row.anime, row.anime_id,
      row.season, row.episode, row.embed, row.type,
      row.priority, row.active, row.verified,
      row.fail_count, row.last_check,
      row.created_at, row.updated_at
    ).run()

    syncToReplicas(c.env, "insert", row)

    return c.json(success({ id }), 201)

  } catch (err) {
    console.error("servers POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ALL (ADMIN) ================= */

app.get("/servers", async (c) => {
  try {
    const db      = c.env.DB
    const search  = c.req.query("q")       || ""
    const animeId = c.req.query("anime_id") || ""
    const season  = c.req.query("season")   || ""
    const episode = c.req.query("episode")  || ""
    const active  = c.req.query("active")   || ""

    let where    = "WHERE 1=1"
    const params = []

    if (search)  {
      where += " AND (anime LIKE ? OR name LIKE ? OR embed LIKE ?)"
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (animeId) { where += " AND (anime_id=? OR anime=?)"; params.push(animeId, animeId) }
    if (season)  { where += " AND season=?";   params.push(Number(season)) }
    if (episode) { where += " AND episode=?";  params.push(Number(episode)) }
    if (active !== "") { where += " AND active=?"; params.push(Number(active)) }

    const { results } = await db.prepare(`
      SELECT * FROM servers
      ${where}
      ORDER BY priority ASC, created_at DESC
      LIMIT 500
    `).bind(...params).all()

    return c.json(success(results.map(format)))

  } catch (err) {
    console.error("servers GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ONE ================= */

app.get("/servers/:id", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT * FROM servers WHERE id=?").bind(id).first()
    if (!row) return c.json(failure("Server not found"), 404)
    return c.json(success(format(row)))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= UPDATE ================= */

app.put("/servers/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()

    const existing = await db.prepare("SELECT id FROM servers WHERE id=?").bind(id).first()
    if (!existing) return c.json(failure("Server not found"), 404)

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const timestamp = now()
    const row = {
      id,
      name:       body.name.trim(),
      anime:      body.anime.trim(),
      anime_id:   body.anime_id   || "",
      season:     Number(body.season   || 1),
      episode:    Number(body.episode  || 1),
      embed:      body.embed.trim(),
      type:       body.type       || "iframe",
      priority:   Number(body.priority || 99),
      active:     bool(body.active),
      updated_at: timestamp
    }

    await db.prepare(`
      UPDATE servers SET
        name=?,anime=?,anime_id=?,season=?,episode=?,
        embed=?,type=?,priority=?,active=?,updated_at=?
      WHERE id=?
    `).bind(
      row.name, row.anime, row.anime_id,
      row.season, row.episode,
      row.embed, row.type, row.priority,
      row.active, row.updated_at, id
    ).run()

    syncToReplicas(c.env, "insert", { ...row, verified:0, fail_count:0, last_check:"", created_at: now() })

    return c.json(success({ id }))

  } catch (err) {
    console.error("servers PUT:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= TOGGLE ACTIVE ================= */

app.patch("/servers/:id/toggle", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT id,active FROM servers WHERE id=?").bind(id).first()
    if (!row) return c.json(failure("Not found"), 404)

    const newVal = row.active ? 0 : 1
    await db.prepare("UPDATE servers SET active=?,updated_at=? WHERE id=?")
      .bind(newVal, now(), id).run()

    return c.json(success({ id, active: !!newVal }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= DELETE ================= */

app.delete("/servers/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare("SELECT id FROM servers WHERE id=?").bind(id).first()
    if (!existing) return c.json(failure("Server not found"), 404)

    await db.prepare("DELETE FROM servers WHERE id=?").bind(id).run()

    syncToReplicas(c.env, "delete", { id })

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    console.error("servers DELETE:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= BULK DELETE (by anime+episode) ================= */

app.delete("/servers/bulk", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    /* body.ids = ["id1","id2",...] */

    if (!Array.isArray(body.ids) || !body.ids.length) {
      return c.json(failure("ids array required"), 400)
    }

    for (const id of body.ids) {
      await db.prepare("DELETE FROM servers WHERE id=?").bind(id).run()
      syncToReplicas(c.env, "delete", { id })
    }

    return c.json(success({ deleted: body.ids.length }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= AUTO HEALTH CHECK ================= */
/* Called by cron or manually — checks if embed URLs respond */

app.post("/servers/health-check", async (c) => {
  try {
    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT id, embed FROM servers WHERE active=1
      ORDER BY fail_count ASC
      LIMIT 20
    `).all()

    let checked = 0, failed = 0

    for (const server of results) {
      try {
        /* HEAD request — just check if URL responds */
        const res = await fetch(server.embed, {
          method:  "HEAD",
          signal:  AbortSignal.timeout(5000)
        })

        if (res.ok || res.status === 405) {
          /* 405 = method not allowed but server is alive */
          await db.prepare(`
            UPDATE servers SET verified=1,fail_count=0,last_check=? WHERE id=?
          `).bind(now(), server.id).run()
        } else {
          await db.prepare(`
            UPDATE servers SET verified=0,fail_count=fail_count+1,last_check=? WHERE id=?
          `).bind(now(), server.id).run()
          failed++
        }

        /* Auto-disable after 5 consecutive failures */
        const row = await db.prepare(
          "SELECT fail_count FROM servers WHERE id=?"
        ).bind(server.id).first()

        if (row?.fail_count >= 5) {
          await db.prepare(
            "UPDATE servers SET active=0 WHERE id=?"
          ).bind(server.id).run()
        }

        checked++

      } catch {
        await db.prepare(`
          UPDATE servers SET fail_count=fail_count+1,last_check=? WHERE id=?
        `).bind(now(), server.id).run()
        failed++
        checked++
      }
    }

    return c.json(success({ checked, failed, healthy: checked - failed }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= STATS ================= */

app.get("/servers/stats", async (c) => {
  try {
    const db = c.env.DB

    const total   = await db.prepare("SELECT COUNT(*) as c FROM servers").first()
    const active  = await db.prepare("SELECT COUNT(*) as c FROM servers WHERE active=1").first()
    const verify  = await db.prepare("SELECT COUNT(*) as c FROM servers WHERE verified=1").first()
    const failed  = await db.prepare("SELECT COUNT(*) as c FROM servers WHERE fail_count>=5").first()

    const topAnime = await db.prepare(`
      SELECT anime, COUNT(*) as count
      FROM servers GROUP BY anime
      ORDER BY count DESC LIMIT 5
    `).all()

    return c.json(success({
      total:    total?.c   || 0,
      active:   active?.c  || 0,
      verified: verify?.c  || 0,
      failed:   failed?.c  || 0,
      topAnime: topAnime.results || []
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
