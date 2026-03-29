import { Hono } from "hono"

const app = new Hono()

app.get("/security/graph", async (c)=>{

  const data = []

  for(let i=0;i<20;i++){
    data.push({
      requests: Math.random()*100,
      blocked: Math.random()*50,
      suspicious: Math.random()*30
    })
  }

  return c.json(data)
})

export default app
