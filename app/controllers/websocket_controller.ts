import type { HttpContext } from '@adonisjs/core/http'
import WebSocketService from '#services/websocket_service'
import CommandsService from '#services/commands_service'

export default class WebSocketController {
  async subscribe({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { channelId } = request.only(['channelId'])

    try {
      const channelName = await WebSocketService.subscribeToChannel(channelId, user.id)
      return response.ok({ channelName })
    } catch (error) {
      return response.forbidden({ message: error.message })
    }
  }

  async sendMessage({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { channelId, content } = request.only(['channelId', 'content'])

    if (!content || content.trim().length === 0) {
      return response.badRequest({ message: 'Content is required' })
    }

    try {
      const message = await WebSocketService.sendMessage(channelId, user.id, content)
      return response.ok(message)
    } catch (error) {
      return response.forbidden({ message: error.message })
    }
  }

  async typing({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { channelId, isTyping } = request.only(['channelId', 'isTyping'])

    await WebSocketService.broadcastTyping(channelId, user.id, isTyping)

    return response.ok({ message: 'Typing status broadcasted' })
  }

  async command({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
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

        case 'invite':
          result = await CommandsService.invite(channelId, user.id, args[0])
          break

        case 'revoke':
          result = await CommandsService.revoke(channelId, user.id, args[0])
          break

        case 'kick':
          result = await CommandsService.kick(channelId, user.id, args[0])
          break

        case 'list':
          result = await CommandsService.list(channelId, user.id)
          break

        case 'quit':
          result = await CommandsService.quit(channelId, user.id)
          break

        case 'cancel':
          result = await CommandsService.cancel(channelId, user.id)
          break

        default:
          return response.badRequest({
            message: `Unknown command: /${command}`,
            availableCommands: ['/join', '/invite', '/revoke', '/kick', '/list', '/quit', '/cancel'],
          })
      }

      return response.ok(result)
    } catch (error: any) {
      return response.forbidden({ message: error.message })
    }
  }
}
