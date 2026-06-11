import { verifyToken } from "../routes/auth.js";

// ──────────────────────────────────────────────
// adminAuth middleware
// Har protected route ke pehle lagao
// Usage: router.get("/api/admin/something", adminAuth, handler)
// ──────────────────────────────────────────────
export async function adminAuth(req, env) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  // ── Cookie se bhi check karo (optional fallback) ──
  const cookieToken = getCookieToken(req);
  const finalToken = token || cookieToken;

  if (!finalToken) {
    return Response.json(
      { success: false, message: "Unauthorized: Token missing" },
      { status: 401 }
    );
  }

  try {
    const payload = await verifyToken(finalToken, env.JWT_SECRET);

    // Payload ko request mein attach karo
    req.admin = {
      username: payload.username,
      role: payload.role,
    };

    // undefined return = middleware pass, next handler chalega
    return undefined;

  } catch (err) {
    const expired = err?.code === "ERR_JWT_EXPIRED";
    return Response.json(
      {
        success: false,
        message: expired
          ? "Session expire ho gaya, dobara login karein"
          : "Unauthorized: Invalid token",
      },
      { status: 401 }
    );
  }
}

// ──────────────────────────────────────────────
// Helper: Cookie header se token nikalna
// ──────────────────────────────────────────────
function getCookieToken(req) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/ah_token=([^;]+)/);
  return match ? match[1] : null;
}
