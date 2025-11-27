// start/socket.ts
import { Server as SocketIOServer } from 'socket.io'
import server from '@adonisjs/core/services/server'

let io: SocketIOServer | null = null

export function startSocket() {
  if (io) return io // socket už beží

  const httpServer = server.getNodeServer()

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  })

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id)
  })

  console.log('🔥 Socket.IO started')

  return io
}

export function getIo() {
  if (!io) {
    startSocket()
  }

  if (!io) {
    throw new Error('Socket.IO server not initialized')
  }

  return io
}
