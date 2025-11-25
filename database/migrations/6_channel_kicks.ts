import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'channel_kicks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('channel_id').unsigned().notNullable()
      table.integer('kicked_user_id').unsigned().notNullable()
      table.integer('kicker_user_id').unsigned().notNullable()

      table.timestamp('created_at', { useTz: true })

      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')
      table.foreign('kicked_user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('kicker_user_id').references('id').inTable('users').onDelete('CASCADE')

      // Jeden user môže dať kick len raz na jedného usera v kanáli
      table.unique(['channel_id', 'kicked_user_id', 'kicker_user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
