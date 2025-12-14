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
    if (!name) throw new Error('Channel name is required')

    const user = await db.from('users').where('id', userId).first()
    if (!user) throw new Error('User not found')

    const io = getIo()

    let channel = await Channel.findBy('name', name)

    // 1️⃣ CREATE CHANNEL
    if (!channel) {
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

      io.to(`user:${userId}`).emit('system', {
        type: 'channel_created',
        channelId: channel.id,
        name: channel.name,
        private: channel.private,
        ownerNickName: user.nick_name,
        ownerId: userId,
      })

      return { message: 'Channel created', channelId: channel.id }
    }

    // 2️⃣ PRIVATE → INVITE CHECK
    if (channel.private) {
      const invite = await db
        .from('channel_invites')
        .where({ channel_id: channel.id, user_id: userId })
        .first()

      if (!invite) {
        throw new Error('Cannot join private channel without invite')
      }
    }

    // 3️⃣ BAN CHECK (JEDINÁ PRAVDA)
    const kicks = await db
      .from('channel_kicks')
      .where({
        channel_id: channel.id,
        kicked_user_id: userId,
      })
      .select('owner')

    let kickCount = 0
    let bannedByOwner = false

    for (const k of kicks) {
      if (k.owner) {
        bannedByOwner = true
        break
      }
      kickCount += 1
    }

    if (bannedByOwner || kickCount >= 3) {
      throw new Error('You are permanently banned from this channel')
    }

    // 4️⃣ already member?
    const existing = await db
      .from('user_channel_mapper')
      .where({ channel_id: channel.id, user_id: userId })
      .first()

    if (existing) {
      return {
        message: 'Already a member',
        channelId: channel.id,
      }
    }

    // 5️⃣ JOIN
    await db.table('user_channel_mapper').insert({
      user_id: userId,
      channel_id: channel.id,
      owner: false,
      kick_count: 0,
      joined_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })

    io.to(`user:${userId}`).emit('system', {
      type: 'channel_joined',
      userId,
      channelId: channel.id,
      name: channel.name,
      private: channel.private,
      isOwner: false,
    })

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


  static async invite(channelId: number, inviterId: number, nickname: string) {
    const channel = await Channel.findOrFail(channelId)

    // load inviter
    const inviter = await db.from('users').where('id', inviterId).first()
    if (!inviter) throw new Error('Inviter not found')

    // load target user
    const user = await db.from('users').where('nick_name', nickname).first()
    if (!user) throw new Error('User not found')

    const io = getIo()

    // check membership
    const membership = await db
      .from('user_channel_mapper')
      .where('user_id', user.id)
      .where('channel_id', channelId)
      .first()

    // banned users can be reinvited only by owner
    if (membership?.kick_count >= 3 && inviterId !== channel.ownerId) {
      throw new Error('Only owner can re-invite a banned user')
    }

    // user already member and not banned
    if (membership && membership.kick_count < 3) {
      throw new Error('User is already a member of this channel')
    }

    // insert invite
    try {
      await db.table('channel_invites').insert({
        channel_id: channelId,
        user_id: user.id,
        inviter_id: inviterId,
        created_at: new Date(),
        updated_at: new Date(),
      })
    } catch (err: any) {
      if (err.code === '23505') throw new Error('User is already invited')
      throw err
    }

    // emit invite to the user
    io.to(`user:${user.id}`).emit('system', {
      type: 'channel_invited',
      channelId: channelId,
      name: channel.name,
      private: channel.private,
      inviterId,
      inviterNickName: inviter?.nick_name,
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

    // owner sa kicknúť nesmie
    if (membership.owner) {
      throw new Error('Cannot kick channel owner')
    }

    // private → len owner
    if (channel.private && channel.ownerId !== kickerId) {
      throw new Error('Only owner can kick in private channels')
    }

    const kickedByOwner = channel.ownerId === kickerId
    const io = getIo()

    // 1️⃣ audit log
    await db.table('channel_kicks').insert({
      channel_id: channelId,
      kicked_user_id: user.id,
      kicker_user_id: kickerId,
      owner: kickedByOwner, // ⬅️ DÔLEŽITÉ
      created_at: new Date(),
    })

    // 2️⃣ odstrániť membership VŽDY
    await db
      .from('user_channel_mapper')
      .where({ channel_id: channelId, user_id: user.id })
      .delete()

    // 3️⃣ vyhodiť zo socket roomu
    io.in(`user:${user.id}`).socketsLeave(`channel:${channelId}`)

    // 4️⃣ notify user → FE odstráni channel zo zoznamu
    io.to(`user:${user.id}`).emit('system', {
      type: 'channel_kicked',
      channelId,
      name: channel.name,
      byOwner: kickedByOwner,
    })

    // 5️⃣ broadcast do kanála
    io.to(`channel:${channelId}`).emit('system', {
      type: 'kick',
      nickname,
      byOwner: kickedByOwner,
    })

    return {
      message: kickedByOwner
        ? `User ${nickname} was banned by owner`
        : `User ${nickname} was kicked`,
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




























