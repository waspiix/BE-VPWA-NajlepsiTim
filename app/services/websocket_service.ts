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
    // make sure user is a channel member
    const membership = await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .first()

    if (!membership) {
      throw new Error('You are not a member of this channel')
    }

    const io = getIo()
    const channelName = `channel:${channelId}`

    // find optional mention
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

    // store message
    const [inserted] = await db
      .table('messages')
      .insert({
        channel_id: channelId,
        user_id: userId,
        content,
        mentioned_user_id: mentionedUserId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning(['id'])

    // load message with nicknames
    const [fullMessage] = await db
      .from('messages')
      .where('messages.id', inserted.id)
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

    // broadcast to all sockets
    io.emit('new_message', fullMessage)
    io.emit('message', fullMessage) // backward compatibility
    // if rooms are used later, you can also target channel room:
    // io.to(channelName).emit('message', fullMessage)

    return fullMessage
  }

  static async broadcastTyping(channelId: number, userId: number, isTyping: boolean) {
    const io = getIo()

    const user = await db
      .from('users')
      .select('nick_name')
      .where('id', userId)
      .first()

    io.emit('typing', {
      channelId,
      userId,
      nickName: user?.nick_name,
      isTyping,
    })
  }
}

