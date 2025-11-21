import type { HttpContext } from '@adonisjs/core/http'

export default class ChannelsController {

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
}
