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
  static async join(userId: number, name: string, isPrivate: boolean) {
    if (!name) {
      throw new Error('Channel name is required')
    }

    // load user so we can use nickname
    const user = await db.from('users').where('id', userId).first()
    if (!user) {
      throw new Error('User not found')
    }

    const io = getIo()

    // look for existing channel
    let channel = await Channel.findBy('name', name)

    if (!channel) {
      // channel missing, create it
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

      // notify only the creator about the newly created channel
      io.to(`user:${userId}`).emit('system', {
        type: 'channel_created',
        channelId: channel.id,
        name: channel.name,
        private: channel.private,
        ownerNickName: user.nick_name,
        ownerId: userId,
      })

      return {
        message: `Channel ${name} created and joined`,
        channelId: channel.id,
      }
    }

    let hadInvite = false
    // private channel → needs invite
    if (channel.private) {
      // private channel needs invite
      const invite = await db
        .from('channel_invites')
        .where('channel_id', channel.id)
        .where('user_id', userId)
        .first()

      if (!invite) {
        throw new Error('Cannot join private channel without invite')
      }
      hadInvite = true
    }

    // already a member?
    const existing = await db
      .from('user_channel_mapper')
      .where('channel_id', channel.id)
      .where('user_id', userId)
      .first()

    if (existing) {
      // check kick_count if already a member (rare)
      if (existing.kick_count >= 3) {
        throw new Error('You are banned from this channel')
      }
      return {
        message: 'Already a member of this channel',
        channelId: channel.id,
      }
    }

    // ❗ BAN CHECK pred vložením do membership
    const banned = await db
      .from('user_channel_mapper')
      .where('channel_id', channel.id)
      .where('user_id', userId)
      .where('kick_count', '>=', 3)
      .first()

    if (banned) {
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

    if (hadInvite) {
      await db
        .from('channel_invites')
        .where('channel_id', channel.id)
        .where('user_id', userId)
        .delete()
    }

    if (hadInvite) {
      await db
        .from('channel_invites')
        .where('channel_id', channel.id)
        .where('user_id', userId)
        .delete()
    }

    // notify only the joining user about successful join
    io.to(`user:${userId}`).emit('system', {
      type: 'channel_joined',
      userId: userId,
      channelId: channel.id,
      name: channel.name,
      private: channel.private,
      isOwner: false,
    })

    // broadcast join event in channel
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
        throw new Error('User is banned from this channel')
      }
      throw new Error('User is already a member of this channel')
    }

    const io = getIo()

    // create pending invite
    try {
      await db.table('channel_invites').insert({
        channel_id: channelId,
        user_id: user.id,
        inviter_id: ownerId,
        created_at: new Date(),
        updated_at: new Date(),
      })
    } catch (err: any) {
      if (err.code === '23505') {
        // duplicate invite
        throw new Error('User is already invited to this channel')
      }
      throw err
    }

    // invite event only for that user
    io.to(`user:${user.id}`).emit('system', {
      type: 'channel_invited',
      channelId: channelId,
      name: channel.name,
      private: channel.private,
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

    // also remove any pending invites
    await db
      .from('channel_invites')
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
      private: channel.private,
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

    // OWNER sa nesmie kicknúť
    if (membership.owner) {
      throw new Error('Cannot kick channel owner')
    }

    let newKickCount = membership.kick_count
    const io = getIo()

    // Private channel → len owner môže kicknúť
    if (channel.private && channel.ownerId !== kickerId) {
      throw new Error('Only owner can kick in private channels')
    }

    // Ak kicker je owner → okamžitý ban
    if (channel.ownerId === kickerId) {
      newKickCount = 3
      console.log('Kicker is owner → set kick_count to 3')
    } else {
      // Public channel → +1 kick_count
      newKickCount += 1
      console.log('Kicker is not owner → increment kick_count by 1')
    }

    // Uložiť kick_count
    await db
      .from('user_channel_mapper')
      .where({ channel_id: channelId, user_id: user.id })
      .update({
        kick_count: newKickCount,
        updated_at: new Date(),
      })

    // Audit log (ignoruje duplicate errors)
    try {
      await db.table('channel_kicks').insert({
        channel_id: channelId,
        kicked_user_id: user.id,
        kicker_user_id: kickerId,
        created_at: new Date(),
      })
    } catch {}

    // Ak kick_count >= 3 → okamžite vyhodiť z membership a socket room
    if (newKickCount >= 3) {
      await db
        .from('user_channel_mapper')
        .where({ channel_id: channelId, user_id: user.id })
        .delete()

      // Vyhodiť zo socket roomu
      io.in(`user:${user.id}`).socketsLeave(`channel:${channelId}`)

      // Notify user → aby klient odstránil channel
      io.to(`user:${user.id}`).emit('system', {
        type: 'channel_kicked',
        channelId,
        name: channel.name,
        reason: 'kick',
        currentKickCount: newKickCount,
      })
    }

    // Broadcast do kanála → všetci vidia, že user bol kicknutý
    io.to(`channel:${channelId}`).emit('system', {
      type: 'kick',
      nickname,
      kickCount: newKickCount,
    })

    return {
      message:
        newKickCount >= 3
          ? `User ${nickname} has been removed from channel (kick count >= 3)`
          : `User ${nickname} has been removed from channel (kick)`,
      currentKickCount: newKickCount,
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

    // notify only the user who left so others don't remove the channel from their lists
    io.to(`user:${userId}`).emit('system', {
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




























