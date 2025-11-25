import env from '#start/env'
import { defineConfig } from '@adonisjs/transmit'

const transmitConfig = defineConfig({
  pingInterval: false,
  transport: null,
})

export default transmitConfig
