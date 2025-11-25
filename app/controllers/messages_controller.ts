import type { HttpContext } from '@adonisjs/core/http'
import Message from '#models/message'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { sendMessageValidator } from '#validators/send_message_validator'

export default class MessagesController {
  // GET /api/channels/:channelId/messages
  async index({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const channelId = params.channelId
    const page = request.input('page', 1)
    const limit = request.input('limit', 50)

    // control membership
    const membership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', user.id)
      .first()

    if (!membership) {
      return response.forbidden({ message: 'You are not a member of this channel' })
    }

    // Získaj správy s autorom a mentioned userom
    const messages = await db
      .from('messages')
      .where('channel_id', channelId)
      .leftJoin('users as author', 'messages.user_id', 'author.id')
      .leftJoin('users as mentioned', 'messages.mentioned_user_id', 'mentioned.id')
      .select(
        'messages.id',
        'messages.content',
        'messages.created_at as createdAt',
        'messages.user_id as userId',
        'messages.mentioned_user_id as mentionedUserId',
        'author.nick_name as authorNickName',
        'mentioned.nick_name as mentionedUserNickName'
      )
      .orderBy('messages.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

    // reverse, bcs of chat
    const reversedMessages = messages.reverse()

    return response.ok({
      data: reversedMessages,
      meta: {
        page,
        limit,
        hasMore: messages.length === limit
      }
    })
  }
}
