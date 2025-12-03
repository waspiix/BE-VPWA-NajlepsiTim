import vine from '@vinejs/vine'

export const registerUserValidator = vine.compile(
  vine.object({
    firstName: vine.string().trim().minLength(1).maxLength(50),
    lastName: vine.string().trim().minLength(1).maxLength(50),
    nickName: vine.string().trim().minLength(3).maxLength(30),
    email: vine.string().trim().email(),
    password: vine.string().minLength(6),
  })
)
