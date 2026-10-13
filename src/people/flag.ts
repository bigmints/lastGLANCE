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

export function setPeopleEnabled(on: boolean): void {
  try { localStorage.setItem(PEOPLE_FLAG_KEY, on ? 'true' : 'false') } catch { /* storage blocked */ }
}

// The hidden switch: tapping the version in Settings > About this many times
// in a row toggles the flag. A pause longer than the gap starts the count over.
export const UNLOCK_TAPS = 7
export const UNLOCK_GAP_MS = 1500

export interface TapState { count: number; at: number }

export function registerTap(prev: TapState, now: number): TapState {
  const count = now - prev.at <= UNLOCK_GAP_MS ? prev.count + 1 : 1
  return { count, at: now }
}
