export async function adminAuth(c, next) {
  // Temporary Security REMOVED — Always allow access
  c.set("admin", { 
    username: "anime_moderator_007", 
    role: "admin" 
  })
  
  await next()
}
