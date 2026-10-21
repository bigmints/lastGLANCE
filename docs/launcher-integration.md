# GLANCElauncher integration

How lastGLANCE hands its data to the GLANCElauncher and takes writes back. The
launcher's side of the design is `SPEC.md` ("Real data") in the launcher repo;
this is the app's half, built to the same pattern as dayGLANCE's
`docs/launcher-integration.md`.

lastGLANCE's data lives in the WebView's IndexedDB, which native code cannot
read. The native side has only what the web layer pushes, so the launcher
reads a **snapshot** the app builds, and its writes reach the app the way the
automation intents do: queued natively, drained by the web layer when it runs.

## Reads: the launcher snapshot and the provider

`src/native/launcherSnapshot.ts` builds the snapshot from plain inputs;
`src/hooks/useLauncherSnapshot.ts` loads them, runs on the widget snapshot's
triggers (mount, a chore logged, a sync applied, People changed, the app
backgrounded) plus a launcher write landing and the day rolling over, and
pushes through the `LauncherBridge` plugin only when the content changed. The
widget snapshot and its hook are untouched. Shape:

```
{ version: 1, updatedAt, timezone, today,
  chores: [{ id, name, category, categoryId, targetCadenceDays, lastDoneAt, elapsedDays,
             icon, updatedAt, clientId }],
  people: [{ id, name, nickname, circle, circleId, targetCadenceDays, lastInteractionAt,
             lastChannel, unreturned, snoozedUntil,
             dates: [{ id, kind, label, month, day, year }], updatedAt }],
  handledWrites: [{ clientId, action, entityId, at }] }
```

Ids are the rows' `sync_id`s, the ids the launcher writes back by. Chores
follow the widgets' "Mine" rule under multi-user; people are the ones this
user sees, archived left out, snoozed included with `snoozedUntil` so the
launcher can hide them the way the app does.

`LauncherProvider` (`android/.../launcher/`) serves it read-only at
`content://com.lastglance.app.launcher/<collection>` for `chores`, `people`
and `meta` (one row: version, updatedAt, timezone, today, handledWrites).
Each cursor has `_id`, `id` and `json` columns, the row as JSON. Every push
calls `notifyChange` on the authority, so a `ContentObserver` registered on
any collection URI sees every change. `insert`, `update` and `delete` throw.

## Freshness: the heartbeat and REFRESH

The snapshot is pushed only when its content changes, so `meta.updatedAt` says
when something last moved, not when the app last looked. Two more stamps say
that, written natively by `LauncherBridgePlugin.touchHeartbeat` and merged into
`meta` by the provider:

- `checkedAt` (ms): every run of the snapshot builder, changed or not, and
  every return to the foreground.
- `syncedAt` (ISO): the latest completed cycle across the roads that are on
  (the file engine's and the vault engine's `getLastSynced`), the moment other
  devices' changes are known to be in. Null without one.

`meta` also carries `rendererAlive` (whether the Capacitor bridge is loaded in
the process at the moment of the read) and `refreshLog`, the last 20 REFRESH
requests.

**`com.lastglance.app.launcher.REFRESH`** asks the app to confirm its data now.
It is not a write: it carries a `clientId` for dedupe and logging only, is never
in the handled ledger, and the launcher sends it outside its outbox. The
receiver routes it by liveness and logs every request with the liveness it saw:

| Outcome | When |
| --- | --- |
| `queued` | the renderer is alive: queued and woken; the web layer runs every road (chores and People, file and vault) to completion, re-pushes, re-stamps the heartbeat, then reports `ran` (with `durationMs`) or `failed` (with `reason`) into the same entry |
| `coalesced` | a queued refresh from the last minute has no outcome yet |
| `deferred` | no renderer in the process: nothing can run the sync (lastGLANCE stays on this path; a headless Capacitor bridge is a separate spike) |

The launcher measures staleness per app from `syncedAt` when sync is
configured and from `checkedAt` otherwise, and shows the log in its
diagnostics panel.

## Writes: the launcher receiver

`LauncherIntentReceiver` takes `com.lastglance.app.launcher.CREATE`,
`.COMPLETE` and `.LOG_INTERACTION` broadcasts with two String extras:
`payload`, a JSON object in the automation transport's shape (`title` and
optional `project` for CREATE; `chore_id` and optional `completed_at`, or
`title`, for COMPLETE; `person_id` or `name`, optional `channel`, `direction`,
`note`, `occurred_at` for LOG_INTERACTION), and `clientId`, an id the launcher
generates per write (a UUID). The receiver queues the write in its own slot
(several deep, unlike the automation transport's single slot) and sends the
same package-scoped wake broadcast, so a running app drains at once and a dead
app on next launch.

The web layer (`src/intents/launcherWrites.ts`, drained first by
`useAndroidIntentBridge`) handles each write through the automation handlers
and dedupes on `clientId` with a ledger kept in localStorage: a re-sent write
is acknowledged, never applied twice. `COMPLETE` with `chore_id` logs a
completion for that chore; `LOG_INTERACTION` uses the `clientId` as the
interaction's own `sync_id` unless the payload carries an `event_id`, so the
People data layer's own check (`interactionExists`) backs the ledger across
devices. The ledger rides the snapshot as `handledWrites`, and a chore the
launcher created carries its `clientId` in the snapshot, joined in from the
ledger rather than stored on the row: lastGLANCE's sync tiers map chore fields
one by one, so a field on the chore would have to be taught to both engines
and both apply paths, and the ledger already carries the same fact on the
device the write landed on. The launcher retires an outbox entry when the
snapshot shows its id either way.

The client id travels beside the payload rather than inside it because the
intents package's payload schemas are strict and shared with Tasker. The
receiver does not consult the "Automation intents" toggle, which keeps gating
the public transport exactly as before. No RESULT broadcast is sent for
launcher writes; the launcher reads the outcome from the next snapshot. The
activity log names the sender ("via GLANCElauncher").

## Links the launcher opens

Besides its writes, the launcher opens the app through `lastglance://` links
(`MainActivity.linkFromUri` maps each to a pending token the web app routes):
`chore/<id>`, `person/<id>`, `log/<id>`, `people`, `chores`, `filter/soon`,
`action/search`, `action/add` (the new-chore form) and `action/addPerson`
(People, with the add-person form open; the launcher's Add person). Adding a
person stays in the app's own form rather than a launcher write: a person has
circles, dates and a cadence that a one-line write would leave unset.

## Permission

Both the provider and the receiver sit behind `com.lastglance.permission.LAUNCHER`,
`protectionLevel="signature|knownSigner"`, with `knownCerts` naming the
**launcher's** signing certificates (`res/values/launcher_certs.xml`): its
release certificate, its debug certificate (removed before any public release)
and its Play app signing certificate once it ships there. lastGLANCE's own
signature satisfies the `signature` half, so the app can always reach its own
provider. `knownSigner` exists from Android 12; on older devices the permission
is signature-only and the launcher stays in demo mode. The launcher declares
`<uses-permission android:name="com.lastglance.permission.LAUNCHER" />`.

The digests in `launcher_certs.xml` are placeholders until read from the
launcher's keystores (`keytool -list -v`, SHA-256, lowercase, no colons). They
are the same three digests dayGLANCE lists.

## Verifying on a device

With the launcher's real digests in `launcher_certs.xml` and both apps installed:

1. Open lastGLANCE once so the web layer pushes. Then from a shell:
   `adb shell content query --uri content://com.lastglance.app.launcher/meta`
   prints the meta row (adb's shell holds every permission). `.../chores` and
   `.../people` list the rows; log a chore in the app and query again.
2. A write: `adb shell am broadcast -a com.lastglance.app.launcher.COMPLETE
   -n com.lastglance.app/.launcher.LauncherIntentReceiver --es clientId test-1
   --es payload '{"chore_id":"<an id from step 1>"}'`. With the app in the
   foreground the completion is logged at once; with it dead, on next launch.
   Send it again with the same `clientId`: nothing changes, and `meta` lists
   the id under `handledWrites`.
3. A create: the same with `.CREATE` and `--es payload '{"title":"From the
   launcher"}'`; the new chore's row carries `"clientId":"test-2"`.
4. A contact: `.LOG_INTERACTION` with `--es payload '{"person_id":"<an id from
   people>","channel":"call"}'`; the person's `lastInteractionAt` moves and the
   interaction's id in the app is the `clientId`.
5. A refresh: `am broadcast -a com.lastglance.app.launcher.REFRESH -n
   com.lastglance.app/.launcher.LauncherIntentReceiver --es clientId rf-1`.
   With the app alive, `meta.refreshLog` shows the entry go `queued` then
   `ran`; with the process killed (`adb shell am kill com.lastglance.app`,
   never `force-stop`), the entry is `deferred` and `rendererAlive` reads false.
6. Permission: from any app without the permission the query is refused
   with a `SecurityException` and the broadcast is not delivered.

Unit tests: `npx vitest run src/native/launcherSnapshot.test.ts
src/intents/launcherWrites.test.ts` and, on the Android side,
`./gradlew :app:testDebugUnitTest --tests '*LauncherSnapshotRowsTest*'`.
