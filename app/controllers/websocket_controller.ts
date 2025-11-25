import type { HttpContext } from '@adonisjs/core/http'
import WebSocketService from '#services/websocket_service'

export default class WebSocketController {
  /**
   * POST /ws/subscribe - Subscribe to channel
   */
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

  /**
   * POST /ws/message - Send message
   */
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

  /**
   * POST /ws/typing - Typing indicator
   */
  async typing({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { channelId, isTyping } = request.only(['channelId', 'isTyping'])

    WebSocketService.broadcastTyping(channelId, user.id, isTyping)

    return response.ok({ message: 'Typing status broadcasted' })
  }
}
