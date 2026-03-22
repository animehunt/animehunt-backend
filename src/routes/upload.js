import { Hono } from "hono"
import { uploadImage } from "../utils/upload"

const app = new Hono()

app.post("/", async (c) => {

  try {

    const body = await c.req.json()

    if(!body.file){
      return c.json({
        success:false,
        error:"File missing"
      },400)
    }

    const url = await uploadImage(body.file, c.env)

    return c.json({
      success:true,
      url
    })

  } catch (err) {

    console.error(err)

    return c.json({
      success:false,
      error:err.message
    },500)

  }

})

export default app
