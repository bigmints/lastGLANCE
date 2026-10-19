package com.lastglance.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

// Single SharedPreferences store shared between the Capacitor bridge (writer)
// and the home-screen widgets (readers). Kept tiny on purpose: the web app is
// the source of truth, this is just the hand-off surface.
public final class SharedDataStore {

    private static final String PREFS = "lastglance_shared";
    private static final String KEY_SNAPSHOT = "snapshot";
    // Completions logged from a widget tap, awaiting drain into the DB by the
    // web app on next foreground (a widget can't write IndexedDB itself).
    private static final String KEY_PENDING = "pending_completions";
    // A widget body-tap target ("chore:<syncId>" or "filter:soon") captured by
    // MainActivity, consumed by the web app on foreground.
    private static final String KEY_DEEPLINK = "pending_deeplink";
    // Text shared into the app (ACTION_SEND) to seed a new chore's name, captured
    // by MainActivity and consumed by the web app on foreground.
    private static final String KEY_SHARED_CHORE = "pending_shared_chore";
    // A single inbound Android/Tasker intent (app.lastglance.*), captured by the
    // manifest IntentReceiver (broadcast) or MainActivity (Activity launch),
    // drained by the web app via the IntentsBridge plugin. JSON: {action,payload}.
    // Single-depth on purpose: each Activity intent is self-sufficient and a live
    // broadcast wakes the WebView immediately, so bursts don't queue here.
    private static final String KEY_PENDING_INTENT = "pending_intent";
    // The GLANCElauncher snapshot (docs/launcher-integration.md), pushed by the
    // web app through LauncherBridgePlugin and served read-only by
    // LauncherProvider. Separate from the widget snapshot: a different shape,
    // with a different reader.
    private static final String KEY_LAUNCHER_SNAPSHOT = "launcher_snapshot";
    // The launcher's inbound writes, a JSON array of {action, payload, clientId,
    // receivedAt}, appended by LauncherIntentReceiver and drained by the web app
    // through LauncherBridgePlugin. A QUEUE, unlike the automation slot above:
    // the launcher may send two writes in a row at a dead app and the second
    // must not replace the first. Each write carries its own client id, so the
    // web layer dedupes a re-sent one and the queue can be bounded.
    private static final String KEY_PENDING_LAUNCHER_INTENTS = "pending_launcher_intents";
    private static final int PENDING_LAUNCHER_INTENTS_MAX = 200;

    private SharedDataStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void writeSnapshot(Context context, String json) {
        prefs(context).edit().putString(KEY_SNAPSHOT, json).apply();
    }

    public static String readSnapshot(Context context) {
        return prefs(context).getString(KEY_SNAPSHOT, null);
    }

    // Append a completion to the durable queue. The web app mints nothing here;
    // the caller supplies the sync_id so the later DB replay is idempotent.
    public static void appendPendingCompletion(Context context, String choreSyncId, String syncId, String completedAt) {
        try {
            JSONArray arr = new JSONArray(prefs(context).getString(KEY_PENDING, "[]"));
            JSONObject o = new JSONObject();
            o.put("choreSyncId", choreSyncId);
            o.put("syncId", syncId);
            o.put("completedAt", completedAt);
            arr.put(o);
            prefs(context).edit().putString(KEY_PENDING, arr.toString()).apply();
        } catch (Exception e) {
            // Best-effort; a dropped queue entry just means that tap isn't
            // persisted to the DB (the optimistic snapshot still updated).
        }
    }

    // Return the queued completions as a JSON array string and clear the queue.
    public static String readAndClearPendingCompletions(Context context) {
        String raw = prefs(context).getString(KEY_PENDING, "[]");
        prefs(context).edit().remove(KEY_PENDING).apply();
        return raw;
    }

    public static void writePendingDeepLink(Context context, String value) {
        prefs(context).edit().putString(KEY_DEEPLINK, value).apply();
    }

    public static String readAndClearPendingDeepLink(Context context) {
        String value = prefs(context).getString(KEY_DEEPLINK, null);
        if (value != null) prefs(context).edit().remove(KEY_DEEPLINK).apply();
        return value;
    }

    public static void writePendingSharedChore(Context context, String value) {
        prefs(context).edit().putString(KEY_SHARED_CHORE, value).apply();
    }

    public static String readAndClearPendingSharedChore(Context context) {
        String value = prefs(context).getString(KEY_SHARED_CHORE, null);
        if (value != null) prefs(context).edit().remove(KEY_SHARED_CHORE).apply();
        return value;
    }

    // Store an inbound Android/Tasker intent as a JSON string {action, payload}.
    public static void writePendingIntent(Context context, String json) {
        prefs(context).edit().putString(KEY_PENDING_INTENT, json).apply();
    }

    // Read + clear the pending intent slot. Returns null when empty.
    public static String readAndClearPendingIntent(Context context) {
        String value = prefs(context).getString(KEY_PENDING_INTENT, null);
        if (value != null) prefs(context).edit().remove(KEY_PENDING_INTENT).apply();
        return value;
    }

    public static void writeLauncherSnapshot(Context context, String json) {
        prefs(context).edit().putString(KEY_LAUNCHER_SNAPSHOT, json).apply();
    }

    public static String readLauncherSnapshot(Context context) {
        return prefs(context).getString(KEY_LAUNCHER_SNAPSHOT, null);
    }

    // Append one launcher write to the durable queue, dropping the oldest past
    // the cap. Written synchronously (commit) so the entry is on disk before the
    // receiver returns and the wake broadcast goes out.
    public static void appendPendingLauncherIntent(Context context, String entryJson) {
        try {
            JSONArray arr = new JSONArray(prefs(context).getString(KEY_PENDING_LAUNCHER_INTENTS, "[]"));
            arr.put(new JSONObject(entryJson));
            while (arr.length() > PENDING_LAUNCHER_INTENTS_MAX) arr.remove(0);
            prefs(context).edit().putString(KEY_PENDING_LAUNCHER_INTENTS, arr.toString()).commit();
        } catch (Exception e) {
            // A malformed entry is the receiver's bug, not a write to keep.
        }
    }

    // Return the queued launcher writes as a JSON array string and clear the queue.
    public static String readAndClearPendingLauncherIntents(Context context) {
        String raw = prefs(context).getString(KEY_PENDING_LAUNCHER_INTENTS, "[]");
        prefs(context).edit().remove(KEY_PENDING_LAUNCHER_INTENTS).apply();
        return raw;
    }

    // Master switch for the Android/Tasker automation-intents transport. OFF by
    // default: the app.lastglance.* surface is open to every installed app (an
    // exported receiver in, unrestricted RESULT/NOTIFY broadcasts out), so it
    // only runs once the user opts in from the dayGLANCE Integration settings.
    // While disabled, inbound intents are dropped without being stored and no
    // outbound broadcasts are emitted — enforced natively in IntentReceiver,
    // MainActivity, and IntentsBridgePlugin, not just ignored by the WebView.
    private static final String KEY_AUTOMATION_INTENTS = "automation_intents_enabled";

    public static boolean isAutomationIntentsEnabled(Context context) {
        return prefs(context).getBoolean(KEY_AUTOMATION_INTENTS, false);
    }

    public static void setAutomationIntentsEnabled(Context context, boolean enabled) {
        SharedPreferences.Editor edit = prefs(context).edit().putBoolean(KEY_AUTOMATION_INTENTS, enabled);
        // Turning the transport off also drops any intent stored while it was on,
        // so a stale payload can't be processed after the user opted out.
        if (!enabled) edit.remove(KEY_PENDING_INTENT);
        edit.apply();
    }
}
