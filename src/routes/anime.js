import { Hono } from 'hono'

const app = new Hono()

/* =========================
CORS
========================= */
app.use('*', async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*")
  c.header("Access-Control-Allow-Methods", "GET,POST,DELETE,PATCH,OPTIONS")
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (c.req.method === "OPTIONS") return c.text("")
  await next()
})

/* =========================
AUTH MIDDLEWARE
========================= */
app.use('/api/admin/*', async (c, next) => {
  const auth = c.req.header("Authorization") || ""
  if (!auth.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401)
  }
  await next()
})

/* =========================
UTILS
========================= */

function slugify(text){
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/(^-|-$)/g,'')
}

/* IMAGEKIT UPLOAD */
async function uploadImage(env, fileBase64){

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{
    method:"POST",
    headers:{
      Authorization:"Basic "+btoa(env.IMAGEKIT_PUBLIC_KEY+":")
    },
    body:new URLSearchParams({
      file:fileBase64,
      fileName:"anime_"+Date.now()+".jpg"
    })
  })

  const data = await res.json()
  return data.url
}
app.get('/api/admin/anime', async (c) => {

  const { DB } = c.env

  const type = c.req.query('type')
  const status = c.req.query('status')
  const home = c.req.query('home')
  const q = c.req.query('q')

  let sql = "SELECT * FROM anime WHERE 1=1"
  let params = []

  if(type){
    sql += " AND type=?"
    params.push(type)
  }

  if(status){
    sql += " AND status=?"
    params.push(status)
  }

  if(home === "yes"){
    sql += " AND is_home=1"
  }

  if(home === "no"){
    sql += " AND is_home=0"
  }

  if(q){
    sql += " AND title LIKE ?"
    params.push(`%${q}%`)
  }

  sql += " ORDER BY created_at DESC"

  const result = await DB.prepare(sql).bind(...params).all()

  return c.json(result.results)
})
app.post('/api/admin/anime', async (c) => {

  const { DB, IMAGEKIT_PUBLIC_KEY } = c.env
  const body = await c.req.json()

  let poster = body.poster
  let banner = body.banner

  /* AUTO IMAGE UPLOAD */
  if(poster && poster.startsWith("data:")){
    poster = await uploadImage(c.env, poster)
  }

  if(banner && banner.startsWith("data:")){
    banner = await uploadImage(c.env, banner)
  }

  const id = body.id || crypto.randomUUID()

  const slug = body.slug || slugify(body.title)

  await DB.prepare(`
    INSERT OR REPLACE INTO anime (
      id,title,slug,type,status,
      poster,banner,
      year,rating,language,duration,
      genres,tags,description,
      is_home,is_trending,is_most_viewed,is_banner,
      is_hidden,created_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  .bind(
    id,
    body.title,
    slug,
    body.type,
    body.status,

    poster,
    banner,

    body.year,
    body.rating,
    body.language,
    body.duration,

    body.genres,
    body.tags,
    body.description,

    body.isHome ? 1 : 0,
    body.isTrending ? 1 : 0,
    body.isMostViewed ? 1 : 0,
    body.isBanner ? 1 : 0,

    0,
    Date.now()
  )
  .run()

  return c.json({ success:true })
})
app.delete('/api/admin/anime/:id', async (c) => {

  const id = c.req.param('id')

  await c.env.DB.prepare(`
    DELETE FROM anime WHERE id=?
  `).bind(id).run()

  return c.json({ success:true })
})
app.patch('/api/admin/anime-hide/:id', async (c) => {

  const id = c.req.param('id')

  await c.env.DB.prepare(`
    UPDATE anime
    SET is_hidden = CASE WHEN is_hidden=1 THEN 0 ELSE 1 END
    WHERE id=?
  `).bind(id).run()

  return c.json({ success:true })
})
export default app
