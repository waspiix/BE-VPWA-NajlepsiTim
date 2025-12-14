import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'channel_kicks'

  public async up() {
    await this.schema.raw(
      `ALTER TABLE "${this.tableName}" ADD COLUMN IF NOT EXISTS "owner" boolean NOT NULL DEFAULT false`
    )
  }

  public async down() {
    await this.schema.raw(`ALTER TABLE "${this.tableName}" DROP COLUMN IF EXISTS "owner"`)
  }
}
