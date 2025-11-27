import db from '@adonisjs/lucid/services/db'
import Channel from '#models/channel'
import { getIo } from '#start/socket'

export default class CommandsService {
  static parseCommand(content: string) {
    if (!content.startsWith('/')) return null

    const parts = content.trim().split(' ')
    return {
      command: parts[0].substring(1),
      args: parts.slice(1),
    }
  }

  /**
   * /join channelName [private]
   * - ak channel neexistuje: vytvorí (public/private podľa argumentu) a pripojí usera ako ownera
   * - ak existuje public: pripojí usera ako člena (ak nemá ban)
   * - ak existuje private: odmietne (join je možný len cez /invite)
   */
  static async join(userId: number, name: string, isPrivate: boolean) {
    if (!name) {
      throw new Error('Channel name is required')
    }

    // user kvôli nickname do system správy
    const user = await db.from('users').where('id', userId).first()
    if (!user) {
      throw new Error('User not found')
    }

    // existujúci channel?
    let channel = await Channel.findBy('name', name)

    if (!channel) {
      // kanál neexistuje → vytvoríme
      channel = await Channel.create({
        name,
        private: isPrivate,
        ownerId: userId,
      })

      await db.table('user_channel_mapper').insert({
        user_id: userId,
        channel_id: channel.id,
        owner: true,
        kick_count: 0,
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })

      getIo().emit('system', {
        type: 'channel_created',
        channelId: channel.id,
        name: channel.name,
        private: channel.private,
        ownerNickName: user.nick_name,
      })

      return {
        message: `Channel ${name} created and joined`,
        channelId: channel.id,
      }
    }

    // existujúci channel
    if (channel.private) {
      // private channel sa joinuje len cez /invite
      throw new Error('Cannot join private channel without invite')
    }

    // už je členom?
    const existing = await db
      .from('user_channel_mapper')
      .where('channel_id', channel.id)
      .where('user_id', userId)
      .first()

    if (existing) {
      return {
        message: 'Already a member of this channel',
        channelId: channel.id,
      }
    }

    // ban check (kick_count >= 3)
    const previousMembership = await db
      .from('user_channel_mapper')
      .where('channel_id', channel.id)
      .where('user_id', userId)
      .whereNotNull('kick_count')
      .first()

    if (previousMembership && previousMembership.kick_count >= 3) {
      throw new Error('You are banned from this channel')
    }

    // pridaj ako clena
    await db.table('user_channel_mapper').insert({
      user_id: userId,
      channel_id: channel.id,
      owner: false,
      kick_count: 0,
      joined_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })

    getIo().emit('system', {
      type: 'join',
      channelId: channel.id,
      nickName: user.nick_name,
    })

    return {
      message: 'Joined channel',
      channelId: channel.id,
    }
  }

  static async invite(channelId: number, ownerId: number, nickname: string) {
    const channel = await Channel.findOrFail(channelId)

    if (channel.ownerId !== ownerId) {
      throw new Error('Only owner can invite')
    }

    const user = await db.from('users').where('nick_name', nickname).first()
    if (!user) throw new Error('User not found')

    await db.table('user_channel_mapper').insert({
      user_id: user.id,
      channel_id: channelId,
      owner: false,
      kick_count: 0,
      joined_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })

    getIo().to(`channel:${channelId}`).emit('system', {
      type: 'invite',
      nickname,
    })

    return { message: `User ${nickname} invited` }
  }

  static async revoke(channelId: number, ownerId: number, nickname: string) {
    const channel = await Channel.findOrFail(channelId)

    if (channel.ownerId !== ownerId) {
      throw new Error('Only owner can revoke access')
    }

    const user = await db.from('users').where('nick_name', nickname).first()
    if (!user) throw new Error('User not found')

    await db
      .from('user_channel_mapper')
      .where('user_id', user.id)
      .where('channel_id', channelId)
      .delete()

    getIo().to(`channel:${channelId}`).emit('system', {
      type: 'revoke',
      nickname,
    })

    return { message: `User ${nickname} revoked` }
  }

  static async kick(channelId: number, ownerId: number, nickname: string) {
    const channel = await Channel.findOrFail(channelId)

    if (channel.ownerId !== ownerId) {
      throw new Error('Only owner can kick')
    }

    const user = await db.from('users').where('nick_name', nickname).first()
    if (!user) throw new Error('User not found')

    await db
      .from('user_channel_mapper')
      .where({ user_id: user.id, channel_id: channelId })
      .update({
        kick_count: 3,
      })

    getIo().to(`channel:${channelId}`).emit('system', {
      type: 'kick',
      nickname,
    })

    return { message: `User ${nickname} kicked` }
  }

  static async list(channelId: number, userId: number) {
    const members = await db
      .from('user_channel_mapper')
      .join('users', 'user_channel_mapper.user_id', 'users.id')
      .select('users.nick_name', 'user_channel_mapper.owner', 'user_channel_mapper.kick_count')
      .where('channel_id', channelId)

    return { members }
  }

  static async quit(channelId: number, userId: number) {
    await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .delete()

    return { message: 'You left the channel' }
  }
}
