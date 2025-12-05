import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class SyncController {
  /**
   * Returns messages created after the provided timestamp for all channels
   * the authenticated user is a member of. Used for post-reconnect sync.
   */
  async sync({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const since = request.input('since')

    if (!since) {
      return response.ok({
        since: new Date().toISOString(),
        messages: {},
      })
    }

    const sinceDate = new Date(since)
    if (Number.isNaN(sinceDate.getTime())) {
      return response.badRequest({ message: 'Invalid since parameter' })
    }

    const channelRows = await db
      .from('user_channel_mapper')
      .where('user_id', user.id)
      .select('channel_id')

    const channelIds = channelRows.map((row) => row.channel_id)
    if (channelIds.length === 0) {
      return response.ok({ since: sinceDate.toISOString(), messages: {} })
    }

    const rawMessages = await db
      .from('messages')
      .whereIn('messages.channel_id', channelIds)
      .andWhere('messages.created_at', '>', sinceDate.toISOString())
      .leftJoin('users as author', 'messages.user_id', 'author.id')
      .leftJoin('users as mentioned', 'messages.mentioned_user_id', 'mentioned.id')
      .select(
        'messages.id',
        'messages.content',
        'messages.created_at as createdAt',
        'messages.user_id as userId',
        'messages.mentioned_user_id as mentionedUserId',
        'author.nick_name as authorNickName',
        'mentioned.nick_name as mentionedUserNickName',
        'messages.channel_id as channelId'
      )
      .orderBy('messages.created_at', 'asc')

    const grouped: Record<string, any[]> = {}
    for (const msg of rawMessages) {
      const key = String(msg.channelId)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(msg)
    }

    return response.ok({
      since: sinceDate.toISOString(),
      messages: grouped,
    })
  }
}
