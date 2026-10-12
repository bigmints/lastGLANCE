import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PersonWithLastInteraction } from '@/people/types'
import { cadenceRatio } from '@/people/home'
import { formatElapsed, getCadenceColor } from '@/utils/cadence'
import { CHANNEL_ICONS } from './channels'

interface Props {
  person: PersonWithLastInteraction
  onOpen: (person: PersonWithLastInteraction) => void
  onQuickLog: (person: PersonWithLastInteraction) => void
}

const LONG_PRESS_MS = 500

export function PersonRow({ person, onOpen, onQuickLog }: Props) {
  const { t } = useTranslation()
  const ratio = cadenceRatio(person)
  const color = ratio !== null ? getCadenceColor(ratio) : '#64748b'
  const width = ratio !== null ? `${Math.min(ratio * 100, 100)}%` : '0%'
  const last = person.last_interaction_at
    ? formatElapsed(t, person.elapsed_days, person.last_interaction_at)
    : t('people.row.noContactYet')
  const ChannelIcon = person.last_channel ? CHANNEL_ICONS[person.last_channel] : null

  // Long-press opens quick-log, like the spec's swipe/hold gesture; a plain
  // tap opens the person. The timer's firing marks the press as consumed so
  // the click that follows the release does not also open the detail.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consumed = useRef(false)
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (consumed.current) { consumed.current = false; return } onOpen(person) }}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(person) }}
      onPointerDown={() => {
        consumed.current = false
        clear()
        timer.current = setTimeout(() => { consumed.current = true; onQuickLog(person) }, LONG_PRESS_MS)
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={e => e.preventDefault()}
      className="relative overflow-hidden rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/40 cursor-pointer group transition-colors hover:border-slate-300 dark:hover:border-slate-600/60 select-none"
      aria-label={t('people.row.label', { name: person.name, last })}
    >
      <div
        className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
        style={{ backgroundColor: color, opacity: ratio !== null ? 0.9 : 0.3 }}
      />
      <div
        className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
        style={{ width, backgroundColor: color, opacity: 0.1 }}
      />
      <div className="relative flex items-center gap-3 pl-5 pr-4 py-3">
        <span
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
          aria-hidden
        >
          {person.name.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
            {person.name}
            {person.nickname && <span className="ml-1.5 text-slate-400 dark:text-slate-500 font-normal">{person.nickname}</span>}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums mt-0.5 flex items-center gap-1">
            {ChannelIcon && <ChannelIcon size={11} className="shrink-0" />}
            <span className="truncate">{last}</span>
          </p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onQuickLog(person) }}
          onPointerDown={e => e.stopPropagation()}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border bg-slate-100 dark:bg-slate-700/60 border-slate-200 dark:border-slate-600/40 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          aria-label={t('people.row.logAriaLabel', { name: person.name })}
        >
          <Plus size={12} strokeWidth={2.5} />
          <span>{t('people.row.log')}</span>
        </button>
      </div>
    </div>
  )
}
