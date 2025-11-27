import db from '@adonisjs/lucid/services/db'
import Channel from '#models/channel'
import { getIo } from '#start/socket'

export default class WebSocketService {
  static async subscribeToChannel(channelId: number, userId: number) {
    const membership = await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .first()

    if (!membership) {
      throw new Error('You are not a member of this channel')
    }

    await Channel.findOrFail(channelId)
    const channelName = `channel:${channelId}`

    const io = getIo()
    io.to(channelName)

    return channelName
  }

  static async sendMessage(channelId: number, userId: number, content: string) {
    // 1) over, že user je člen kanála
    const membership = await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .first()

    if (!membership) {
      throw new Error('You are not a member of this channel')
    }

    const io = getIo()
    const channelName = `channel:${channelId}`

    // 2) nájdi prípadný @mention
    let mentionedUserId: number | null = null
    const mentionMatch = content.match(/@(\w+)/)
    if (mentionMatch) {
      const nick = mentionMatch[1]
      const mentionedUser = await db
        .from('users')
        .select('id')
        .where('nick_name', nick)
        .first()

      if (mentionedUser) {
        mentionedUserId = mentionedUser.id
      }
    }

    // 3) zapíš správu do DB
    const [row] = await db
      .table('messages')
      .insert({
        channel_id: channelId,
        user_id: userId,
        content,
        mentioned_user_id: mentionedUserId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning([
        'id',
        'channel_id as channelId',
        'user_id as userId',
        'content',
        'mentioned_user_id as mentionedUserId',
        'created_at as createdAt',
      ])

    // 4) pošli realtime event do kanála
    io.to(channelName).emit('message', row)

    return row
  }

  static broadcastTyping(channelId: number, userId: number, isTyping: boolean) {
    const io = getIo()
    const channelName = `channel:${channelId}`

    io.to(channelName).emit('typing', {
      userId,
      isTyping,
    })
  }
}
