/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import UsersController from '#controllers/users_controller'
import ChannelsController from '#controllers/channels_controller'
import MessagesController from '#controllers/messages_controller'
import { middleware } from '#start/kernel'

// AUTH ROUTES - PUBLIC (bez auth middleware)
router
  .group(() => {
    router.post('/register', [UsersController, 'register']) // Registracia
    router.post('/login', [UsersController, 'login']) // Prihlasenie
  })
  .prefix('/api/auth')

// AUTH ROUTES - PROTECTED (s auth middleware)
router
  .group(() => {
    router.post('/logout', [UsersController, 'logout']) // Odhlasenie
    router.get('/me', async ({ auth }) => {
      return auth.user
    }) // Info o prihlasenom userovi
  })
  .prefix('/api/auth')
  .middleware([middleware.auth()])

// USER ROUTES
router
  .group(() => {
    router.get('/users', [UsersController, 'index']) // Zoznam userov
    router.put('/users/me/settings', [UsersController, 'updateSettings']) // Update settings usera (MUSI BYT PRED :id)
    router.get('/users/:id', [UsersController, 'show']) // Detail usera
    router.put('/users/:id', [UsersController, 'update']) // Update usera
    router.delete('/users/:id', [UsersController, 'destroy']) // Zmazat usera
  })
  .prefix('/api')
  .middleware([middleware.auth()])

// CHANNEL ROUTES
router
  .group(() => {
    router.get('/my-channels', [ChannelsController, 'myChannels']) // Moje kanaly
    router.get('/channels/public', [ChannelsController, 'public']) // Verejne kanaly
    router.get('/channels/:id', [ChannelsController, 'show']) // Detail kanala
    router.post('/join', [ChannelsController, 'store']) // Vytvorit/joinnut kanal
    router.post('/quit', [ChannelsController, 'delete']) // Zrusit kanal (owner)
    router.post('/leave', [ChannelsController, 'leave']) // Opustit kanal
  })
  .prefix('/api')
  .middleware([middleware.auth()])

// MESSAGE ROUTES (len GET pre initial load, POST cez WebSocket)
router
  .group(() => {
    router.get('/channels/:channelId/messages', [MessagesController, 'index']) // Historia sprav
  })
  .prefix('/api')
  .middleware([middleware.auth()])

// WEBSOCKET ROUTES
router
  .group(() => {
    router.post('/ws/subscribe', '#controllers/websocket_controller.subscribe') // Subscribe to channel
    router.post('/ws/message', '#controllers/websocket_controller.sendMessage') // Send message
    router.post('/ws/typing', '#controllers/websocket_controller.typing') // Typing indicator
  })
  .prefix('/api')
  .middleware([middleware.auth()])
