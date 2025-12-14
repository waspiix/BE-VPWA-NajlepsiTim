import type { HttpContext } from '@adonisjs/core/http'
import Channel from '#models/channel'
import db from '@adonisjs/lucid/services/db'

export default class ChannelsController {
  // create or join a channel
  public async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { name, private: isPrivate } = request.only(['name', 'private'])

    // basic validation
    if (!name) {
      return response.status(400).json({ message: 'Channel name is required' })
    }

    // check if channel already exists
    let channel = await Channel.findBy('name', name)

    // create channel if missing
    if (!channel) {
      // private channel needs explicit private: true
      if (isPrivate === true) {
        channel = await Channel.create({
          name: name,
          private: true,
          ownerId: user.id,
        })
      } else {
        // public channel
        channel = await Channel.create({
          name: name,
          private: false,
          ownerId: user.id,
        })
      }

      // add owner membership
      await db.table('user_channel_mapper').insert({
        user_id: user.id,
        channel_id: channel.id,
        owner: true,
        kick_count: 0,
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })

      return response.status(201).json({
        id: channel.id,
        name: channel.name,
        private: channel.private,
        ownerId: channel.ownerId,
        isOwner: true,
        message: 'Channel created',
      })
    }

    // channel exists
    // private requires invite
    let hadInvite = false
    if (channel.private) {
      const invite = await db
        .from('channel_invites')
        .where('channel_id', channel.id)
        .where('user_id', user.id)
        .first()

      if (!invite) {
        return response.status(403).json({
          message: 'Cannot join private channel without invite',
        })
      }
      hadInvite = true
    }

    // check membership
    const existing = await db
      .from('user_channel_mapper')
      .where('channel_id', channel.id)
      .where('user_id', user.id)
      .first()

    if (existing) {
      return response.status(409).json({
        message: 'Already a member of this channel',
      })
    }

    // check ban history
    const previousMembership = await db
      .from('user_channel_mapper')
      .where('channel_id', channel.id)
      .where('user_id', user.id)
      .whereNotNull('kick_count')
      .first()

    if (previousMembership && previousMembership.kick_count >= 3) {
      return response.status(403).json({
        message: 'You are banned from this channel',
      })
    }

    // add as member
    await db.table('user_channel_mapper').insert({
      user_id: user.id,
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
        .where('user_id', user.id)
        .delete()
    }

    return response.status(200).json({
      message: 'Joined channel',
      channelId: channel.id,
    })
  }

  // list my channels
  public async myChannels({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const channels = await db
      .from('channels')
      .join('user_channel_mapper', 'channels.id', 'user_channel_mapper.channel_id')
      .where('user_channel_mapper.user_id', user.id)
      .where('user_channel_mapper.kick_count', '<', 3) // filter banned members
      .select(
        'channels.id',
        'channels.name',
        'channels.private',
        'channels.owner_id as ownerId',
        'user_channel_mapper.owner as isOwner',
        'user_channel_mapper.joined_at as joinedAt'
      )
      .orderBy('user_channel_mapper.joined_at', 'desc')

    return response.ok(channels)
  }

  public async listMembers({ auth, params, response }: HttpContext) {
    const channelId = params.id
    const user = await auth.getUserOrFail()

    const channel = await Channel.find(channelId)
    if (!channel) {
      return response.status(404).json({ message: 'Channel not found' })
    }

    const membership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', user.id)
      .first()

    if (!membership) {
      return response.status(403).json({ message: 'You are not a member of this channel' })
    }

    const rows = await db
      .from('user_channel_mapper')
      .join('users', 'users.id', 'user_channel_mapper.user_id')
      .where('user_channel_mapper.channel_id', channelId)
      .select(
        'users.id',
        'users.nick_name as nickName',
        'users.state',
        'user_channel_mapper.owner as isOwner',
        'user_channel_mapper.joined_at as joinedAt'
      )
      .orderBy('users.nick_name', 'asc')

    const members = rows.map((row: any) => ({
      id: row.id,
      nickName: row.nickName,
      isOwner: !!row.isOwner,
      joinedAt: row.joinedAt,
      status: row.state === 2 ? 'dnd' : row.state === 3 ? 'offline' : 'online',
    }))

    return response.ok({ channelId: Number(channelId), members })
  }

  // list public channels
  public async public({ response }: HttpContext) {
    const channels = await Channel.query()
      .where('private', false)
      .orderBy('created_at', 'desc')
      .select('id', 'name', 'created_at as createdAt')

    return response.ok(channels)
  }

  // channel detail
  public async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const channelId = params.id

    // check membership
    const membership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', user.id)
      .first()

    if (!membership) {
      return response.status(403).json({ message: 'You are not a member of this channel' })
    }

    const channel = await Channel.findOrFail(channelId)

    return response.ok({
      id: channel.id,
      name: channel.name,
      private: channel.private,
      ownerId: channel.ownerId,
      isOwner: membership.owner,
    })
  }

  // leave channel
  public async leave({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { channelId } = request.only(['channelId'])

    const membership = await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', user.id)
      .first()

    if (!membership) {
      return response.status(404).json({ message: 'You are not a member of this channel' })
    }

    // owner leaving deletes channel
    if (membership.owner) {
      await Channel.query().where('id', channelId).delete()
      return response.ok({ message: 'Channel deleted (you were owner)' })
    }

    // regular member leaves
    await db
      .from('user_channel_mapper')
      .where('channel_id', channelId)
      .where('user_id', user.id)
      .delete()

    return response.ok({ message: 'Left channel successfully' })
  }

  // delete channel as owner
  public async delete({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { channelId } = request.only(['channelId'])

    const channel = await Channel.findOrFail(channelId)

    if (channel.ownerId !== user.id) {
      return response.status(403).json({ message: 'Only owner can delete channel' })
    }

    await channel.delete()

    return response.ok({ message: 'Channel deleted successfully' })
  }
}
