import { Hono } from "hono"
const app = new Hono()

app.post("/", async (c) => {
  try {
    const { file } = await c.req.json()
    if (!file) return c.json({ success: false, error: "File required" }, 400)

    // ImageKit fetch logic
    const form = new FormData()
    form.append("file", file)
    form.append("fileName", `anime_${Date.now()}.jpg`)
    form.append("folder", "/animehunt")

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":")
      },
      body: form
    })

    const data = await res.json()
    if (data.url) return c.json({ success: true, url: data.url })
    return c.json({ success: false, error: "ImageKit error" }, 500)

  } catch (err) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

export default app
