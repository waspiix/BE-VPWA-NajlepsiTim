// start/socket.ts
import { Server as SocketIOServer } from 'socket.io'
import server from '@adonisjs/core/services/server'

let io: SocketIOServer | null = null

export function startSocket() {
  if (io) return io

  const httpServer = server.getNodeServer()

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  })

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    // ✅ KROK 1: Získaj userId z auth
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId
    
    if (userId) {
      // ✅ KROK 2: Socket joinne user room
      socket.join(`user:${userId}`)
      socket.data.userId = userId
      console.log(`✅ Socket ${socket.id} joined user room: user:${userId}`)
    } else {
      console.warn('⚠️ Socket connected without userId!')
    }

    socket.on('join_channel', ({ channelId }) => {
      socket.join(`channel:${channelId}`)
      socket.data.channelId = channelId
      console.log(`Socket ${socket.id} joined channel ${channelId}`)
    })

    socket.on('leave_channel', () => {
      const prev = socket.data.channelId
      if (prev) {
        socket.leave(`channel:${prev}`)
      }
      socket.data.channelId = null
      console.log(`Socket ${socket.id} left channel`)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
      // Socket.io automaticky odstráni socket zo všetkých rooms
    })
  })

  console.log('Socket.IO started')

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