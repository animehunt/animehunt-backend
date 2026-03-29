let clients = []

export function wsHandler(c){

  const pair = new WebSocketPair()
  const client = pair[0]
  const server = pair[1]

  server.accept()

  clients.push(server)

  server.addEventListener("close",()=>{
    clients = clients.filter(c=>c!==server)
  })

  return new Response(null,{
    status:101,
    webSocket:client
  })
}

/* BROADCAST */
export function broadcastAttack(data){

  const msg = JSON.stringify(data)

  clients.forEach(ws=>{
    try{
      ws.send(msg)
    }catch{}
  })
}
