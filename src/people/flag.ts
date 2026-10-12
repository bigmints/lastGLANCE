// People mode is built behind a hidden flag until contacts integration lands
// on Android (see the People spec). While the flag is off nothing People-related
// runs: no sync engines, no UI.
export const PEOPLE_FLAG_KEY = 'lg-people-enabled'

// Household privacy: People normally sync on the shared vault like chores do.
// Turning this off keeps them off the vault, so they travel only through the
// user's own file sync.
export const PEOPLE_VAULT_SYNC_KEY = 'lg-people-vault-sync'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function isPeopleEnabled(): boolean {
  return read(PEOPLE_FLAG_KEY) === 'true'
}

export function isPeopleVaultSyncEnabled(): boolean {
  return read(PEOPLE_VAULT_SYNC_KEY) !== 'false'
}
