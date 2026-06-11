import { Router } from "itty-router";
import { SignJWT, jwtVerify } from "jose";

const router = Router({ base: "/api/admin" });

// ──────────────────────────────────────────────
// Helper: SHA-256 hex (Web Crypto – works in CF Workers)
// ──────────────────────────────────────────────
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ──────────────────────────────────────────────
// Helper: sign JWT
// ──────────────────────────────────────────────
async function signToken(username, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new SignJWT({ username, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

// ──────────────────────────────────────────────
// Helper: verify JWT (exported so adminAuth.js can reuse)
// ──────────────────────────────────────────────
export async function verifyToken(token, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const { payload } = await jwtVerify(token, key);
  return payload; // { username, role, iat, exp }
}

// ──────────────────────────────────────────────
// POST /api/admin/login
// ──────────────────────────────────────────────
router.post("/login", async (req, env) => {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { username, password } = body ?? {};

  if (!username || !password) {
    return Response.json(
      { success: false, message: "Username aur password dono required hain" },
      { status: 400 }
    );
  }

  // ── 1. Username check ──
  if (username !== env.ADMIN_USERNAME) {
    return Response.json(
      { success: false, message: "Invalid credentials" },
      { status: 401 }
    );
  }

  // ── 2. Password check (SHA-256) ──
  const hash = await sha256Hex(password);
  if (hash !== env.ADMIN_PASSWORD_HASH) {
    return Response.json(
      { success: false, message: "Invalid credentials" },
      { status: 401 }
    );
  }

  // ── 3. Generate JWT ──
  const token = await signToken(username, env.JWT_SECRET);

  // ── 4. Optional: log login to D1 ──
  try {
    await env.DB.prepare(
      "INSERT INTO admin_login_logs (username, logged_in_at) VALUES (?, ?)"
    )
      .bind(username, new Date().toISOString())
      .run();
  } catch {
    // Table missing ho toh ignore karo – login block na ho
  }

  return Response.json({
    success: true,
    message: "Login successful",
    data: {
      token,
      username,
    },
  });
});

// ──────────────────────────────────────────────
// POST /api/admin/logout  (client token delete karta hai,
//                          server sirf confirm karta hai)
// ──────────────────────────────────────────────
router.post("/logout", async () => {
  return Response.json({ success: true, message: "Logged out" });
});

// ──────────────────────────────────────────────
// GET /api/admin/me  – token verify करके user info दो
// ──────────────────────────────────────────────
router.get("/me", async (req, env) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return Response.json(
      { success: false, message: "Token missing" },
      { status: 401 }
    );
  }

  try {
    const payload = await verifyToken(token, env.JWT_SECRET);
    return Response.json({
      success: true,
      data: { username: payload.username, role: payload.role },
    });
  } catch {
    return Response.json(
      { success: false, message: "Invalid or expired token" },
      { status: 401 }
    );
  }
});

// ──────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────
export default router;
