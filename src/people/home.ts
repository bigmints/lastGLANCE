// Pure helpers behind the People home screen: who to reach out to, which
// dates are coming up, and the circle grouping. Kept free of React and Dexie
// so the rules are testable on their own.

import dayjs, { type Dayjs } from 'dayjs'
import { ATTENTION_RATIO, getFillRatio } from '@/utils/cadence'
import type { PersonCircle, PersonDate, PersonWithLastInteraction } from './types'

export const REACH_OUT_LIMIT = 5
export const COMING_UP_DAYS = 30

// Household privacy: with multi-user on, each member sees only their own
// People. A person with no owner was added while multi-user was off and reads
// as everyone's, matching how the data layer stamps owners.
export function visibleToMe(
  people: PersonWithLastInteraction[],
  multiUserEnabled: boolean,
  meId: string | null,
): PersonWithLastInteraction[] {
  if (!multiUserEnabled || !meId) return people
  return people.filter(p => p.owner_user_sync_id === null || p.owner_user_sync_id === meId)
}

export function isSnoozed(person: Pick<PersonWithLastInteraction, 'snoozed_until'>, now: Dayjs = dayjs()): boolean {
  return !!person.snoozed_until && dayjs(person.snoozed_until).isAfter(now)
}

export function cadenceRatio(person: PersonWithLastInteraction): number | null {
  if (!person.target_cadence_days) return null
  return getFillRatio(person.elapsed_days, person.target_cadence_days)
}

// People whose cadence has aged into the attention zone, most overdue first.
// A first cut of the suggestions spec: date boosts and tie-breaks arrive with
// the suggestions work.
export function reachOutList(
  people: PersonWithLastInteraction[],
  now: Dayjs = dayjs(),
  limit = REACH_OUT_LIMIT,
): PersonWithLastInteraction[] {
  return people
    .filter(p => !p.archived && !isSnoozed(p, now))
    .map(p => ({ p, ratio: cadenceRatio(p) }))
    .filter((x): x is { p: PersonWithLastInteraction; ratio: number } => x.ratio !== null && x.ratio >= ATTENTION_RATIO)
    .sort((a, b) => b.ratio - a.ratio || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map(x => x.p)
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// The next time a month/day falls on or after `from` (start of day). A Feb 29
// date lands on Feb 28 in years without one.
export function nextOccurrence(month: number, day: number, from: Dayjs = dayjs()): Dayjs {
  const start = from.startOf('day')
  const at = (year: number) => {
    const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day
    return dayjs(new Date(year, month - 1, d))
  }
  const thisYear = at(start.year())
  return thisYear.isBefore(start) ? at(start.year() + 1) : thisYear
}

export interface UpcomingDate {
  date: PersonDate
  person: PersonWithLastInteraction
  on: Dayjs
  daysUntil: number
  // The age or years married on that day, when the year is known.
  turning: number | null
}

export function upcomingDates(
  dates: PersonDate[],
  people: PersonWithLastInteraction[],
  now: Dayjs = dayjs(),
  windowDays = COMING_UP_DAYS,
): UpcomingDate[] {
  const byId = new Map(people.filter(p => !p.archived).map(p => [p.sync_id, p]))
  const today = now.startOf('day')
  const out: UpcomingDate[] = []
  for (const date of dates) {
    const person = byId.get(date.person_sync_id)
    if (!person) continue
    const on = nextOccurrence(date.month, date.day, today)
    const daysUntil = on.diff(today, 'day')
    if (daysUntil > windowDays) continue
    const turning = date.year !== null && on.year() > date.year ? on.year() - date.year : null
    out.push({ date, person, on, daysUntil, turning })
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || a.person.name.localeCompare(b.person.name))
}

export interface CircleGroup {
  circle: PersonCircle | null
  people: PersonWithLastInteraction[]
}

// Everyone, grouped by circle in the circles' own order, with the ungrouped
// last. Empty circles are kept so a new circle shows up straight away.
export function groupByCircle(people: PersonWithLastInteraction[], circles: PersonCircle[]): CircleGroup[] {
  const known = new Set(circles.map(c => c.sync_id))
  const byName = (a: PersonWithLastInteraction, b: PersonWithLastInteraction) => a.name.localeCompare(b.name)
  const groups: CircleGroup[] = circles.map(circle => ({
    circle,
    people: people.filter(p => p.circle_sync_id === circle.sync_id).sort(byName),
  }))
  const loose = people.filter(p => !p.circle_sync_id || !known.has(p.circle_sync_id)).sort(byName)
  if (loose.length) groups.push({ circle: null, people: loose })
  return groups
}

// Cadence is entered in weeks and stored in days.
export function weeksToDays(weeks: string): number | null {
  const n = Number(weeks.trim())
  if (!weeks.trim() || !Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 7)
}

export function daysToWeeks(days: number | null): string {
  if (!days) return ''
  const w = days / 7
  return Number.isInteger(w) ? String(w) : String(Math.round(w * 10) / 10)
}
