import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Hash from '@adonisjs/core/services/hash'
import { registerUserValidator } from '#validators/register_user_validator'

export default class UsersController {
  // Registracia
  public async register({ request, response }: HttpContext) {
    try {
      // Validácia vstupu cez Vine validator
      const payload = await registerUserValidator.validate(request.body())

      // Kontrola unikatnosti emailu
      const emailExists = await User.findBy('email', payload.email)
      if (emailExists) {
        return response.status(400).json({ message: 'Email already in use' })
      }

      // Kontrola unikatnosti nickName
      const nickExists = await User.findBy('nickName', payload.nickName)
      if (nickExists) {
        return response.status(400).json({ message: 'Nickname already in use' })
      }

      // Zahashovanie hesla
      const hashedPassword = await Hash.make(payload.password)

      // Vytvorenie usera
      const user = await User.create({
        name: payload.firstName,
        surname: payload.lastName,
        nickName: payload.nickName,
        email: payload.email,
        password: hashedPassword,
      })

      // Automaticke prihlasenie po registracii
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
      // Chyby z Vine validatora – zoberieme prvú hlášku
      if (error && Array.isArray(error.messages) && error.messages.length > 0) {
        return response.status(400).json({ message: error.messages[0].message })
      }

      console.error('Register error:', error)
      return response.status(500).json({ message: 'Registration failed' })
    }
  }

  // Login
  public async login({ request, response }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])

    const user = await User.query().where('email', email).first()

    if (!user || !(await Hash.verify(user.password, password))) {
      return response.status(401).json({ message: 'Invalid credentials' })
    }

    // Vygenerovanie tokenu
    const token = await User.accessTokens.create(user)

    return response.json({
      type: 'bearer',
      token: token.value!.release(),
      expiresAt: token.expiresAt,
    })
  }

  // Logout
  public async logout({ auth, response }: HttpContext) {
    const user = auth.user!
    const token = user.currentAccessToken!

    await User.accessTokens.delete(user, token.identifier)

    return response.json({ message: 'Logged out' })
  }

  // Zoznam vsetkych userov
  public async index({ response }: HttpContext) {
    const users = await User.all()
    return response.json(users)
  }

  // Detail usera
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

  // Update usera
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

  // Update settings usera
  public async updateSettings({ auth, request, response }: HttpContext) {
    const user = await auth.getUserOrFail()
    const { state, notificationMode } = request.only(['state', 'notificationMode'])

    if (state !== undefined) {
      // Validacia: state musi byt 1, 2, alebo 3
      if (![1, 2, 3].includes(state)) {
        return response.status(400).json({
          message: 'Invalid state. Must be 1 (online), 2 (DND), or 3 (offline)',
        })
      }
      user.state = state
    }

    if (notificationMode !== undefined) {
      // Validacia: notificationMode musi byt 'all' alebo 'mentions_only'
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

  // Delete usera
  public async destroy({ params, response }: HttpContext) {
    const user = await User.find(params.id)
    if (!user) {
      return response.status(404).json({ message: 'User not found' })
    }

    await user.delete()
    return response.json({ message: 'User deleted successfully' })
  }
}
