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
import { middleware } from '#start/kernel'
import ChannelsController from '#controllers/channels_controller'


router.post('/register', [UsersController, 'register'])
router.post('/login', [UsersController, 'login'])
router.post('/logout', [UsersController, 'logout']).middleware([middleware.auth()])

/**
 * User management routes (protected by auth middleware)
 */
router
  .group(() => {
    router.get('/users', [UsersController, 'index'])
    router.get('/users/:id', [UsersController, 'show'])
    router.put('/users/:id', [UsersController, 'update'])
    router.delete('/users/:id', [UsersController, 'destroy'])
  })
  .middleware([middleware.auth()])

router.get('/auth/me', async ({ auth }) => {
  return auth.user
}).middleware([middleware.auth()])

router.get('/my-channels', [ChannelsController, 'myChannels']).middleware([middleware.auth()])




