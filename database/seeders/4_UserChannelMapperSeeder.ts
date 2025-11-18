import UserChannelMapper from '#models/user_channel_mapper'
import { DateTime } from 'luxon'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class UserChannelMapperSeeder extends BaseSeeder {
  public async run () {
    const now = DateTime.now()

    const mappings: Partial<UserChannelMapper>[] = []

    for (let userId = 1; userId <= 5; userId++) {
      for (let channelId = 1; channelId <= 4; channelId++) {
        mappings.push({
          userId,
          channelId,
          owner: userId === 1,
          joinedAt: now,
          ban: false,
        })
      }
    }

    await UserChannelMapper.createMany(mappings)
  }
}
