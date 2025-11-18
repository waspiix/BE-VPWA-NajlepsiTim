import Channel from '#models/channel'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder{
    public async run () {
        await Channel.createMany([
            {
                channel_name: 'general',
                private: false,
            },
            {
                channel_name: 'random',
                private: false,
            },
            {
                channel_name: 'project-discussion',
                private: true,
            },
            {
                channel_name: 'team-chat',
                private: true,
            },
        ])
    }
}