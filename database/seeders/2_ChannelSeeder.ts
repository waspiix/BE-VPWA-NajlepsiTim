import Channel from '#models/channel'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  public async run () {
    await Channel.createMany([
      {
        name: 'general',
        private: false,
        ownerId: 1,
      },
      {
        name: 'random',
        private: false,
        ownerId: 1,
      },
      {
        name: 'project-discussion',
        private: true,
        ownerId: 1,
      },
      {
        name: 'team-chat',
        private: true,
        ownerId: 1,
      },
    ])
  }
}
