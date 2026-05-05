import { Hono } from "hono";
import { verifyAdmin } from "../middleware/adminAuth.js";

const app = new Hono();

/* =========================
HELPERS
========================= */

const bool = (v) => (v ? 1 : 0);

const clean = (v) => (typeof v === "string" ? v.trim() : v);

const allowedDevice = ["All", "Desktop", "Mobile"];
const allowedVisibility = ["All", "Logged Users", "Guests"];
const allowedHighlight = ["None", "NEW", "HOT", "UPDATE"];

/* =========================
VALIDATION
========================= */

function validate(body) {
  if (!body.title || !body.title.trim()) return "Title required";
  if (!body.url || !body.url.trim()) return "URL required";

  if (body.device && !allowedDevice.includes(body.device))
    return "Invalid device";

  if (body.visibility && !allowedVisibility.includes(body.visibility))
    return "Invalid visibility";

  if (body.highlight && !allowedHighlight.includes(body.highlight))
    return "Invalid highlight";

  return null;
}

/* =========================
ADMIN: GET ALL
========================= */

app.get("/sidebar", verifyAdmin, async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare(`
        SELECT *
        FROM sidebar
        ORDER BY priority ASC
      `)
      .all();

    return c.json(results || []);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to load sidebar" }, 500);
  }
});

/* =========================
ADMIN: CREATE / UPDATE (UPSERT)
========================= */

app.post("/sidebar", verifyAdmin, async (c) => {
  try {
    const body = await c.req.json();

    const err = validate(body);
    if (err) return c.json({ error: err }, 400);

    const id = body._id || crypto.randomUUID();

    await c.env.DB
      .prepare(`
        INSERT INTO sidebar (
          id, title, icon, url,
          device, visibility,
          highlight, badge,
          priority, active, newTab,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title,
          icon=excluded.icon,
          url=excluded.url,
          device=excluded.device,
          visibility=excluded.visibility,
          highlight=excluded.highlight,
          badge=excluded.badge,
          priority=excluded.priority,
          active=excluded.active,
          newTab=excluded.newTab,
          updated_at=CURRENT_TIMESTAMP
      `)
      .bind(
        id,
        clean(body.title),
        clean(body.icon) || "",
        clean(body.url),

        allowedDevice.includes(body.device) ? body.device : "All",
        allowedVisibility.includes(body.visibility)
          ? body.visibility
          : "All",

        allowedHighlight.includes(body.highlight)
          ? body.highlight
          : "None",

        clean(body.badge) || "",

        Number(body.priority || 99),

        bool(body.active !== false), // default true
        bool(body.newTab)
      )
      .run();

    return c.json({ success: true, id });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Save failed" }, 500);
  }
});

/* =========================
ADMIN: DELETE
========================= */

app.delete("/sidebar/:id", verifyAdmin, async (c) => {
  try {
    const id = c.req.param("id");

    await c.env.DB
      .prepare("DELETE FROM sidebar WHERE id=?")
      .bind(id)
      .run();

    return c.json({ success: true });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Delete failed" }, 500);
  }
});

/* =========================
PUBLIC: SIDEBAR (SAFE + FILTERED)
========================= */

app.get("/sidebar/public", async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare(`
        SELECT
          id,
          title,
          icon,
          url,
          highlight,
          badge,
          priority,
          newTab,
          device,
          visibility
        FROM sidebar
        WHERE active = 1
        ORDER BY priority ASC
      `)
      .all();

    return c.json(results || []);
  } catch (err) {
    console.error(err);
    return c.json([]);
  }
});

export default app;
