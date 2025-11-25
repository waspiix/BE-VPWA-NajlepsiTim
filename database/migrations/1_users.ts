import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('name').notNullable()
      table.string('surname').notNullable()
      table.string('nick_name').unique().notNullable()
      table.string('email').unique().notNullable()
      table.string('password').notNullable()
      table.integer('state').defaultTo(1).notNullable() // 1-active , 2-DND , 3-offline
      table.string('notification_mode').defaultTo('all').notNullable()

      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
