import { Hono } from "hono"

const app = new Hono()

app.post("/upload", async (c) => {

  try {

    const body = await c.req.json()

    const file = body.file
    const fileName = body.fileName || Date.now() + ".jpg"

    if (!file) {
      return c.json({
        success:false,
        error:"No file received"
      },400)
    }

    const form = new FormData()

    form.append("file", file)
    form.append("fileName", fileName)

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{
      method:"POST",
      headers:{
        Authorization:"Basic " + btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":")
      },
      body:form
    })

    const data = await res.json()

    if(!data || !data.url){
      return c.json({
        success:false,
        error:"ImageKit upload failed"
      },500)
    }

    return c.json({
      success:true,
      url:data.url
    })

  } catch(e){

    return c.json({
      success:false,
      error:"Upload server error"
    },500)

  }

})

export default app
