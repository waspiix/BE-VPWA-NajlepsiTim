import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Hash from '@adonisjs/core/services/hash'
import { registerUserValidator } from '#validators/register_user_validator'
import PresenceService, { normalizeStatus, stateToStatus } from '#services/presence_service'
import { getIo } from '#start/socket'

export default class UsersController {
  // register user
  public async register({ request, response }: HttpContext) {
    try {
      // validate input
      const payload = await registerUserValidator.validate(request.body())

      // check unique email
      const emailExists = await User.findBy('email', payload.email)
      if (emailExists) {
        return response.status(400).json({ message: 'Email already in use' })
      }

      // check unique nickname
      const nickExists = await User.findBy('nickName', payload.nickName)
      if (nickExists) {
        return response.status(400).json({ message: 'Nickname already in use' })
      }

      // hash password
      const hashedPassword = await Hash.make(payload.password)

      // create user
      const user = await User.create({
        name: payload.firstName,
        surname: payload.lastName,
        nickName: payload.nickName,
        email: payload.email,
        password: hashedPassword,
      })

      // issue token after register
      const token = await User.accessTokens.create(user)

      return response.status(201).json({
        user: {
          id: user.id,
          firstName: user.name,
          lastName: user.surname,
          nickName: user.nickName,
          email: user.email,
          state: user.state,
          notificationMode: user.notificationMode,
        },
        token: token.value!.release(),
        type: 'bearer',
        expiresAt: token.expiresAt,
      })
    } catch (error: any) {
      // return first validator error if present
      if (error && Array.isArray(error.messages) && error.messages.length > 0) {
        return response.status(400).json({ message: error.messages[0].message })
      }

      console.error('Register error:', error)
      return response.status(500).json({ message: 'Registration failed' })
    }
  }

  // login
  public async login({ request, response }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])

    const user = await User.query().where('email', email).first()

    if (!user || !(await Hash.verify(user.password, password))) {
      return response.status(401).json({ message: 'Invalid credentials' })
    }

    // create access token
    const token = await User.accessTokens.create(user)

    return response.json({
      type: 'bearer',
      token: token.value!.release(),
      expiresAt: token.expiresAt,
    })
  }

  // logout
  public async logout({ auth, response }: HttpContext) {
    const user = auth.user!
    const token = user.currentAccessToken!

    await PresenceService.setStatus(user.id, 'offline')
    const io = getIo()
    io.emit('user_status_changed', { userId: user.id, status: 'offline' })
    await io.in(`user:${user.id}`).disconnectSockets(true)

    await User.accessTokens.delete(user, token.identifier)

    return response.json({ message: 'Logged out' })
  }

  // list users
  public async index({ response }: HttpContext) {
    const users = await User.all()
    return response.json(users)
  }

  // user detail
  public async show({ params, response }: HttpContext) {
    const user = await User.find(params.id)
    if (!user) {
      return response.status(404).json({ message: 'User not found' })
    }

    return response.json({
      id: user.id,
      firstName: user.name,
      lastName: user.surname,
      nickName: user.nickName,
      email: user.email,
      state: user.state,
      notificationMode: user.notificationMode,
    })
  }

  // update user
  public async update({ params, request, response }: HttpContext) {
    const user = await User.find(params.id)
    if (!user) {
      return response.status(404).json({ message: 'User not found' })
    }

    const data = request.only(['firstName', 'lastName', 'nickName', 'state'])

    if (data.firstName) user.name = data.firstName
    if (data.lastName) user.surname = data.lastName
    if (data.nickName) user.nickName = data.nickName
    if (data.state) user.state = data.state

    await user.save()

    return response.json({
      id: user.id,
      firstName: user.name,
      lastName: user.surname,
      nickName: user.nickName,
      email: user.email,
      state: user.state,
      notificationMode: user.notificationMode,
    })
  }

  // update own settings
  public async updateSettings({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const { state, notificationMode } = request.only(['state', 'notificationMode'])

    if (state !== undefined) {
      // validate state value
      if (![1, 2, 3].includes(state)) {
        return response.status(400).json({
          message: 'Invalid state. Must be 1 (online), 2 (DND), or 3 (offline)',
        })
      }
      const normalized = stateToStatus(state)
      await PresenceService.setStatus(user.id, normalized)
      const io = getIo()
      io.emit('user_status_changed', { userId: user.id, status: normalized })
      if (normalized === 'offline') {
        await io.in(`user:${user.id}`).disconnectSockets(true)
      }
      user.state = state
    }

    if (notificationMode !== undefined) {
      // validate notification mode
      if (!['all', 'mentions_only'].includes(notificationMode)) {
        return response.status(400).json({
          message: 'Invalid notificationMode. Must be "all" or "mentions_only"',
        })
      }
      user.notificationMode = notificationMode
    }

    await user.save()

    return response.ok({
      id: user.id,
      firstName: user.name,
      lastName: user.surname,
      nickName: user.nickName,
      email: user.email,
      state: user.state,
      notificationMode: user.notificationMode,
    })
  }

  public async updateStatus({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const status = normalizeStatus(request.input('status'))

    if (!status) {
      return response.badRequest({
        message: 'Invalid status. Must be online, dnd or offline',
      })
    }

    await PresenceService.setStatus(user.id, status)
    const io = getIo()
    io.emit('user_status_changed', { userId: user.id, status })
    if (status === 'offline') {
      await io.in(`user:${user.id}`).disconnectSockets(true)
    }

    return response.ok({
      status,
      state: status === 'online' ? 1 : status === 'dnd' ? 2 : 3,
    })
  }

  public async updateNotificationPrefs({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const { notifyMentionsOnly } = request.only(['notifyMentionsOnly'])

    const mode = notifyMentionsOnly ? 'mentions_only' : 'all'
    user.notificationMode = mode
    await user.save()

    return response.ok({
      notificationMode: mode,
      userId: user.id,
    })
  }

  // delete user
  public async destroy({ params, response }: HttpContext) {
    const user = await User.find(params.id)
    if (!user) {
      return response.status(404).json({ message: 'User not found' })
    }

    await user.delete()
    return response.json({ message: 'User deleted successfully' })
  }
}
