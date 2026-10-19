// Writes from the GLANCElauncher (docs/launcher-integration.md). The native
// LauncherIntentReceiver queues {action, payload, clientId}; the Android bridge
// hook drains the queue here. Every write carries a client-generated id: a
// write the launcher re-sends (it keeps a durable outbox until the snapshot
// shows the id) is acknowledged from the ledger and never applied twice, and
// the ledger rides the launcher snapshot so the launcher can see what landed.
//
// The id travels BESIDE the payload, not inside it: the intents package's
// payload schemas are strict and shared with Tasker. COMPLETE from the
// launcher names the chore by `chore_id` where the automation action matches
// by title (a title still works); LOG_INTERACTION names the person by
// `person_id` as the automation action already can, and the client id becomes
// the interaction's own id unless the payload carries an `event_id`, so the
// People data layer's own dedupe (interactionExists) backs the ledger.

import { ACTIONS } from '@glance-apps/intents'
import { handleIntent, type IntentContext, type IntentResult } from './handleIntent'
import { LOG_INTERACTION } from './androidIntents'

export const LAUNCHER_LEDGER_KEY = 'lg_launcher_handled'
export const LAUNCHER_LEDGER_LIMIT = 500
// Fired after a launcher write is recorded, so the launcher snapshot re-pushes
// with the ledger the write just joined.
export const LAUNCHER_WRITE_HANDLED_EVENT = 'lg:launcher-write-handled'

export const LG_LAUNCHER_ACTIONS = {
  CREATE: 'com.lastglance.app.launcher.CREATE',
  COMPLETE: 'com.lastglance.app.launcher.COMPLETE',
  LOG_INTERACTION: 'com.lastglance.app.launcher.LOG_INTERACTION',
} as const

export const LAUNCHER_ACTION_MAP: Record<string, string> = {
  [LG_LAUNCHER_ACTIONS.CREATE]: ACTIONS.CREATE,
  [LG_LAUNCHER_ACTIONS.COMPLETE]: ACTIONS.COMPLETE,
  [LG_LAUNCHER_ACTIONS.LOG_INTERACTION]: LOG_INTERACTION,
}

export interface HandledWrite {
  clientId: string
  // The short action: create, complete or log_interaction.
  action: string
  // The chore the write made or completed, or the interaction it logged.
  entityId: string | null
  at: string
}

export interface LauncherWrite {
  action: string
  payload?: Record<string, unknown>
  clientId?: string
}

export interface LauncherWriteIO {
  ledger?: HandledWrite[]
  persist?: (ledger: HandledWrite[]) => void
}

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void }

function storage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

export function readLauncherLedger(store: Storage | undefined = storage()): HandledWrite[] {
  try {
    const raw = store?.getItem(LAUNCHER_LEDGER_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as HandledWrite[]) : []
  } catch {
    return []
  }
}

export function writeLauncherLedger(ledger: HandledWrite[], store: Storage | undefined = storage()): void {
  try {
    store?.setItem(LAUNCHER_LEDGER_KEY, JSON.stringify(ledger))
  } catch {
    // Storage unavailable: the next drain dedupes on the data layer alone.
  }
}

export function findHandled(ledger: HandledWrite[], clientId: string): HandledWrite | null {
  return ledger.find(h => h.clientId === clientId) ?? null
}

// The ledger with one more entry, newest last, bounded so it stays small.
export function recordHandled(ledger: HandledWrite[], entry: HandledWrite): HandledWrite[] {
  const next = ledger.filter(h => h.clientId !== entry.clientId)
  next.push(entry)
  return next.length > LAUNCHER_LEDGER_LIMIT ? next.slice(next.length - LAUNCHER_LEDGER_LIMIT) : next
}

async function completeById(choreId: string, completedAt: string | undefined, ctx: IntentContext): Promise<IntentResult> {
  // Skeleton mode, as handleIntent: nothing to read or write, echo the id.
  if (!ctx.listChores || !ctx.logCompletion) return { success: true, chore_id: choreId }
  const chore = (await ctx.listChores()).find(c => c.sync_id === choreId)
  if (!chore) return { success: false, error: `No chore with id "${choreId}"` }
  const at = completedAt ?? new Date().toISOString()
  await ctx.logCompletion(chore.id, completedAt)
  ctx.onChoreCompleted?.({ sync_id: chore.sync_id, name: chore.name, completedAt: at })
  return { success: true, chore_id: chore.sync_id }
}

function entityOf(result: IntentResult): string | null {
  const id = result.interaction_id ?? result.chore_id
  return typeof id === 'string' ? id : null
}

// Handles one launcher write. `io` injects the ledger and its writer for tests;
// production reads and writes localStorage.
export async function handleLauncherIntent(
  write: LauncherWrite,
  ctx: IntentContext = {},
  io: LauncherWriteIO = {},
): Promise<IntentResult> {
  const { action, payload = {}, clientId } = write
  const mapped = LAUNCHER_ACTION_MAP[action]
  if (!mapped) return { success: false, error: `Unknown launcher action: ${action}` }
  if (typeof clientId !== 'string' || !clientId) return { success: false, error: 'clientId required' }

  const ledger = io.ledger ?? readLauncherLedger()
  const persist = io.persist ?? ((next: HandledWrite[]) => writeLauncherLedger(next))
  const prior = findHandled(ledger, clientId)
  if (prior) {
    const result: IntentResult = { success: true, deduped: true }
    if (prior.entityId) result[prior.action === LOG_INTERACTION ? 'interaction_id' : 'chore_id'] = prior.entityId
    return result
  }

  let result: IntentResult
  if (mapped === ACTIONS.COMPLETE && typeof payload.chore_id === 'string') {
    const completedAt = typeof payload.completed_at === 'string' ? payload.completed_at : undefined
    result = await completeById(payload.chore_id, completedAt, ctx)
  } else if (mapped === LOG_INTERACTION) {
    result = await handleIntent(LOG_INTERACTION, { ...payload, event_id: payload.event_id ?? clientId }, ctx)
  } else {
    result = await handleIntent(mapped, payload, ctx)
  }

  if (result.success) {
    persist(recordHandled(ledger, { clientId, action: mapped, entityId: entityOf(result), at: new Date().toISOString() }))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LAUNCHER_WRITE_HANDLED_EVENT))
  }
  return result
}
