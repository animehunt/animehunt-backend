import { Hono } from "hono"
import { uploadImage } from "../utils/upload"

const app = new Hono()

app.post("/upload", async (c) => {

  try {

    const body = await c.req.json()

    if (!body.file) {
      return c.json({
        success:false,
        error:"File required"
      },400)
    }

    const url = await uploadImage(body.file, c.env)

    return c.json({
      success:true,
      url
    })

  } catch (e) {

    return c.json({
      success:false,
      error:e.message || "Upload failed"
    },500)

  }

})

export default app
