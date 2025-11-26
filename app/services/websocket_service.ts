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

    const channel = await Channel.findOrFail(channelId)
    const channelName = `channel:${channelId}`

    const io = getIo()
    io.to(channelName)

    return channelName
  }

  static async sendMessage(channelId: number, userId: number, content: string) {
    const io = getIo()
    const channelName = `channel:${channelId}`

    const message = {
      userId,
      content,
      channelId,
      createdAt: new Date(),
    }

    io.to(channelName).emit('message', message)

    return message
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
