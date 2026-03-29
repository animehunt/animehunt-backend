export async function stealth(c, next) {

  await next()

  const res = c.res

  res.headers.set("Server", "AnimeHunt")
  res.headers.delete("X-Powered-By")

}
