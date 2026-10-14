import { useEffect } from 'react'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { PluginListenerHandle } from '@capacitor/core'
import i18n from 'i18next'
import { syncReminders, handleNotificationAction } from '@/native/reminders'
import { isNativeShell } from '@/native/platform'
import { PEOPLE_CHANGED_EVENT } from '@/people/queries'
import { DATE_REMINDERS_KEY } from '@/people/settings'

const DATE_REMINDERS_EVENT = `lg:setting:${DATE_REMINDERS_KEY}`

// Keeps the native reminder set in sync with the chores and People, on the same
// signals as the widget snapshot, and routes notification taps to the chore or
// person. Runs in both
// native shells; no-op on web/PWA (syncReminders also guards internally).
export function useReminders(): void {
  useEffect(() => {
    if (!isNativeShell()) return

    syncReminders()

    const onChange = () => { syncReminders() }
    window.addEventListener('lg:chore-logged', onChange)
    window.addEventListener('lg:sync-applied', onChange)
    window.addEventListener(DATE_REMINDERS_EVENT, onChange)
    // People writes come in bursts (a contacts import adds a row at a time),
    // so they settle before one resync.
    let peopleTimer: ReturnType<typeof setTimeout> | undefined
    const onPeople = () => {
      clearTimeout(peopleTimer)
      peopleTimer = setTimeout(onChange, 500)
    }
    window.addEventListener(PEOPLE_CHANGED_EVENT, onPeople)
    // Notification text is baked at schedule time, so a language switch must
    // re-run the sync: the body diff in syncReminders then re-bakes every
    // pending reminder (and the channel/action labels re-register) in the new
    // language.
    i18n.on('languageChanged', onChange)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncReminders()
    }
    document.addEventListener('visibilitychange', onVisibility)

    let tapHandle: PluginListenerHandle | undefined
    LocalNotifications.addListener('localNotificationActionPerformed', action => {
      handleNotificationAction(action.actionId, action.notification.extra)
    }).then(handle => { tapHandle = handle })

    return () => {
      window.removeEventListener('lg:chore-logged', onChange)
      window.removeEventListener('lg:sync-applied', onChange)
      window.removeEventListener(DATE_REMINDERS_EVENT, onChange)
      window.removeEventListener(PEOPLE_CHANGED_EVENT, onPeople)
      clearTimeout(peopleTimer)
      i18n.off('languageChanged', onChange)
      document.removeEventListener('visibilitychange', onVisibility)
      tapHandle?.remove()
    }
  }, [])
}
