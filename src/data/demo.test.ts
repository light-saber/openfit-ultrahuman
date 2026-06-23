import { describe, expect, it } from 'vitest'
import { createDemoData } from './demo'

describe('createDemoData', () => {
  it('creates a complete deterministic dashboard for the selected date', () => {
    const first = createDemoData('2026-06-22')
    const second = createDemoData('2026-06-22')

    expect(first.selectedDate).toBe('2026-06-22')
    expect(first.activity.steps).toBe(second.activity.steps)
    expect(first.trends).toHaveLength(14)
    expect(first.health.heartRateIntraday).toHaveLength(48)
    expect(first.sleep.stages.reduce((sum, stage) => sum + stage.minutes, 0)).toBeGreaterThan(0)
  })
})
