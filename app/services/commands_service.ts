import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Channel from '#models/channel'
import transmit from '@adonisjs/transmit/services/main'

export default class CommandsService {
  /**
   * Parse command from message content
   */
  static parseCommand(content: string): { command: string; args: string[] } | null {
    const trimmed = content.trim()
    if (!trimmed.startsWith('/')) return null

    const parts = trimmed.slice(1).split(/\s+/)
    const command = parts[0].toLowerCase()
    const args = parts.slice(1)

    return { command, args }
  }

    /**
     * /invite nickName - Pozvi usera do private kanala / unban
     */
    static async invite(channelId: number, ownerId: number, targetNickName: string) {
    // Skontroluj, ci je kanal private
    const channel = await Channel.findOrFail(channelId)
    
    if (!channel.private) {
        throw new Error('Invite is only for private channels. Public channels can be joined via /join')
    }

    // Skontroluj, ci je user owner
    if (channel.ownerId !== ownerId) {
        throw new Error('Only channel owner can invite users')
    }

    // Najdi target usera
    const targetUser = await User.query()
        .whereRaw('LOWER(nick_name) = LOWER(?)', [targetNickName])
        .first()

    if (!targetUser) {
        throw new Error(`User '${targetNickName}' not found`)
    }

    // Skontroluj, ci uz nie je clen
    const existing = await db
        .from('user_channel_mapper')
        .where('channel_id', channelId)
        .where('user_id', targetUser.id)
        .first()

    if (existing) {
        // Ak je banned (kick_count >= 3), unban ho
        if (existing.kick_count >= 3) {
        await db
            .from('user_channel_mapper')
            .where('channel_id', channelId)
            .where('user_id', targetUser.id)
            .update({ kick_count: 0 }) // Reset ban

        // Vymaz kick zaznamy
        await db
            .from('channel_kicks')
            .where('channel_id', channelId)
            .where('kicked_user_id', targetUser.id)
            .delete()

        transmit.broadcast(`channel:${channelId}`, 'user:unbanned', {
            userId: targetUser.id,
            nickName: targetUser.nickName
        })

        return { message: `${targetNickName} has been unbanned` }
        }

        throw new Error(`${targetNickName} is already a member`)
    }

    // Pridaj do kanala
    await db.table('user_channel_mapper').insert({
        user_id: targetUser.id,
        channel_id: channelId,
        owner: false,
        kick_count: 0,
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
    })

    // Broadcast
    transmit.broadcast(`channel:${channelId}`, 'user:invited', {
        userId: targetUser.id,
        nickName: targetUser.nickName
    })

    return { message: `${targetNickName} has been invited to the channel` }
    }

  /**
   * /revoke nickName - Odoberie usera z private kanala (len owner)
   */
  static async revoke(channelId: number, ownerId: number, targetNickName: string) {
    const channel = await Channel.findOrFail(channelId)
    
    if (!channel.private) {
      throw new Error('Revoke is only for private channels')
    }

    if (channel.ownerId !== ownerId) {
      throw new Error('Only channel owner can revoke access')
    }

    const targetUser = await User.query()
      .whereRaw('LOWER(nick_name) = LOWER(?)', [targetNickName])
      .first()

    if (!targetUser) {
      throw new Error(`User '${targetNickName}' not found`)
    }

    // Odstran z kanala
    const deleted = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', targetUser.id)
      .delete()

    if (deleted === 0) {
      throw new Error(`${targetNickName} is not a member`)
    }

    // Broadcast
    transmit.broadcast(`channel:${channelId}`, 'user:revoked', {
      userId: targetUser.id,
      nickName: targetUser.nickName
    })

    return { message: `${targetNickName} has been removed from the channel` }
  }

  /**
   * /kick nickName - Hlasovanie o kicke (3x = ban)
   */
  static async kick(channelId: number, kickerId: number, targetNickName: string) {
    const channel = await Channel.findOrFail(channelId)

    // Najdi target usera
    const targetUser = await User.query()
      .whereRaw('LOWER(nick_name) = LOWER(?)', [targetNickName])
      .first()

    if (!targetUser) {
      throw new Error(`User '${targetNickName}' not found`)
    }

    // Nemozes kicknut sam seba
    if (targetUser.id === kickerId) {
      throw new Error('You cannot kick yourself')
    }

    // Skontroluj, ci target je clen
    const targetMembership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', targetUser.id)
      .first()

    if (!targetMembership) {
      throw new Error(`${targetNickName} is not a member`)
    }

    const kickerMembership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', kickerId)
      .first()

    // Ak je kicker owner, permanent ban (kick_count = 3)
    if (channel.ownerId === kickerId) {
      await db
        .from('user_channel_mapper')
        .where('channel_id', channelId)
        .where('user_id', targetUser.id)
        .update({ kick_count: 3 })

      transmit.broadcast(`channel:${channelId}`, 'user:banned', {
        userId: targetUser.id,
        nickName: targetUser.nickName,
        reason: 'Kicked by channel owner'
      })

      return { message: `${targetNickName} has been permanently banned (owner kick)` }
    }

    // Skontroluj, ci kicker uz dal kick
    const existingKick = await db
      .from('channel_kicks')
      .where('channel_id', channelId)
      .where('kicked_user_id', targetUser.id)
      .where('kicker_user_id', kickerId)
      .first()

    if (existingKick) {
      throw new Error('You already voted to kick this user')
    }

    // Pridaj kick zaznam
    await db.table('channel_kicks').insert({
      channel_id: channelId,
      kicked_user_id: targetUser.id,
      kicker_user_id: kickerId,
      created_at: new Date()
    })

    // Increment kick_count
    await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', targetUser.id)
      .increment('kick_count', 1)

    // Skontroluj novy kick_count
    const updated = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', targetUser.id)
      .first()

    if (updated.kick_count >= 3) {
      transmit.broadcast(`channel:${channelId}`, 'user:banned', {
        userId: targetUser.id,
        nickName: targetUser.nickName,
        reason: '3 kick votes reached'
      })

      return { 
        message: `${targetNickName} has been permanently banned (${updated.kick_count} kicks)`,
        kickCount: updated.kick_count
      }
    }

    transmit.broadcast(`channel:${channelId}`, 'user:kick_vote', {
      userId: targetUser.id,
      nickName: targetUser.nickName,
      kickCount: updated.kick_count
    })

    return { 
      message: `Kick vote recorded (${updated.kick_count}/3)`,
      kickCount: updated.kick_count
    }
  }

  /**
   * /list - Zobraz clenov kanala
   */
  static async list(channelId: number, userId: number) {
    // Skontroluj, ci je user clen
    const membership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', userId)
      .first()

    if (!membership) {
      throw new Error('You are not a member of this channel')
    }

    // Ziskaj vsetkych clenov
    const members = await db
      .from('user_channel_mapper')
      .join('users', 'user_channel_mapper.user_id', 'users.id')
      .where('user_channel_mapper.channel_id', channelId)
      .where('user_channel_mapper.kick_count', '<', 3)
      .select(
        'users.id',
        'users.nick_name as nickName',
        'user_channel_mapper.owner',
        'user_channel_mapper.kick_count as kickCount',
        'user_channel_mapper.joined_at as joinedAt'
      )
      .orderBy('user_channel_mapper.joined_at', 'asc')

    return { members }
  }

  /**
   * /quit alebo /cancel - Opusti kanal (owner = zrusi kanal)
   */
  static async quit(channelId: number, userId: number) {
    const channel = await Channel.findOrFail(channelId)

    const membership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', userId)
      .first()

    if (!membership) {
      throw new Error('You are not a member of this channel')
    }

    // Ak je owner, kanal zanikne
    if (channel.ownerId === userId) {
      await channel.delete()

      transmit.broadcast(`channel:${channelId}`, 'channel:deleted', {
        channelId,
        reason: 'Owner left the channel'
      })

      return { message: 'Channel has been deleted (you were the owner)' }
    }

    // Inak len odstran clenstvo
    await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', userId)
      .delete()

    transmit.broadcast(`channel:${channelId}`, 'user:left', {
      userId,
      channelId
    })

    return { message: 'You have left the channel' }
  }
}
