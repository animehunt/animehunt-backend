import { Hono } from "hono";
import { cors } from "hono/cors";
import { uploadImage } from "./utils/upload"; // Make sure path is correct

const app = new Hono();

// 1. CORS Middleware
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// 2. Auth Middleware (Optional but recommended)
app.use("/api/admin/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

/* ==========================================
   IMAGE UPLOAD ROUTE
   ========================================== */
app.post("/upload", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.file) return c.json({ success: false, error: "No file" }, 400);

    // uploadImage handles ImageKit/Cloudinary logic
    const url = await uploadImage(body.file, c.env);
    
    return c.json({ success: true, url });
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

/* ==========================================
   ANIME CRUD ROUTES
   ========================================== */

// GET ALL & SEARCH
app.get("/api/admin/anime", async (c) => {
  const { type, status, home, q } = c.req.query();
  let list = await c.env.ANIME_DB.get("anime_list", { type: "json" }) || [];

  if (type) list = list.filter(a => a.type === type);
  if (status) list = list.filter(a => a.status === status);
  if (home === "yes") list = list.filter(a => a.is_home);
  if (home === "no") list = list.filter(a => !a.is_home);
  if (q) {
    list = list.filter(a => a.title.toLowerCase().includes(q.toLowerCase()));
  }

  return c.json(list);
});

// GET SINGLE
app.get("/api/admin/anime/:id", async (c) => {
  const id = c.req.param("id");
  const list = await c.env.ANIME_DB.get("anime_list", { type: "json" }) || [];
  const anime = list.find(a => a.id === id);
  return anime ? c.json(anime) : c.json({ error: "Not found" }, 404);
});

// SAVE (CREATE & UPDATE)
app.post("/api/admin/anime", async (c) => {
  const body = await c.req.json();
  let list = await c.env.ANIME_DB.get("anime_list", { type: "json" }) || [];

  const animeData = {
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
    is_banner: body.isBanner,
    updated_at: Date.now()
  };

  if (body.id) {
    // UPDATE
    list = list.map(a => a.id === body.id ? { ...a, ...animeData } : a);
  } else {
    // CREATE
    const newAnime = {
      ...animeData,
      id: crypto.randomUUID(),
      created_at: Date.now(),
      is_hidden: false
    };
    list.unshift(newAnime);
  }

  await c.env.ANIME_DB.put("anime_list", JSON.stringify(list));
  return c.json({ success: true });
});

// DELETE
app.delete("/api/admin/anime/:id", async (c) => {
  const id = c.req.param("id");
  let list = await c.env.ANIME_DB.get("anime_list", { type: "json" }) || [];
  list = list.filter(a => a.id !== id);
  await c.env.ANIME_DB.put("anime_list", JSON.stringify(list));
  return c.json({ success: true });
});

// TOGGLE HIDE
app.patch("/api/admin/anime-hide/:id", async (c) => {
  const id = c.req.param("id");
  let list = await c.env.ANIME_DB.get("anime_list", { type: "json" }) || [];
  list = list.map(a => {
    if (a.id === id) a.is_hidden = !a.is_hidden;
    return a;
  });
  await c.env.ANIME_DB.put("anime_list", JSON.stringify(list));
  return c.json({ success: true });
});

export default app;
