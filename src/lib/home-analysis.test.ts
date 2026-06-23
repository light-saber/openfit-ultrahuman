import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import { analyzeHome, compareWithPersonalBaseline, periodDelta } from './home-analysis'

describe('home analysis', () => {
  it('uses goals and personal baselines without inventing a composite score', () => {
    const data = createDemoData('2026-06-22')
    const analysis = analyzeHome(data)

    expect(analysis.stepsGoalProgress).toBeCloseTo((data.activity.steps ?? 0) / (data.activity.stepsGoal ?? 1))
    expect(analysis.restingHeartRate.sampleCount).toBe(7)
    expect(analysis.hrv.sampleCount).toBe(7)
    expect(analysis.headline.title.length).toBeGreaterThan(0)
  })

  it('excludes the selected day from a personal baseline', () => {
    const data = createDemoData('2026-06-22')
    const comparison = compareWithPersonalBaseline(data, data.health.hrvMs, (point) => point.hrvMs)
    const expected = data.trends.slice(-8, -1).reduce((sum, point) => sum + (point.hrvMs ?? 0), 0) / 7

    expect(comparison.baseline).toBeCloseTo(expected)
  })

  it('requires enough observations for a period comparison', () => {
    expect(periodDelta([1, null, 2, 3])).toBeNull()
    expect(periodDelta([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])).not.toBeNull()
  })
})
