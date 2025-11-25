import vine from '@vinejs/vine'

export const sendMessageValidator = vine.compile(
  vine.object({
    content: vine.string().trim().minLength(1).maxLength(2000)
  })
)
