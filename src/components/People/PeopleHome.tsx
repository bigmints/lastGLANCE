import { useMemo, useState } from 'react'
import { CalendarHeart, Plus, Settings2, UserPlus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUsersContext } from '@/multiuser/UsersContext'
import { createCircle } from '@/people/queries'
import { groupByCircle, reachOutList, upcomingDates, visibleToMe } from '@/people/home'
import { usePeopleData } from '@/people/usePeopleData'
import type { PersonWithLastInteraction } from '@/people/types'
import { formatMonthDay } from '@/utils/datetime'
import { CircleManagerModal } from './CircleManagerModal'
import { PersonDetailModal } from './PersonDetailModal'
import { PersonFormModal } from './PersonFormModal'
import { PersonRow } from './PersonRow'
import { QuickLogSheet } from './QuickLogSheet'
import { dateKindLabel, daysUntilLabel } from './labels'

const STARTER_CIRCLES = ['family', 'friends', 'work'] as const

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{children}</h2>
      {action}
    </div>
  )
}

export function PeopleHome() {
  const { t } = useTranslation()
  const { multiUserEnabled, meId } = useUsersContext()
  const { people: all, circles, dates, loading } = usePeopleData()
  const [openId, setOpenId] = useState<string | null>(null)
  const [logFor, setLogFor] = useState<string[] | null>(null)
  const [adding, setAdding] = useState<{ circleId: string | null } | null>(null)
  const [managingCircles, setManagingCircles] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const mine = useMemo(() => visibleToMe(all, multiUserEnabled, meId), [all, multiUserEnabled, meId])
  const active = useMemo(() => mine.filter(p => !p.archived), [mine])
  const archived = useMemo(() => mine.filter(p => p.archived), [mine])
  const reachOut = useMemo(() => reachOutList(active), [active])
  const comingUp = useMemo(() => upcomingDates(dates, active), [dates, active])
  const groups = useMemo(() => groupByCircle(active, circles), [active, circles])
  const open = mine.find(p => p.sync_id === openId) ?? null

  const openPerson = (p: PersonWithLastInteraction) => setOpenId(p.sync_id)
  const quickLog = (p: PersonWithLastInteraction) => setLogFor([p.sync_id])
  const row = (p: PersonWithLastInteraction) => (
    <PersonRow key={p.sync_id} person={p} onOpen={openPerson} onQuickLog={quickLog} />
  )

  async function addStarterCircles() {
    for (const key of STARTER_CIRCLES) await createCircle(t(`people.starterCircles.${key}`))
  }

  if (loading) return <div className="flex-1" />

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setManagingCircles(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings2 size={14} /> {t('people.home.circles')}
          </button>
          <button
            onClick={() => setAdding({ circleId: null })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border text-green-400 border-green-400/40 hover:text-green-300 hover:bg-green-400/10 hover:border-green-400/60 transition-colors"
          >
            <UserPlus size={14} /> {t('people.home.addPerson')}
          </button>
        </div>

        {active.length === 0 && archived.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 py-12 px-4">
            <Users size={36} className="text-green-400/70" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('people.empty.title')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">{t('people.empty.body')}</p>
            <button
              onClick={() => setAdding({ circleId: null })}
              className="mt-2 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-green-400 border border-green-400/40 hover:bg-green-400/10 transition-colors"
            >
              <UserPlus size={15} /> {t('people.empty.addFirst')}
            </button>
            {circles.length === 0 && (
              <button
                onClick={addStarterCircles}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2"
              >
                {t('people.empty.starterCircles')}
              </button>
            )}
          </div>
        ) : (
          <>
            {reachOut.length > 0 && (
              <section>
                <SectionTitle>{t('people.home.reachOut')}</SectionTitle>
                <div className="space-y-2">{reachOut.map(row)}</div>
              </section>
            )}

            {comingUp.length > 0 && (
              <section>
                <SectionTitle>{t('people.home.comingUp')}</SectionTitle>
                <ul className="rounded-xl border border-slate-200 dark:border-slate-700/40 bg-white dark:bg-slate-800/80 divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                  {comingUp.map(u => (
                    <li key={u.date.sync_id}>
                      <button
                        onClick={() => openPerson(u.person)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                      >
                        <CalendarHeart size={15} className={u.daysUntil <= 7 ? 'text-pink-400 shrink-0' : 'text-slate-400 dark:text-slate-500 shrink-0'} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">{u.person.name}</span>
                          <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">
                            {dateKindLabel(t, u.date)}{u.turning !== null ? ` (${u.turning})` : ''} · {formatMonthDay(u.on)}
                          </span>
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">{daysUntilLabel(t, u.daysUntil)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {groups.map(g => (
              <section key={g.circle?.sync_id ?? 'none'}>
                <SectionTitle
                  action={
                    <button
                      onClick={() => setAdding({ circleId: g.circle?.sync_id ?? null })}
                      className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-green-400 transition-colors"
                      aria-label={t('people.home.addToCircle', { circle: g.circle?.name ?? t('people.home.noCircle') })}
                    >
                      <Plus size={14} />
                    </button>
                  }
                >
                  {g.circle?.name ?? (circles.length ? t('people.home.noCircle') : t('people.home.everyone'))}
                  <span className="ml-1.5 normal-case tracking-normal font-normal">{g.people.length}</span>
                </SectionTitle>
                {g.people.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 px-1">{t('people.home.emptyCircle')}</p>
                ) : (
                  <div className="space-y-2">{g.people.map(row)}</div>
                )}
              </section>
            ))}

            {archived.length > 0 && (
              <section>
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showArchived ? t('people.home.hideArchived') : t('people.home.showArchived', { n: archived.length })}
                </button>
                {showArchived && <div className="space-y-2 mt-2 opacity-70">{archived.map(row)}</div>}
              </section>
            )}
          </>
        )}
      </div>

      {open && (
        <PersonDetailModal person={open} people={mine} circles={circles} onClose={() => setOpenId(null)} />
      )}
      {logFor && (
        <QuickLogSheet people={mine} initialPersonIds={logFor} onClose={() => setLogFor(null)} />
      )}
      {adding && (
        <PersonFormModal
          circles={circles}
          initialCircleId={adding.circleId}
          onClose={() => setAdding(null)}
        />
      )}
      {managingCircles && (
        <CircleManagerModal circles={circles} onClose={() => setManagingCircles(false)} />
      )}
    </div>
  )
}
