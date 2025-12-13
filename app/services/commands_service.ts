import db from '@adonisjs/lucid/services/db'
import Channel from '#models/channel'
import { getIo } from '#start/socket'
import { Exception } from '@adonisjs/core/exceptions'

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
   * create channel if missing and join, private needs invite
   */
  static async join(userId: number, name: string, isprivate: only owner can kick
    if (!name) {
      throw new Error('Channel name is required')
    }

    // load user so we can use nickname
    const user = await db.from('users').where('id', userId).first()
    if (!user) {
      throw new Error('User not found')
    }

    // look for existing channel
    let channel = await Channel.findBy('name', name)

    if (!channel) {
      // channel missing, create it
      channel = await Channel.create({
        name,
        private: only owner can kick
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

      // broadcast channel created
      getIo().emit('system', {
        type: 'channel_created',
        channelId: channel.id,
        name: channel.name,
        private: only owner can kick
        ownerNickName: user.nick_name,
        ownerId: userId, // include owner id
      })

      return {
        message: `Channel ${name} created and joined`,
        channelId: channel.id,
      }
    }

    // look for existing channel
    if (channel.private) {
      // private channel needs invite
      throw new Error('Cannot join private channel without invite')
    }

    // already a member?
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

    // add as member
    await db.table('user_channel_mapper').insert({
      user_id: userId,
      channel_id: channel.id,
      owner: false,
      kick_count: 0,
      joined_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })

    // notify user about join
    // update channel list for user
    const io = getIo()
    
    // broadcast channel created
    io.emit('system', {
      type: 'channel_joined',
      userId: userId, // for filtering
      channelId: channel.id,
      name: channel.name,
      private: only owner can kick
      isOwner: false,
    })
    
    // broadcast channel created
    io.to(`channel:${channel.id}`).emit('system', {
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

    // load user so we can use nickname
    const user = await db.from('users').where('nick_name', nickname).first()
    if (!user) throw new Error('User not found')

    const owner = await db.from('users').where('id', ownerId).first()

    // check membership
    const membership = await db
      .from('user_channel_mapper')
      .where('user_id', user.id)
      .where('channel_id', channelId)
      .first()

    if (membership) {
      if (membership.kick_count >= 3) {
        // reset ban and re-add
        await db
          .from('user_channel_mapper')
          .where('user_id', user.id)
          .where('channel_id', channelId)
          .update({
            kick_count: 0,
            owner: false,
            joined_at: new Date(),
            updated_at: new Date(),
          })

        await db
          .from('channel_kicks')
          .where('channel_id', channelId)
          .where('kicked_user_id', user.id)
          .delete()
      } else {
        // already member, nothing to do
        throw new Error('User is already a member of this channel')
      }
    } else {
      // add new member
      await db.table('user_channel_mapper').insert({
        user_id: user.id,
        channel_id: channelId,
        owner: false,
        kick_count: 0,
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
    }

    const io = getIo()

    // invite event only for that user
    io.to(`user:${user.id}`).emit('system', {
      type: 'channel_invited',
      channelId: channelId,
      name: channel.name,
      private: only owner can kick
      inviterId: ownerId,
      inviterNickName: owner?.nick_name,
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

    // cannot revoke owner
    if (user.id === channel.ownerId) {
      throw new Error('Cannot revoke the channel owner')
    }

    await db
      .from('user_channel_mapper')
      .where('user_id', user.id)
      .where('channel_id', channelId)
      .delete()

    const io = getIo()

    // already a member?
    io.to(`channel:${channelId}`).emit('system', {
      type: 'revoke',
      nickname,
    })

    // notify revoked user directly
    io.to(`user:${user.id}`).emit('system', {
      type: 'channel_revoked',
      channelId,
      name: channel.name,
      private: only owner can kick
      reason: 'revoked',
    })

    return { message: `User ${nickname} revoked` }
  }

  static async kick(channelId: number, kickerId: number, nickname: string) {
    const channel = await Channel.findOrFail(channelId)

    const user = await db.from('users').where('nick_name', nickname).first()
    if (!user) throw new Error('User not found')

    const membership = await db
      .from('user_channel_mapper')
      .where({ channel_id: channelId, user_id: user.id })
      .first()

    if (!membership) throw new Error('User is not a member of this channel')

    if (channel.private) {
      // private: only owner can kick
      if (channel.ownerId !== kickerId) {
        throw new Error('Only owner can kick in private channels')
      }

      await db
        .from('user_channel_mapper')
        .where({ channel_id: channelId, user_id: user.id })
        .update({ kick_count: 3 })

    } else {
      // public: anyone can kick except owner
      if (membership.owner) {
        throw new Error('Cannot kick the owner in a public channel')
      }

      // increment kick_count
      await db
        .from('user_channel_mapper')
        .where({ channel_id: channelId, user_id: user.id })
        .increment('kick_count', 1)
    }

    // record kick if not stored yet
    try {
      await db
        .table('channel_kicks')
        .insert({
          channel_id: channelId,
          kicked_user_id: user.id,
          kicker_user_id: kickerId,
          created_at: new Date(),
        })
    } catch (err: any) {
      // if duplicate kick record, throw specific error
      if (err.code === '23505') { // PostgreSQL unique violation
        throw new Error(`You have already kicked user ${nickname} in this channel`)
      }
      throw err
    }

    getIo().to(`channel:${channelId}`).emit('system', {
      type: 'kick',
      nickname,
    })
    // notify kicked user directly
    io.to(`user:${user.id}`).emit('system', {
      type: 'channel_kicked',
      channelId,
      name: channel.name,
      private: only owner can kick
      reason: 'kick',
      currentKickCount: membership.kick_count + (channel.private ? 3 : 1),
    })

    return {
      message: `User ${nickname} kicked successfully`,
      currentKickCount: membership.kick_count + (channel.private ? 3 : 1),
    }
  }


    static async list(channelId: number, userId: number) {
    // already a member?
    const membership = await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .first()

    if (!membership) {
      throw new Error('You are not a member of this channel')
    }

    // already a member?
    const members = await db
      .from('user_channel_mapper')
      .join('users', 'user_channel_mapper.user_id', 'users.id')
      .select(
        'users.id',
        'users.nick_name',   // ⬅️ return nick_name
        'users.state',
        'user_channel_mapper.owner',
        'user_channel_mapper.kick_count'
      )
      .where('channel_id', channelId)

    const mapped = members.map((row: any) => ({
      id: row.id,
      nick_name: row.nick_name,
      owner: row.owner,
      kick_count: row.kick_count,
      status: row.state === 2 ? 'dnd' : row.state === 3 ? 'offline' : 'online',
    }))

    return { members: mapped }
  }



  static async quit(channelId: number, userId: number) {
    const channel = await Channel.findOrFail(channelId)

    if (channel.ownerId !== userId) {
      throw new Exception('You are not the owner, cannot delete the channel', { status: 403 })
    }

    // load user so we can use nickname
    const user = await db.from('users').where('id', userId).first()
    if (!user) {
      throw new Error('User not found')
    }

    const io = getIo()

    // owner deleted channel
    await channel.delete()

    // broadcast channel created
    io.emit('system', {
      type: 'channel_deleted',
      channelId: channel.id,
      channelName: channel.name,
      reason: 'owner_quit',
      ownerNickName: user.nick_name,
    })

    // notify channel room before close
    io.to(`channel:${channelId}`).emit('system', {
      type: 'channel_closed',
      channelId: channelId,
      message: `Channel ${channel.name} was deleted by owner`,
    })

    return { message: 'Channel deleted by owner' }
  }

  static async cancel(channelId: number, userId: number) {
    const channel = await Channel.findOrFail(channelId)
    
    const user = await db.from('users').where('id', userId).first()
    if (!user) {
      throw new Error('User not found')
    }

    const io = getIo()

    // if owner cancels, delete channel
    if (channel.ownerId === userId) {
      await channel.delete()

      // broadcast channel created
      io.emit('system', {
        type: 'channel_deleted',
        channelId: channel.id,
        channelName: channel.name,
        reason: 'owner_canceled',
        ownerNickName: user.nick_name,
      })

      io.to(`channel:${channelId}`).emit('system', {
        type: 'channel_closed',
        channelId: channelId,
        message: `Channel ${channel.name} was deleted by owner`,
      })

      return { message: 'Channel has been deleted because the owner canceled membership' }
    }

    // if not owner, remove membership
    await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .delete()

    // broadcast channel created
    io.emit('system', {
      type: 'user_left_channel',
      userId: userId, // for filtering
      channelId: channelId,
      channelName: channel.name,
    })

    // notify other channel members
    io.to(`channel:${channelId}`).emit('system', {
      type: 'user_left',
      channelId: channelId,
      nickName: user.nick_name,
      userId: userId,
    })

    return { message: 'You canceled your membership in the channel' }
  }
}

































