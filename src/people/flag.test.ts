import { describe, it, expect } from 'vitest'
import { registerTap, UNLOCK_GAP_MS, UNLOCK_TAPS } from './flag'

describe('registerTap', () => {
  it('counts quick taps and starts over after a pause', () => {
    let s = { count: 0, at: 0 }
    for (let i = 1; i <= UNLOCK_TAPS; i++) s = registerTap(s, 10_000 + i * 300)
    expect(s.count).toBe(UNLOCK_TAPS)
    s = registerTap(s, s.at + UNLOCK_GAP_MS + 1)
    expect(s.count).toBe(1)
  })
})
