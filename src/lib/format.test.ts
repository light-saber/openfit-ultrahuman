import { describe, expect, it } from 'vitest'
import { formatMinutes } from './format'

describe('formatMinutes', () => {
  it('formats positive and negative durations without negative remainders', () => {
    expect(formatMinutes(85)).toBe('1 h 25 min')
    expect(formatMinutes(-85)).toBe('−1 h 25 min')
  })
})
