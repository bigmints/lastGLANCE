package com.lastglance.app.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.lastglance.app.SharedDataStore
import com.lastglance.app.intents.IntentReceiver
import org.json.JSONObject

/**
 * The GLANCElauncher's write entry point (docs/launcher-integration.md), beside
 * the automation [IntentReceiver] and sharing its `{action, payload}` envelope
 * and wake broadcast, with two differences:
 *
 *  - It sits behind `com.lastglance.permission.LAUNCHER` in the manifest and
 *    does NOT consult the "Automation intents" toggle: that switch gates the
 *    public, any-app transport and stays as it is.
 *  - Every write carries a `clientId` extra and lands in its own QUEUE
 *    ([SharedDataStore.appendPendingLauncherIntent]), not the automation
 *    transport's single-depth slot. The web layer drains the queue in order
 *    (src/intents/launcherWrites.ts) and dedupes on the id, so a re-sent
 *    write is harmless.
 *
 * Actions: `com.lastglance.app.launcher.CREATE`, `.COMPLETE` and `.LOG_INTERACTION`.
 */
class LauncherIntentReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action !in ACTIONS) return
        val clientId = intent.getStringExtra("clientId")?.takeIf { it.isNotBlank() }
        if (clientId == null) {
            Log.w(TAG, "Dropped $action: no clientId")
            return
        }
        // Re-serialise through JSONObject so a crafted payload cannot inject structure.
        val payload = try {
            intent.getStringExtra("payload")?.let { JSONObject(it) } ?: JSONObject()
        } catch (e: Exception) {
            JSONObject()
        }
        val entry = JSONObject()
            .put("action", action)
            .put("payload", payload)
            .put("clientId", clientId)
            .put("receivedAt", System.currentTimeMillis())
        SharedDataStore.appendPendingLauncherIntent(context, entry.toString())

        // Wake a running app so the WebView drains at once (IntentsBridgePlugin
        // turns this into its pendingIntent event); a dead app drains on next
        // launch. Package-scoped, like the automation wake.
        context.sendBroadcast(Intent(IntentReceiver.INTENT_RECEIVED).setPackage(context.packageName))
    }

    companion object {
        private const val TAG = "LauncherIntents"
        const val ACTION_CREATE = "com.lastglance.app.launcher.CREATE"
        const val ACTION_COMPLETE = "com.lastglance.app.launcher.COMPLETE"
        const val ACTION_LOG_INTERACTION = "com.lastglance.app.launcher.LOG_INTERACTION"
        val ACTIONS = setOf(ACTION_CREATE, ACTION_COMPLETE, ACTION_LOG_INTERACTION)
    }
}
