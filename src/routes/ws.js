import { Hono } from "hono"

const app = new Hono()

let clients = []

app.get("/ws", (c)=>{

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw)

  socket.onopen = ()=>{
    clients.push(socket)
  }

  socket.onclose = ()=>{
    clients = clients.filter(c=>c!==socket)
  }

  return response
})

export function broadcastAttack(data){
  clients.forEach(ws=>{
    try{
      ws.send(JSON.stringify(data))
    }catch{}
  })
}

export default app
