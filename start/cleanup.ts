import { DateTime } from 'luxon'
import env from '#start/env'
import app from '@adonisjs/core/services/app'

const minutesRaw = env.get('CLEAN_INACTIVE_CHANNEL_MINUTES') ?? 43200 // default 30 days
const minutes = Number(minutesRaw)

if (!Number.isFinite(minutes) || minutes <= 0) {
  console.info('[cleanup] inactive channel cleanup disabled (CLEAN_INACTIVE_CHANNEL_MINUTES unset or <= 0)')
} else if (app.getEnvironment() !== 'web') {
  console.info(`[cleanup] skipping inactive channel cleanup (environment=${app.getEnvironment()})`)
} else {
  app.ready(async () => {
    const db = (await import('@adonisjs/lucid/services/db')).default
    const { getIo } = await import('#start/socket')

    const intervalMs = minutes * 60 * 1000
    let running = false
    const log = (msg: string) => console.info(`[cleanup] ${msg}`)

    const cleanInactiveChannels = async () => {
      if (running) return
      running = true
      try {
        const threshold = DateTime.utc().minus({ minutes })
        log(`run started, threshold=${threshold.toISO()}`)
        const inactiveChannels = await db
          .from('channels')
          .leftJoin('messages', 'messages.channel_id', 'channels.id')
          .groupBy('channels.id')
          .havingRaw('COALESCE(MAX(messages.created_at), channels.created_at) < ?', [threshold.toSQL() as any])
          .select('channels.id', 'channels.name')

        if (!inactiveChannels.length) {
          log('no inactive channels found')
          return
        }

        const ids = inactiveChannels.map((c) => c.id)
        await db.from('channels').whereIn('id', ids).delete() // cascades remove mapper, kicks, invites, messages

        const io = getIo()
        inactiveChannels.forEach((c) => {
          io.emit('system', {
            type: 'channel_deleted',
            channelId: c.id,
            channelName: c.name,
            reason: 'inactive_cleanup',
          })
        })

        log(`deleted ${inactiveChannels.length} inactive channels older than ${minutes} minutes`)
      } catch (err) {
        console.error('[cleanup] failed to clean inactive channels', err)
      } finally {
        running = false
      }
    }

    // initial run after short delay to let app boot
    const initialDelayMs = 30_000
    log(`scheduled inactive channel cleanup every ${minutes} minutes (initial run in ${initialDelayMs / 1000}s)`)
    setTimeout(() => {
      log('initial run trigger')
      void cleanInactiveChannels()
    }, initialDelayMs)
    setInterval(() => {
      log('interval run trigger')
      void cleanInactiveChannels()
    }, intervalMs)
  })
}
