import env from '#start/env'
import { defineConfig } from '@adonisjs/transmit'

const transmitConfig = {
  cors: {
    enabled: true,
    origin: ['*']
  },
  server: {
    enabled: true,
    path: '/transmit',
  }
}

export default transmitConfig

