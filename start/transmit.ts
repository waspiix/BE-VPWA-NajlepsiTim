import transmit from '@adonisjs/transmit/services/main'

/**
 * Setup transmit listeners here
 */
transmit.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
})
