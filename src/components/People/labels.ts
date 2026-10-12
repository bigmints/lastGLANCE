import type { TFunction } from 'i18next'
import type { PersonDate } from '@/people/types'

export function dateKindLabel(t: TFunction, date: Pick<PersonDate, 'kind' | 'label'>): string {
  if (date.kind === 'custom' && date.label) return date.label
  return t(`people.dateKind.${date.kind}`)
}

export function daysUntilLabel(t: TFunction, daysUntil: number): string {
  if (daysUntil === 0) return t('nextDue.today')
  if (daysUntil === 1) return t('nextDue.tomorrow')
  return t('nextDue.inDays', { count: daysUntil })
}
