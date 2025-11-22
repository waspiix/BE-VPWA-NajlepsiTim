import type { HttpContext } from '@adonisjs/core/http'
import Channel from '#models/channel'
import UserChannelMapper from '#models/user_channel_mapper'
import { DateTime } from 'luxon'

export default class ChannelsController {

  public async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized()

    const { channelName, channelType } = request.only(['channelName', 'channelType'])

    try {
      const channel = await Channel.create({
        channel_name: channelName,
        private: channelType === 'private', // boolean
      })

      await UserChannelMapper.create({
        userId: user.id,
        channelId: channel.id,
        owner: true,
        ban: false,
        joinedAt: DateTime.local(), // luxon DateTime
      })

      return response.created({ channel })
    } catch (error) {
      console.error('Failed to create channel:', error)
      return response.internalServerError({ message: 'Failed to create channel', error: error.message })
    }
  }
 
  // Získanie kanálov používateľa v ktorych sa nachadza
  public async myChannels({ auth }: HttpContext) {
    const user = auth.user!
    
    const channels = await user.related('channels').query()

    return channels.map((ch) => ({
      id: ch.id,
      name: ch.channel_name,
      icon: 'tag',
      isPrivate: ch.private,
      isAdmin: !!ch.$extras.pivot_owner,
    }))
  }

  public async leave({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (!user) return response.unauthorized()

    // ID kanála očakávame v tele requestu
    const { channelId } = request.only(['channelId'])

    try {
      const deleted = await UserChannelMapper.query()
        .where('user_id', user.id)
        .andWhere('channel_id', channelId)
        .delete()

      if (!deleted) {
        return response.notFound({ message: 'You are not in this channel' })
      }

      return response.ok({ message: 'Left channel successfully' })
    } catch (err) {
      console.error(err)
      return response.internalServerError({ message: 'Failed to leave channel', error: err.message })
    }
  }

  public async delete({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (!user) return response.unauthorized()

    const { channelId } = request.only(['channelId'])

    // Zisti, či je user owner cez pivot tabuľku
    const pivot = await UserChannelMapper.query()
      .where('user_id', user.id)
      .andWhere('channel_id', channelId)
      .first()

    if (!pivot?.owner) {
      return response.forbidden({ message: 'Not authorized' })
    }

    try {
      // Vymaž pivot záznamy
      await UserChannelMapper.query().where('channel_id', channelId).delete()
      // Vymaž samotný kanál
      const channel = await Channel.find(channelId)
      if (channel) {
        await channel.delete()
      }

      return response.ok({ message: 'Channel deleted successfully' })
    } catch (err) {
      console.error(err)
      return response.internalServerError({ message: 'Failed to delete channel', error: err.message })
    }
  }





}
