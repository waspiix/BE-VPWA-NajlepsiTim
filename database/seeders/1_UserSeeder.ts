import User from '#models/user'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  public async run() {
    
    await User.createMany([
      {
        name: 'John',
        surname: 'Doe',
        nickName: 'johnd',
        email: 'john@example.com',
        password: 'password123',
        state: 1,
      },
      {
        name: 'Jane',
        surname: 'Smith',
        nickName: 'janes',
        email: 'jane@example.com',
        password: 'password123',
        state: 1,
      },
      {
        name: 'Bob',
        surname: 'Marley',
        nickName: 'bobm',
        email: 'bob@example.com',
        password: 'password123',
        state: 2,
      },
      {
        name: 'Alice',
        surname: 'Wonderland',
        nickName: 'alicew',
        email: 'alice@example.com',
        password: 'password123',
        state: 3,
      },
      {
        name: 'Peter',
        surname: 'Parker',
        nickName: 'spidey',
        email: 'peter@example.com',
        password: 'password123',
        state: 1,
      },
    ])
  }
}
