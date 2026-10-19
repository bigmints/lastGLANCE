package com.lastglance.app.launcher

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.lastglance.app.SharedDataStore

/**
 * The JS-callable surface of the GLANCElauncher integration
 * (src/native/launcherBridge.ts, docs/launcher-integration.md):
 *
 *   updateSnapshot()       store the launcher snapshot and notify the provider's observers
 *   drainPendingIntents()  read + clear the launcher write queue
 *
 * The wake for a write that lands while the app runs is the automation
 * transport's INTENT_RECEIVED signal, which [com.lastglance.app.intents.IntentsBridgePlugin]
 * already turns into its `pendingIntent` event; the web bridge drains both
 * queues on it. Registered in MainActivity.
 */
@CapacitorPlugin(name = "LauncherBridge")
class LauncherBridgePlugin : Plugin() {

    @PluginMethod
    fun updateSnapshot(call: PluginCall) {
        val json = call.getString("json")
        if (json == null) {
            call.reject("missing json")
            return
        }
        SharedDataStore.writeLauncherSnapshot(context, json)
        context.contentResolver.notifyChange(LauncherProvider.CONTENT_URI, null)
        call.resolve()
    }

    @PluginMethod
    fun drainPendingIntents(call: PluginCall) {
        val ret = JSObject()
        ret.put("intents", SharedDataStore.readAndClearPendingLauncherIntents(context))
        call.resolve(ret)
    }
}
