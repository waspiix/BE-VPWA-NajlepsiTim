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

    // Nájdi používateľa podľa nickname
    const user = await db.from('users').where('nick_name', nickname).first()
    if (!user) throw new Error('User not found')

    // Skontroluj existujúce členstvo
    const membership = await db
      .from('user_channel_mapper')
      .where('user_id', user.id)
      .where('channel_id', channelId)
      .first()

    if (membership) {
      if (membership.kick_count >= 3) {
        // Resetuj ban a "znovu pridaj"
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

        // Zmaž všetky predchádzajúce kicky pre tohto používateľa v tomto kanáli
        await db
          .from('channel_kicks')
          .where('channel_id', channelId)
          .where('kicked_user_id', user.id)
          .delete()
      } else {
        // Už je člen, nič netreba robiť
        throw new Error('User is already a member of this channel')
      }
    } else {
      // Pridaj nového člena
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

    // Emituj notifikáciu cez socket
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
      // Private: iba owner môže kicknúť kohokoľvek
      if (channel.ownerId !== kickerId) {
        throw new Error('Only owner can kick in private channels')
      }

      await db
        .from('user_channel_mapper')
        .where({ channel_id: channelId, user_id: user.id })
        .update({ kick_count: 3 })

    } else {
      // Public: kicknúť môže ktokoľvek, ale **nie ownera**
      if (membership.owner) {
        throw new Error('Cannot kick the owner in a public channel')
      }

      // Zvýšiť kick_count o 1
      await db
        .from('user_channel_mapper')
        .where({ channel_id: channelId, user_id: user.id })
        .increment('kick_count', 1)
    }

    // Záznam do channel_kicks tabuľky – len ak ešte kicker pre tohto usera v tomto kanáli nekickol
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
      // Ak duplicate key error, vyhodíme špecifickú chybu
      if (err.code === '23505') { // PostgreSQL unique violation
        throw new Error(`You have already kicked user ${nickname} in this channel`)
      }
      throw err
    }

    getIo().to(`channel:${channelId}`).emit('system', {
      type: 'kick',
      nickname,
    })

    return {
      message: `User ${nickname} kicked successfully`,
      currentKickCount: membership.kick_count + (channel.private ? 3 : 1),
    }
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
    const channel = await Channel.findOrFail(channelId)

    if (channel.ownerId !== userId) {
      throw new Exception('You are not the owner, cannot delete the channel', {status: 403})
    }

    // Ak je owner → zmaže celý kanál
    if (channel.ownerId === userId) {
      await channel.delete()
      return { message: 'Channel deleted by owner' }
    }
    // Ak user nie je owner → iba odíde z kanála
    await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .delete()

    return { message: 'You left the channel' }
  
  }

  static async cancel(channelId: number, userId: number) {
    // Najdi channel
    const channel = await Channel.findOrFail(channelId)

    // Ak je owner → zmaž celý channel
    if (channel.ownerId === userId) {
      await channel.delete()

      return { message: 'Channel has been deleted because the owner canceled membership' }
    }

    // Ak nie je owner → odstráň iba jeho členstvo
    await db
      .from('user_channel_mapper')
      .where({ user_id: userId, channel_id: channelId })
      .delete()

    return { message: 'You canceled your membership in the channel' }
  }

}
