package com.lastglance.app.launcher

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.lastglance.app.R
import com.lastglance.app.SharedDataStore
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Keeps the app awake while its live renderer answers a launcher REFRESH
 * (docs/launcher-integration.md, "Freshness"). Ported from dayGLANCE's
 * (dayglance-android launcher/LauncherAwakeWorker.kt).
 *
 * With the renderer alive, [LauncherIntentReceiver] queues the REFRESH for the
 * web layer and wakes it. But Android freezes a backgrounded app's processes,
 * the WebView's renderer among them, a couple of minutes after it goes idle; the
 * receiver is thawed for the broadcast, the web layer is not, and the refresh
 * waits until the user next opens the app. An app running a job is not frozen,
 * so the receiver also starts this one: it does nothing but wait, at most
 * [HOLD_MS], for the web layer to record an outcome for the request, and then
 * ends so the app can be frozen again.
 *
 * It runs nothing itself. The cycle is the app's own, in its one WebView, as
 * when the app is on screen.
 */
class LauncherAwakeWorker(
    private val appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val clientId = inputData.getString(KEY_CLIENT_ID) ?: return Result.success()
        withTimeoutOrNull(HOLD_MS) {
            while (!LauncherRefreshWait.answered(SharedDataStore.launcherRefreshEntry(appContext, clientId))) delay(POLL_MS)
        }
        return Result.success()
    }

    /**
     * Only asked for below Android 12, where an expedited job runs as a
     * foreground service and needs a notification: a quiet one on its own
     * low-importance channel.
     */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = appContext.getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, appContext.getString(R.string.launcher_refresh_channel), NotificationManager.IMPORTANCE_MIN),
                )
            }
        }
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(appContext.getString(R.string.launcher_refresh_notification))
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        return ForegroundInfo(NOTIFICATION_ID, notification)
    }

    companion object {
        const val UNIQUE_WORK_NAME = "launcher-refresh-awake"
        private const val KEY_CLIENT_ID = "clientId"
        private const val CHANNEL_ID = "launcher_refresh"
        private const val NOTIFICATION_ID = 7311
        /** The receiver's in-flight window: a request unanswered by then is treated as lost there too. */
        const val HOLD_MS = 60_000L
        private const val POLL_MS = 500L

        /**
         * Hold the app awake for [clientId]. A newer request replaces an older
         * one's hold: the receiver coalesces requests while one is in flight, so
         * a new one only arrives once the last was answered or given up on.
         */
        fun schedule(context: Context, clientId: String) {
            val request = OneTimeWorkRequestBuilder<LauncherAwakeWorker>()
                .setInputData(Data.Builder().putString(KEY_CLIENT_ID, clientId).build())
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
