/* ================================================================
   src/utils/clientIp.js
   CLIENT IP RESOLUTION — behind an nginx reverse proxy on the VPS

   Priority: x-forwarded-for first, CF-Connecting-IP as a fallback.

     - x-forwarded-for is the header nginx actually sets
       (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`),
       so it's authoritative for this deployment whether or not
       Cloudflare stays in front.
     - CF-Connecting-IP is kept as a fallback for the case Cloudflare
       *is* still in front: it's a good signal too (Cloudflare sets
       it directly, not client-controlled), but x-forwarded-for is
       what nginx is actually configured to send, so it takes
       priority per the migration requirements.
     - x-forwarded-for can be a comma-separated chain
       ("client, proxy1, proxy2") once more than one hop appends to
       it — the leftmost entry is the original client, so that's the
       one used here, not the raw header string.

   Every call site that used to do
     c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || fallback
   should use getClientIP(c, fallback) instead.

   ✅ FIX (audit): accepts either a Hono context (c.req.header(name),
   how every route/middleware in this codebase calls it) or a plain
   Fetch-API Request / Headers-holder (request.headers.get(name)) —
   ai/playerEngine.js's runPlayerEngine(env, request) receives the
   latter shape, not a Hono context, and had its own inline copy of
   the OLD deprecated cf-connecting-ip-first priority order that this
   file's own comment above says every call site should have moved
   off of. Rather than keep two copies of this priority logic in
   sync, this now detects which shape it was given and reads headers
   accordingly, so playerEngine.js can call the same shared function
   every other caller already uses instead of duplicating (and
   drifting from) its priority order.
================================================================ */

function readHeader(c, name) {
  // Hono context: c.req.header(name)
  if (c?.req?.header) return c.req.header(name)
  // Fetch API Request, or a plain { headers: Headers } holder:
  // c.headers.get(name) — this is the shape ai/playerEngine.js's
  // runPlayerEngine(env, request) passes.
  if (c?.headers?.get) return c.headers.get(name)
  return null
}

export function getClientIP(c, fallback = "unknown") {
  const xff = readHeader(c, "x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0].trim()
    if (first) return first
  }

  const cfIP = readHeader(c, "CF-Connecting-IP")
  if (cfIP) return cfIP.trim()

  return fallback
}
