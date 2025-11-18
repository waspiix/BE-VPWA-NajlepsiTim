import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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

}
