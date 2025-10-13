import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_message_mapper'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.integer('message_id').unsigned().notNullable()
      table.integer('channel_id').unsigned().notNullable()

      // Ak je DM = true → správa je prijatá niekým (priama správa)
      // Ak je DM = false → správa bola niekým poslaná (v kanáli)
      table.boolean('dm').defaultTo(false).notNullable()

      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true })

      // Foreign keys
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('message_id').references('id').inTable('messages').onDelete('CASCADE')
      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')

      // Unique combination (aby jedna správa nemala duplicitné mapovanie pre rovnakého usera a kanál)
      table.unique(['user_id', 'message_id', 'channel_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
