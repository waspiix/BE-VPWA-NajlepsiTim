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

  static async invite(channelId: number, ownerId: number, nickname: string) {
    const channel = await Channel.findOrFail(channelId)

    if (channel.ownerId !== ownerId) {
      throw new Error('Only owner can invite')
    }

    const user = await db.from('users').where('nickname', nickname).first()
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

    const user = await db.from('users').where('nickname', nickname).first()
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

    const user = await db.from('users').where('nickname', nickname).first()
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
      .join('users', 'users.id', 'user_channel_mapper.user_id')
      .select('users.nickname', 'user_channel_mapper.owner', 'user_channel_mapper.kick_count')
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
