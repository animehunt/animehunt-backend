export default {
  async fetch(req, env) {

    const url = new URL(req.url)
    const path = url.pathname

    /* =========================
    AUTH CHECK
    ========================= */

    const auth = req.headers.get("Authorization") || ""
    if (!auth.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401)
    }

    /* =========================
    ROUTES
    ========================= */

    if (path === "/api/admin/anime" && req.method === "GET") {
      return getAnime(req, env)
    }

    if (path === "/api/admin/anime" && req.method === "POST") {
      return saveAnime(req, env)
    }

    if (path.startsWith("/api/admin/anime/") && req.method === "DELETE") {
      return deleteAnime(path, env)
    }

    if (path.startsWith("/api/admin/anime-hide/") && req.method === "PATCH") {
      return toggleHide(path, env)
    }

    if (path.startsWith("/api/admin/anime/") && req.method === "GET") {
      return getSingleAnime(path, env)
    }

    return json({ error: "Not Found" }, 404)
  }
}

/* =========================
GET ALL ANIME
========================= */

async function getAnime(req, env) {

  const url = new URL(req.url)

  const type = url.searchParams.get("type")
  const status = url.searchParams.get("status")
  const home = url.searchParams.get("home")
  const q = url.searchParams.get("q")

  let list = await env.ANIME_DB.get("anime_list", { type: "json" }) || []

  if (type) list = list.filter(a => a.type === type)
  if (status) list = list.filter(a => a.status === status)

  if (home === "yes") list = list.filter(a => a.is_home)
  if (home === "no") list = list.filter(a => !a.is_home)

  if (q) {
    list = list.filter(a =>
      a.title.toLowerCase().includes(q.toLowerCase())
    )
  }

  return json(list)
}

/* =========================
GET SINGLE
========================= */

async function getSingleAnime(path, env) {

  const id = path.split("/").pop()

  let list = await env.ANIME_DB.get("anime_list", { type: "json" }) || []

  const anime = list.find(a => a.id === id)

  return json(anime || {})
}

/* =========================
SAVE (CREATE + UPDATE)
========================= */

async function saveAnime(req, env) {

  const body = await req.json()

  let list = await env.ANIME_DB.get("anime_list", { type: "json" }) || []

  if (body.id) {
    // UPDATE
    list = list.map(a => a.id === body.id ? {
      ...a,
      ...mapFields(body)
    } : a)
  } else {
    // CREATE
    const newAnime = {
      id: crypto.randomUUID(),
      created: Date.now(),
      is_hidden: false,
      ...mapFields(body)
    }

    list.unshift(newAnime)
  }

  await env.ANIME_DB.put("anime_list", JSON.stringify(list))

  return json({ success: true })
}

/* =========================
DELETE
========================= */

async function deleteAnime(path, env) {

  const id = path.split("/").pop()

  let list = await env.ANIME_DB.get("anime_list", { type: "json" }) || []

  list = list.filter(a => a.id !== id)

  await env.ANIME_DB.put("anime_list", JSON.stringify(list))

  return json({ success: true })
}

/* =========================
HIDE / UNHIDE
========================= */

async function toggleHide(path, env) {

  const id = path.split("/").pop()

  let list = await env.ANIME_DB.get("anime_list", { type: "json" }) || []

  list = list.map(a => {
    if (a.id === id) {
      a.is_hidden = !a.is_hidden
    }
    return a
  })

  await env.ANIME_DB.put("anime_list", JSON.stringify(list))

  return json({ success: true })
}

/* =========================
FIELD MAPPER
========================= */

function mapFields(body) {
  return {
    title: body.title,
    slug: body.slug,

    type: body.type,
    status: body.status,

    poster: body.poster,
    banner: body.banner,

    year: body.year,
    rating: body.rating,

    language: body.language,
    duration: body.duration,

    genres: body.genres,
    tags: body.tags,
    description: body.description,

    is_home: body.isHome,
    is_trending: body.isTrending,
    is_most_viewed: body.isMostViewed,
    is_banner: body.isBanner
  }
}

/* =========================
RESPONSE HELPER
========================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  })
}
