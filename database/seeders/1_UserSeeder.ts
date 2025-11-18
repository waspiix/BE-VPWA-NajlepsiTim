import User from '#models/user'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Hash from '@adonisjs/core/services/hash'

export default class extends BaseSeeder {
  public async run() {
    await User.createMany([
      {
        name: 'John',
        surname: 'Doe',
        nick_name: 'johnd',
        email: 'john@example.com',
        password: await Hash.make('password123'),
        state: 1,
      },
      {
        name: 'Sarah',
        surname: 'Connor',
        nick_name: 'sconnor',
        email: 'sarah@example.com',
        password: await Hash.make('password123'),
        state: 2,
      },
      {
        name: 'Mike',
        surname: 'Smith',
        nick_name: 'msmith',
        email: 'mike@example.com',
        password: await Hash.make('password123'),
        state: 1,
      },
      {
        name: 'Anna',
        surname: 'Brown',
        nick_name: 'abrown',
        email: 'anna@example.com',
        password: await Hash.make('password123'),
        state: 3,
      },
      {
        name: 'Peter',
        surname: 'Parker',
        nick_name: 'spidey',
        email: 'peter@example.com',
        password: await Hash.make('password123'),
        state: 1,
      },
    ])
  }
}
