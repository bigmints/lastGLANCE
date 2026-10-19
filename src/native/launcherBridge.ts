import { registerPlugin } from '@capacitor/core'
import { isAndroid } from './platform'

// Native bridge to the GLANCElauncher integration (docs/launcher-integration.md).
// The web app pushes the launcher snapshot here and the native LauncherProvider
// serves it read-only; the launcher's writes land in a native queue through
// LauncherIntentReceiver and are drained here. Android only: the launcher is an
// Android home screen, and no plugin is registered elsewhere.
export interface LauncherBridgePlugin {
  // Persist the launcher snapshot JSON and notify the provider's observers.
  updateSnapshot(options: { json: string }): Promise<void>
  // Return and clear the queued launcher writes, a JSON array string of
  // `{ action, payload, clientId, receivedAt }` entries in arrival order.
  drainPendingIntents(): Promise<{ intents: string }>
}

const LauncherBridge = registerPlugin<LauncherBridgePlugin>('LauncherBridge')

export interface LauncherIntent {
  action: string
  payload: Record<string, unknown>
  clientId: string
}

export async function pushLauncherSnapshot(json: string): Promise<void> {
  if (!isAndroid()) return
  try {
    await LauncherBridge.updateSnapshot({ json })
  } catch {
    // An older shell without the plugin, or a transient bridge error: the
    // launcher shows its last snapshot, the app is unaffected.
  }
}

// Reads and clears the launcher write queue. Entries without a string action
// or clientId are dropped (the receiver never stores such a thing, so one here
// is corruption, not a write). Empty off Android or on any error.
export async function drainLauncherIntents(): Promise<LauncherIntent[]> {
  if (!isAndroid()) return []
  try {
    const res = await LauncherBridge.drainPendingIntents()
    const parsed = JSON.parse(res?.intents || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    const out: LauncherIntent[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const obj = entry as Record<string, unknown>
      if (typeof obj.action !== 'string' || typeof obj.clientId !== 'string' || !obj.clientId) continue
      const payload = (obj.payload && typeof obj.payload === 'object' ? obj.payload : {}) as Record<string, unknown>
      out.push({ action: obj.action, payload, clientId: obj.clientId })
    }
    return out
  } catch {
    return []
  }
}
