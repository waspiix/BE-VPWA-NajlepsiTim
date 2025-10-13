import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

import User from './user.js'
import Message from './message.js'
import Channel from './channel.js'

export default class UserMessageMapper extends BaseModel {
  public static table = 'user_message_mapper'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'user_id' })
  declare userId: number

  @column({ columnName: 'message_id' })
  declare messageId: number

  @column({ columnName: 'channel_id' })
  declare channelId: number

  @column()
  declare dm: boolean // false = správa poslaná, true = prijatá

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Message)
  declare message: BelongsTo<typeof Message>

  @belongsTo(() => Channel)
  declare channel: BelongsTo<typeof Channel>
}
