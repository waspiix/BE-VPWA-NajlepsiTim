import User from '#models/user'

export type PresenceStatus = 'online' | 'dnd' | 'offline'

const statusToState: Record<PresenceStatus, number> = {
  online: 1,
  dnd: 2,
  offline: 3,
}

export function stateToStatus(state?: number | null): PresenceStatus {
  if (state === 2) return 'dnd'
  if (state === 3) return 'offline'
  return 'online'
}

export function normalizeStatus(input: any): PresenceStatus | null {
  if (typeof input === 'number') {
    return stateToStatus(input)
  }

  const raw = (input || '').toString().toLowerCase()
  if (['online', 'dnd', 'offline'].includes(raw)) {
    return raw as PresenceStatus
  }

  return null
}

export default class PresenceService {
  /**
   * Persist the requested status to the users table.
   */
  static async setStatus(userId: number, status: PresenceStatus) {
    await User.query().where('id', userId).update({ state: statusToState[status] })
    return status
  }

  /**
   * Returns the persisted status for a user (defaults to online).
   */
  static async getStatus(userId: number): Promise<PresenceStatus> {
    const user = await User.query().where('id', userId).select('state').first()
    return stateToStatus(user?.state)
  }
}
