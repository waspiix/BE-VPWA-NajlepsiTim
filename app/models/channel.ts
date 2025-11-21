import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import User from '#models/user'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'

export default class Channel extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column( {columnName: 'channel_name'} )
  declare channel_name: string

  @column()
  declare private: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @manyToMany(() => User, {
  pivotTable: 'user_channel_mapper',
  pivotColumns: ['owner', 'ban', 'joined_at'],
  })
  declare users: ManyToMany<typeof User>
}
