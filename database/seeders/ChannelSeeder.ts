import Channel from '#models/channel'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder{
    public async run () {
        await Channel.createMany([
            {
                channelName: 'general',
                private: false,
            },
            {
                channelName: 'random',
                private: false,
            },
            {
                channelName: 'project-discussion',
                private: true,
            },
            {
                channelName: 'team-chat',
                private: true,
            },
        ])
    }
}