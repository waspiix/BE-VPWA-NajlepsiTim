import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Hash from '@adonisjs/core/services/hash'

export default class UsersController {
  // Registrácia
  public async register({ request, response }: HttpContext) {
    const data = request.only(['name', 'surname', 'nick_name', 'email', 'password'])

    const exists = await User.query().where('email', data.email).first()
    if (exists) {
      return response.status(400).json({ message: 'Email already in use' })
    }

    const user = await User.create(data)
    return response.status(201).json({ user })
  }

  // Login
  public async login({ request, response }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])

    const user = await User.query().where('email', email).first()

    
    if (!user || !(await Hash.verify(user.password, password))) {
      return response.status(401).json({ message: 'Invalid credentials' })
    }

    // vygenerovanie tokenu cez accessTokens API
    const token = await User.accessTokens.create(user)

    return response.json({
      type: 'bearer',
      token: token.value!.release(),
      expiresAt: token.expiresAt,
    })
  }

  // Získanie všetkých používateľov
  public async index({ response }: HttpContext) {
    const users = await User.all()
    return response.json(users)
  }

  // Detail používateľa
  public async show({ params, response }: HttpContext) {
    const user = await User.find(params.id)
    if (!user) return response.status(404).json({ message: 'User not found' })
    return response.json(user)
  }

  // Update
  public async update({ params, request, response }: HttpContext) {
    const user = await User.find(params.id)
    if (!user) return response.status(404).json({ message: 'User not found' })

    const data = request.only(['name', 'surname', 'nick_name', 'state'])
    user.merge(data)
    await user.save()

    return response.json(user)
  }

  // Delete
  public async destroy({ params, response }: HttpContext) {
    const user = await User.find(params.id)
    if (!user) return response.status(404).json({ message: 'User not found' })

    await user.delete()
    return response.json({ message: 'User deleted successfully' })
  }
}
