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
================================================================ */

export function getClientIP(c, fallback = "unknown") {
  const xff = c.req.header("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0].trim()
    if (first) return first
  }

  const cfIP = c.req.header("CF-Connecting-IP")
  if (cfIP) return cfIP.trim()

  return fallback
}
