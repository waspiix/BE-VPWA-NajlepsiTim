import transmit from '@adonisjs/transmit/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Message from '#models/message'
import db from '@adonisjs/lucid/services/db'

export default class WebSocketService {
  /**
   * Subscribe user to channel
   */
  static async subscribeToChannel(channelId: number, userId: number) {
    const channelName = `channel:${channelId}`
    
    // Skontroluj, ci je user clen kanala
    const isMember = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', userId)
      .first()

    if (!isMember) {
      throw new Error('Not a member of this channel')
    }

    // Kick count >= 3 = banned
    if (isMember.kick_count >= 3) {
      throw new Error('You are banned from this channel')
    }

    return channelName
  }

  /**
   * Send message
   */
  static async sendMessage(
    channelId: number,
    userId: number,
    content: string
  ) {
    // Skontroluj clenstvo
    const membership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', userId)
      .first()

    if (!membership) {
      throw new Error('You are not a member of this channel')
    }

    if (membership.kick_count >= 3) {
      throw new Error('You are banned from this channel')
    }

    const user = await User.findOrFail(userId)

    // Detekcia @mention
    let mentionedUserId = null
    const mentionMatch = content.match(/@(\w+)/)
    
    if (mentionMatch) {
      const mentionedNick = mentionMatch[1]
      const mentionedUser = await User.findBy('nickName', mentionedNick)
      
      if (mentionedUser) {
        // Skontroluj, ci mentioned user je clen kanala
        const mentionedMembership = await db
          .from('user_channel_mapper')
          .where('channel_id', channelId)
          .where('user_id', mentionedUser.id)
          .first()
        
        if (mentionedMembership) {
          mentionedUserId = mentionedUser.id
        }
      }
    }

    // Vytvor spravu
    const message = await Message.create({
      channelId,
      userId,
      content,
      mentionedUserId
    })

    // Aktualizuj last activity kanala (30-day rule)
    await db.from('channels').where('id', channelId).update({ updated_at: new Date() })

    // Priprav data pre broadcast
    const messageData = {
      id: message.id,
      channelId: message.channelId,
      userId: message.userId,
      content: message.content,
      mentionedUserId: message.mentionedUserId,
      createdAt: message.createdAt.toISO(),
      author: {
        id: user.id,
        nickName: user.nickName
      }
    }

    // Broadcast do kanala
    transmit.broadcast(`channel:${channelId}`, 'message:new', messageData)

    return messageData
  }

  /**
   * Typing indicator
   */
  static broadcastTyping(channelId: number, userId: number, isTyping: boolean) {
    transmit.broadcast(`channel:${channelId}`, 'user:typing', {
      userId,
      isTyping
    })
  }
}
