import { useEffect, useState } from 'react'

// "Show reciprocity" (docs: the reciprocity spec): off hides every direction
// arrow, reason line and balance. Direction is still recorded and still
// shapes the Reach out order either way.
export const SHOW_RECIPROCITY_KEY = 'lg-people-show-reciprocity'
const CHANGED_EVENT = 'lg:people-show-reciprocity'

export function isReciprocityShown(): boolean {
  try { return localStorage.getItem(SHOW_RECIPROCITY_KEY) !== 'false' } catch { return true }
}

export function setReciprocityShown(on: boolean): void {
  try { localStorage.setItem(SHOW_RECIPROCITY_KEY, on ? 'true' : 'false') } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function useShowReciprocity(): boolean {
  const [shown, setShown] = useState(isReciprocityShown)
  useEffect(() => {
    const onChange = () => setShown(isReciprocityShown())
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CHANGED_EVENT, onChange)
  }, [])
  return shown
}
