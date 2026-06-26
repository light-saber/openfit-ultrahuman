import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { __test } = require('./ultrahuman-service.cjs') as {
  __test: {
    translateUltrahuman: (
      raw: Record<string, any>,
      date: string,
      email?: string,
    ) => Record<string, any>
  }
}

// Day starts at 2026-06-24T00:00:00 local; offsets from this anchor become the
// intraday clock time the adapter reports.
const DAY_START = 1782239400

// A trimmed but structurally faithful slice of the Ultrahuman Personal API
// `data.metric_data` array (the real response carries hundreds of samples).
const metric = (type: string, object: Record<string, unknown>) => ({ type, object })
const payload = {
  data: {
    metric_data: [
      metric('hr', {
        day_start_timestamp: DAY_START,
        values: [
          { value: 72, timestamp: DAY_START + 220 },
          { value: 106, timestamp: DAY_START + 3600 },
          { value: 70, timestamp: DAY_START + 7200 },
        ],
        last_reading: 70,
        unit: 'BPM',
      }),
      metric('temp', {
        day_start_timestamp: DAY_START,
        values: [
          { value: 36, timestamp: DAY_START + 220 },
          { value: 35, timestamp: DAY_START + 3600 },
        ],
        last_reading: 35,
      }),
      metric('steps', { day_start_timestamp: DAY_START, total: 5890, values: [{ value: 0, timestamp: DAY_START }] }),
      metric('night_rhr', { avg: 60, values: [{ value: 60, timestamp: DAY_START }] }),
      metric('avg_sleep_hrv', { value: 42, day_start_timestamp: DAY_START }),
      metric('recovery_index', { value: 85 }),
      metric('active_minutes', { value: 27 }),
      metric('vo2_max', { value: 37 }),
      metric('Sleep', {
        bedtime_start: 1782235740,
        bedtime_end: 1782258960,
        sleep_score: { score: 88 },
        total_sleep: { minutes: 377 },
        time_in_bed: { minutes: 387 },
        sleep_efficiency: { percentage: 97 },
        deep_sleep: { minutes: 85 },
        rem_sleep: { minutes: 90 },
        light_sleep: { minutes: 202 },
        full_sleep_cycles: { cycles: 3 },
        sleep_stages: [
          { type: 'deep_sleep', stage_time: 5100 },
          { type: 'awake', stage_time: 720 },
        ],
      }),
    ],
  },
  error: null,
  status: 200,
}

describe('Ultrahuman adapter', () => {
  it('translates the metric_data array into the shared dashboard contract', () => {
    const endpoints = __test.translateUltrahuman({ metrics: payload }, '2026-06-24', 'a@b.com')

    const sleep = endpoints.sleep.sleep[0]
    expect(sleep).toMatchObject({
      minutesAsleep: 377,
      minutesAwake: 12,
      timeInBed: 387,
      sleepScore: 88,
      efficiency: 97,
      isMainSleep: true,
    })
    expect(sleep.levels.summary).toMatchObject({
      deep: { minutes: 85 },
      light: { minutes: 202 },
      rem: { minutes: 90 },
      wake: { minutes: 12 },
    })

    expect(endpoints.heartIntraday['activities-heart'][0].value.restingHeartRate).toBe(60)
    const heartPoints = endpoints.heartIntraday['activities-heart-intraday'].dataset
    expect(heartPoints).toHaveLength(3)
    expect(heartPoints[0]).toEqual({ time: '00:03:40', value: 72 })

    expect(endpoints.stepsTrend['activities-steps'][0].value).toBe(5890)
    expect(endpoints.hrv.hrv[0].value).toMatchObject({ dailyRmssd: 42, nonRemHeartRate: 85 })
    expect(endpoints.skinTemperature.tempSkin[0].value.nightlyTemperatureCelsius).toBe(35.5)
    expect(endpoints.cardio.cardioScore[0].value.vo2Max).toBe('37')
    expect(endpoints.metricTrends.values[0]).toMatchObject({ activeMinutes: 27, hrvMs: 42, cardioScore: 37, sleepEfficiency: 97 })
  })

  it('returns empty datasets when no metrics are present', () => {
    const endpoints = __test.translateUltrahuman({ metrics: { data: { metric_data: [] } } }, '2026-06-24', 'a@b.com')
    expect(endpoints.sleep.sleep).toEqual([])
    expect(endpoints.heartIntraday['activities-heart-intraday'].dataset).toEqual([])
    expect(endpoints.hrv.hrv).toEqual([])
  })
})
