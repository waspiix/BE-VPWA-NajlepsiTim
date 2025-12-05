import { BaseCommand } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { getIo } from '#start/socket'

export default class CleanInactiveChannels extends BaseCommand {
  public static commandName = 'channels:clean'
  public static description = 'Delete channels with no messages for the given number of days'

  public static options = {
    startApp: true,
  }

  public async run() {
    const days = Number(this.parsed?.args?.days ?? this.parsed?.options?.days ?? 30)
    const threshold = DateTime.utc().minus({ days })

    this.logger.info(`Cleaning channels inactive since ${threshold.toISO()}`)

    // find channels with no messages newer than threshold
    const inactiveChannels = await db
      .from('channels')
      .leftJoin('messages', 'messages.channel_id', 'channels.id')
      .groupBy('channels.id')
      .havingRaw('COALESCE(MAX(messages.created_at), channels.created_at) < ?', [threshold.toSQL() as any])
      .select('channels.id', 'channels.name')

    if (!inactiveChannels.length) {
      this.logger.info('No inactive channels found')
      return
    }

    const ids = inactiveChannels.map((c) => c.id)
    await db.from('channels').whereIn('id', ids).delete()

    const io = getIo()
    inactiveChannels.forEach((c) => {
      io.emit('system', {
        type: 'channel_deleted',
        channelId: c.id,
        channelName: c.name,
        reason: 'inactive_cleanup',
      })
    })

    this.logger.info(`Deleted ${inactiveChannels.length} inactive channels`)
  }
}
