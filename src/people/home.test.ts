import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import {
  daysToWeeks, groupByCircle, nextOccurrence, reachOutList, upcomingDates, visibleToMe, weeksToDays,
} from './home'
import type { PersonCircle, PersonDate, PersonWithLastInteraction } from './types'

const NOW = dayjs('2026-10-12T15:00:00')

let seq = 0
function person(over: Partial<PersonWithLastInteraction> = {}): PersonWithLastInteraction {
  seq += 1
  return {
    sync_id: `p${seq}`, name: `Person ${seq}`, nickname: null, circle_sync_id: null,
    target_cadence_days: 14, preferred_channel: null, details: null, archived: false,
    snoozed_until: null, owner_user_sync_id: null, created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z', last_interaction_at: null, last_channel: null, last_direction: null,
    elapsed_days: 0, ...over,
  }
}

function date(personId: string, month: number, day: number, year: number | null = null): PersonDate {
  return {
    sync_id: `d-${personId}-${month}-${day}`, person_sync_id: personId, kind: 'birthday', label: null,
    month, day, year, remind_days_before: 0, updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function circle(id: string, name: string, sort: number): PersonCircle {
  return { sync_id: id, name, icon: null, sort_order: sort, updated_at: '2026-01-01T00:00:00.000Z' }
}

describe('visibleToMe', () => {
  it('shows everyone with multi-user off, and only mine plus unowned with it on', () => {
    const mine = person({ owner_user_sync_id: 'me' })
    const theirs = person({ owner_user_sync_id: 'them' })
    const unowned = person()
    expect(visibleToMe([mine, theirs, unowned], false, 'me')).toHaveLength(3)
    expect(visibleToMe([mine, theirs, unowned], true, 'me')).toEqual([mine, unowned])
  })
})

describe('reachOutList', () => {
  it('lists people in the attention zone, most overdue first, capped', () => {
    const fresh = person({ elapsed_days: 3 })            // 0.21
    const amber = person({ elapsed_days: 11 })           // 0.79
    const late = person({ elapsed_days: 28 })            // 2.0
    const none = person({ target_cadence_days: null, elapsed_days: 400 })
    expect(reachOutList([fresh, amber, late, none], NOW)).toEqual([late, amber])
    expect(reachOutList([amber, late], NOW, 1)).toEqual([late])
  })

  it('leaves out snoozed and archived people until the snooze ends', () => {
    const snoozed = person({ elapsed_days: 30, snoozed_until: NOW.add(2, 'day').toISOString() })
    const woke = person({ elapsed_days: 30, snoozed_until: NOW.subtract(1, 'day').toISOString() })
    const archived = person({ elapsed_days: 30, archived: true })
    expect(reachOutList([snoozed, woke, archived], NOW)).toEqual([woke])
  })
})

describe('nextOccurrence', () => {
  it('is today when the date is today, else this year or next', () => {
    expect(nextOccurrence(10, 12, NOW).format('YYYY-MM-DD')).toBe('2026-10-12')
    expect(nextOccurrence(12, 25, NOW).format('YYYY-MM-DD')).toBe('2026-12-25')
    expect(nextOccurrence(3, 1, NOW).format('YYYY-MM-DD')).toBe('2027-03-01')
  })

  it('puts Feb 29 on Feb 28 in a common year and keeps it in a leap year', () => {
    expect(nextOccurrence(2, 29, NOW).format('YYYY-MM-DD')).toBe('2027-02-28')
    expect(nextOccurrence(2, 29, dayjs('2027-06-01')).format('YYYY-MM-DD')).toBe('2028-02-29')
  })
})

describe('upcomingDates', () => {
  it('keeps dates within the window, soonest first, with the age when the year is known', () => {
    const a = person({ name: 'Ana' })
    const b = person({ name: 'Ben' })
    const gone = person({ archived: true })
    const out = upcomingDates(
      [date(a.sync_id, 11, 1, 1990), date(b.sync_id, 10, 12), date(b.sync_id, 12, 31), date(gone.sync_id, 10, 13)],
      [a, b, gone],
      NOW,
    )
    expect(out.map(u => [u.person.name, u.daysUntil, u.turning])).toEqual([
      ['Ben', 0, null],
      ['Ana', 20, 36],
    ])
  })
})

describe('groupByCircle', () => {
  it('follows circle order, keeps empty circles, and puts the ungrouped last', () => {
    const family = circle('c1', 'Family', 1)
    const work = circle('c2', 'Work', 0)
    const zoe = person({ name: 'Zoe', circle_sync_id: 'c1' })
    const al = person({ name: 'Al', circle_sync_id: 'c1' })
    const loose = person({ name: 'Loose' })
    const orphan = person({ name: 'Orphan', circle_sync_id: 'deleted' })
    const groups = groupByCircle([zoe, al, loose, orphan], [work, family])
    expect(groups.map(g => [g.circle?.name ?? null, g.people.map(p => p.name)])).toEqual([
      ['Work', []],
      ['Family', ['Al', 'Zoe']],
      [null, ['Loose', 'Orphan']],
    ])
  })
})

describe('cadence in weeks', () => {
  it('converts weeks to days and back', () => {
    expect(weeksToDays('2')).toBe(14)
    expect(weeksToDays('1.5')).toBe(11)
    expect(weeksToDays('')).toBeNull()
    expect(weeksToDays('0')).toBeNull()
    expect(weeksToDays('abc')).toBeNull()
    expect(daysToWeeks(14)).toBe('2')
    expect(daysToWeeks(10)).toBe('1.4')
    expect(daysToWeeks(null)).toBe('')
  })
})
