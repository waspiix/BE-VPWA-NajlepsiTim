// backend/start/socket.ts
import { Server as SocketIOServer, Socket } from 'socket.io'
import server from '@adonisjs/core/services/server'
import CommandsService from '#services/commands_service'

let io: SocketIOServer | null = null

interface CommandMessage {
  type: 'command'
  command: string
  payload?: any
}

export function startSocket() {
  if (io) return io

  const httpServer = server.getNodeServer()

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      credentials: true,
    },
  })

  io.on('connection', (socket: Socket) => {
    // userId from handshake (client sends in auth/query)
    const userIdRaw = (socket.handshake.auth as any)?.userId ?? socket.handshake.query.userId
    const userId = Number(userIdRaw)

    if (!userId || Number.isNaN(userId)) {
      console.warn('Socket connected without valid userId, disconnecting', {
        socketId: socket.id,
        userIdRaw,
      })
      socket.disconnect(true)
      return
    }

    socket.data.userId = userId
    console.log(`Socket connected: ${socket.id} userId=${userId}`)

    const ensureAck = (ack?: (response: any) => void) => (typeof ack === 'function' ? ack : () => {})

    // join personal room for targeted events (invites, notifications)
    socket.join(`user:${userId}`)
    console.log(`✅ Socket ${socket.id} joined user room: user:${userId}`)

    // SOCKET COMMAND: /join channelName [private]
    socket.on('command:join', async (payload: any, ack?: (response: any) => void) => {
      const reply = ensureAck(ack)

      try {
        const channelName = (payload?.channelName || payload?.name || '').toString().trim()
        const isPrivate = !!payload?.private

        if (!channelName) {
          reply({
            ok: false,
            command: 'join',
            error: 'Usage: /join channelName [private]',
          })
          return
        }

        const result = await CommandsService.join(socket.data.userId, channelName, isPrivate)

        if (result?.channelId) {
          socket.join(`channel:${result.channelId}`)
        }

        reply({
          ok: true,
          command: 'join',
          result,
        })
      } catch (error: any) {
        console.error('Socket command:join failed', error)
        reply({
          ok: false,
          command: 'join',
          error: error?.message || 'Command failed',
        })
      }
    })

    // SOCKET COMMAND: /invite channelId nickname
    socket.on('command:invite', async (payload: any, ack?: (response: any) => void) => {
      const reply = ensureAck(ack)

      try {
        const channelId = Number(payload?.channelId)
        const nickname = (payload?.nickname || '').toString().trim()

        if (!channelId || Number.isNaN(channelId) || !nickname) {
          reply({
            ok: false,
            command: 'invite',
            error: 'Usage: /invite nickname (requires channelId)',
          })
          return
        }

        const result = await CommandsService.invite(channelId, socket.data.userId, nickname)

        reply({
          ok: true,
          command: 'invite',
          result,
        })
      } catch (error: any) {
        console.error('Socket command:invite failed', error)
        reply({
          ok: false,
          command: 'invite',
          error: error?.message || 'Command failed',
        })
      }
    })

    // SOCKET COMMAND: /revoke channelId nickname
    socket.on('command:revoke', async (payload: any, ack?: (response: any) => void) => {
      const reply = ensureAck(ack)

      try {
        const channelId = Number(payload?.channelId)
        const nickname = (payload?.nickname || '').toString().trim()

        if (!channelId || Number.isNaN(channelId) || !nickname) {
          reply({
            ok: false,
            command: 'revoke',
            error: 'Usage: /revoke nickname (requires channelId)',
          })
          return
        }

        const result = await CommandsService.revoke(channelId, socket.data.userId, nickname)

        reply({
          ok: true,
          command: 'revoke',
          result,
        })
      } catch (error: any) {
        console.error('Socket command:revoke failed', error)
        reply({
          ok: false,
          command: 'revoke',
          error: error?.message || 'Command failed',
        })
      }
    })

    // SOCKET COMMAND: /kick channelId nickname
    socket.on('command:kick', async (payload: any, ack?: (response: any) => void) => {
      const reply = ensureAck(ack)

      try {
        const channelId = Number(payload?.channelId)
        const nickname = (payload?.nickname || '').toString().trim()

        if (!channelId || Number.isNaN(channelId) || !nickname) {
          reply({
            ok: false,
            command: 'kick',
            error: 'Usage: /kick nickname (requires channelId)',
          })
          return
        }

        const result = await CommandsService.kick(channelId, socket.data.userId, nickname)

        reply({
          ok: true,
          command: 'kick',
          result,
        })
      } catch (error: any) {
        console.error('Socket command:kick failed', error)
        reply({
          ok: false,
          command: 'kick',
          error: error?.message || 'Command failed',
        })
      }
    })

    // SOCKET COMMAND: /cancel (leave channel)
    socket.on('command:cancel', async (payload: any, ack?: (response: any) => void) => {
      const reply = ensureAck(ack)

      try {
        const channelId = Number(payload?.channelId)
        if (!channelId || Number.isNaN(channelId)) {
          reply({
            ok: false,
            command: 'cancel',
            error: 'ChannelId is required for /cancel',
          })
          return
        }

        const result = await CommandsService.cancel(channelId, socket.data.userId)
        socket.leave(`channel:${channelId}`)

        reply({
          ok: true,
          command: 'cancel',
          result,
        })
      } catch (error: any) {
        console.error('Socket command:cancel failed', error)
        reply({
          ok: false,
          command: 'cancel',
          error: error?.message || 'Command failed',
        })
      }
    })

    // SOCKET COMMAND: /quit (owner deletes channel)
    socket.on('command:quit', async (payload: any, ack?: (response: any) => void) => {
      const reply = ensureAck(ack)

      try {
        const channelId = Number(payload?.channelId)
        if (!channelId || Number.isNaN(channelId)) {
          reply({
            ok: false,
            command: 'quit',
            error: 'ChannelId is required for /quit',
          })
          return
        }

        const result = await CommandsService.quit(channelId, socket.data.userId)

        // leave the room locally
        socket.leave(`channel:${channelId}`)

        reply({
          ok: true,
          command: 'quit',
          result,
        })
      } catch (error: any) {
        console.error('Socket command:quit failed', error)
        reply({
          ok: false,
          command: 'quit',
          error: error?.message || 'Command failed',
        })
      }
    })

    // LEGACY COMMAND WRAPPER (will be replaced command-by-command)
    socket.on('command', async (msg: CommandMessage, ack?: (response: any) => void) => {
      const safeAck = typeof ack === 'function' ? ack : () => {}

      try {
        if (!msg || msg.type !== 'command') {
          safeAck({ ok: false, error: 'Invalid command message' })
          return
        }

        const { command, payload = {} } = msg
        const normalizedCommand = (command || '').toString().toLowerCase()

        switch (normalizedCommand) {
          case 'join': {
            socket.emit('command:join', payload, (joinResponse: any) => safeAck(joinResponse))
            return
          }
          case 'invite': {
            socket.emit('command:invite', payload, (inviteResponse: any) => safeAck(inviteResponse))
            return
          }
          case 'revoke': {
            socket.emit('command:revoke', payload, (revokeResponse: any) => safeAck(revokeResponse))
            return
          }
          case 'kick': {
            socket.emit('command:kick', payload, (kickResponse: any) => safeAck(kickResponse))
            return
          }
          case 'cancel': {
            socket.emit('command:cancel', payload, (cancelResponse: any) => safeAck(cancelResponse))
            return
          }
          case 'quit': {
            socket.emit('command:quit', payload, (quitResponse: any) => safeAck(quitResponse))
            return
          }
          default: {
            safeAck({
              ok: false,
              command: normalizedCommand,
              error: `Unknown command: /${normalizedCommand}`,
            })
            return
          }
        }
      } catch (error: any) {
        console.error('Socket command failed', msg?.command, error)
        safeAck({
          ok: false,
          command: msg?.command,
          error: error?.message || 'Command failed',
        })
      }
    })

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}`, reason)
    })
  })

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
