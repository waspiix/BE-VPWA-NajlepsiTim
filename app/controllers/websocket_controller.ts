import type { HttpContext } from '@adonisjs/core/http'
import WebSocketService from '#services/websocket_service'
import CommandsService from '#services/commands_service'

export default class WebSocketController {
  async subscribe({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const { channelId } = request.only(['channelId'])

    try {
      const channelName = await WebSocketService.subscribeToChannel(channelId, user.id)
      return response.ok({ channelName })
    } catch (error: any) {
      return response.forbidden({ message: error.message || 'Cannot subscribe to channel' })
    }
  }

  async sendMessage({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const { channelId, content } = request.only(['channelId', 'content'])

    if (!content || content.trim().length === 0) {
      return response.badRequest({ message: 'Content is required' })
    }

    try {
      const message = await WebSocketService.sendMessage(channelId, user.id, content)
      return response.ok(message)
    } catch (error: any) {
      return response.forbidden({ message: error.message || 'Cannot send message' })
    }
  }

  async typing({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const { channelId, isTyping } = request.only(['channelId', 'isTyping'])

    await WebSocketService.broadcastTyping(channelId, user.id, isTyping)

    return response.ok({ message: 'Typing status broadcasted' })
  }

  async command({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const { channelId, content } = request.only(['channelId', 'content'])

    if (!content || content.trim().length === 0) {
      return response.badRequest({ message: 'Content is required' })
    }

    const parsed = CommandsService.parseCommand(content)

    if (!parsed) {
      return response.badRequest({
        message: 'Invalid command format. Commands start with /',
      })
    }

    const { command, args } = parsed

    // helper: príkazy, ktoré potrebujú validný channelId
    const ensureChannelId = () => {
      const id = Number(channelId)
      if (!id || Number.isNaN(id)) {
        throw new Error(`ChannelId is required for /${command} command`)
      }
      return id
    }

    try {
      let result

      switch (command) {
        case 'join': {
          const channelName = args[0]
          const rawFlag = args[1]?.replace(/\[|\]/g, '').toLowerCase()
          const isPrivate = rawFlag === 'private'

          if (!channelName) {
            return response.badRequest({
              message: 'Usage: /join channelName [private]',
            })
          }

          result = await CommandsService.join(user.id, channelName, isPrivate)
          break
        }

        case 'invite': {
          const id = ensureChannelId()
          const nickname = args[0]
          if (!nickname) {
            return response.badRequest({ message: 'Usage: /invite nickname' })
          }
          result = await CommandsService.invite(id, user.id, nickname)
          break
        }

        case 'revoke': {
          const id = ensureChannelId()
          const nickname = args[0]
          if (!nickname) {
            return response.badRequest({ message: 'Usage: /revoke nickname' })
          }
          result = await CommandsService.revoke(id, user.id, nickname)
          break
        }

        case 'kick': {
          const id = ensureChannelId()
          const nickname = args[0]
          if (!nickname) {
            return response.badRequest({ message: 'Usage: /kick nickname' })
          }
          result = await CommandsService.kick(id, user.id, nickname)
          break
        }

        case 'list': {
          const id = ensureChannelId()
          result = await CommandsService.list(id, user.id)
          break
        }

        case 'quit': {
          const id = ensureChannelId()
          result = await CommandsService.quit(id, user.id)
          break
        }

        case 'cancel': {
          const id = ensureChannelId()
          result = await CommandsService.cancel(id, user.id)
          break
        }

        default:
          return response.badRequest({
            message: `Unknown command: /${command}`,
            availableCommands: ['/join', '/invite', '/revoke', '/kick', '/list', '/quit', '/cancel'],
          })
      }

      return response.ok(result)
    } catch (error: any) {
      return response.forbidden({ message: error.message || 'Command failed' })
    }
  }
}
