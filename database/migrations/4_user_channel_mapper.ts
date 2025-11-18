import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_channel_mapper'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned().notNullable()
      table.integer('channel_id').unsigned().notNullable()
      table.boolean('owner').defaultTo(false).notNullable()
      table.boolean('ban').defaultTo(false).notNullable()

      table.timestamp('joined_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })

      // FKs
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')

      table.unique(['user_id', 'channel_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
