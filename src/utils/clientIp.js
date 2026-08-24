/* ================================================================
   src/utils/clientIp.js
   ROBUST CLIENT IP RESOLUTION
   Prioritizes x-forwarded-for (from Nginx) with fallback to 
   CF-Connecting-IP. Handles comma-separated proxy chains to 
   always extract the true client origin.
================================================================ */

export function getClientIP(c, fallback = "unknown") {
  if (!c || !c.req) return fallback

  // 1. Primary: X-Forwarded-For (set by Nginx proxy_set_header)
  const xForwardedFor = c.req.header("x-forwarded-for")
  if (xForwardedFor) {
    // Extract the leftmost IP in case of a proxy chain (e.g., "client, proxy1, proxy2")
    const ips = xForwardedFor.split(",").map(ip => ip.trim())
    if (ips[0]) return ips[0]
  }

  // 2. Fallback: CF-Connecting-IP (if Cloudflare is directly routing)
  const cfIp = c.req.header("cf-connecting-ip")
  if (cfIp) {
    return cfIp.trim()
  }

  // 3. Fallback: Remote Address (Direct connection)
  // In a proxy setup, this will often just be 127.0.0.1, 
  // but it's the safest final fallback.
  return fallback
}
