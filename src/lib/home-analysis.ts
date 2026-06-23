import type { DashboardData, TrendPoint } from '@/types'

export interface BaselineComparison {
  current: number | null
  baseline: number | null
  difference: number | null
  percentChange: number | null
  sampleCount: number
}

export interface HomeAnalysis {
  headline: {
    category: 'activity' | 'heart' | 'sleep' | 'recovery'
    eyebrow: string
    title: string
    body: string
  }
  stepsGoalProgress: number | null
  stepsPeriodDelta: number | null
  sleepGoalDifference: number | null
  steps: BaselineComparison
  sleep: BaselineComparison
  restingHeartRate: BaselineComparison
  hrv: BaselineComparison
  breathingRate: BaselineComparison
  spo2: BaselineComparison
  sync: {
    succeeded: number
    total: number
    isPartial: boolean
    lastDeviceSyncAt: string | null
    isStale: boolean
  }
}

function finite(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function percentChange(current: number | null, baseline: number | null) {
  if (current === null || baseline === null || baseline === 0) return null
  return (current - baseline) / baseline * 100
}

export function compareWithPersonalBaseline(
  data: DashboardData,
  current: number | null,
  selector: (point: TrendPoint) => number | null,
  lookback = 7,
): BaselineComparison {
  const values = finite(data.trends
    .filter((point) => point.date < data.selectedDate)
    .slice(-lookback)
    .map(selector))
  const baseline = mean(values)
  return {
    current,
    baseline,
    difference: current === null || baseline === null ? null : current - baseline,
    percentChange: percentChange(current, baseline),
    sampleCount: values.length,
  }
}

export function periodDelta(values: Array<number | null>) {
  const prior = finite(values.slice(-14, -7))
  const recent = finite(values.slice(-7))
  if (prior.length < 3 || recent.length < 3) return null
  const priorMean = mean(prior)
  const recentMean = mean(recent)
  return percentChange(recentMean, priorMean)
}

function minutesText(minutes: number) {
  const absolute = Math.abs(Math.round(minutes))
  const hours = Math.floor(absolute / 60)
  const remainder = absolute % 60
  if (!hours) return `${remainder} min`
  if (!remainder) return `${hours} h`
  return `${hours} h ${remainder} min`
}

function localIsoToday() {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60_000
  return new Date(today.getTime() - offset).toISOString().slice(0, 10)
}

export function analyzeHome(data: DashboardData): HomeAnalysis {
  const steps = compareWithPersonalBaseline(data, data.activity.steps, (point) => point.steps)
  const sleep = compareWithPersonalBaseline(data, data.sleep.totalMinutes, (point) => point.sleepMinutes)
  const restingHeartRate = compareWithPersonalBaseline(data, data.health.restingHeartRate, (point) => point.restingHeartRate)
  const hrv = compareWithPersonalBaseline(data, data.health.hrvMs, (point) => point.hrvMs)
  const breathingRate = compareWithPersonalBaseline(data, data.health.breathingRate, (point) => point.breathingRate)
  const spo2 = compareWithPersonalBaseline(data, data.health.spo2, (point) => point.spo2)
  const selectedDateIsToday = data.selectedDate === localIsoToday()
  const stepsGoalProgress = data.activity.steps !== null && data.activity.stepsGoal !== null && data.activity.stepsGoal > 0
    ? data.activity.steps / data.activity.stepsGoal
    : null
  const sleepGoalDifference = data.sleep.totalMinutes !== null && data.sleep.goalMinutes !== null && data.sleep.goalMinutes > 0
    ? data.sleep.totalMinutes - data.sleep.goalMinutes
    : null
  const stepsPeriodDelta = selectedDateIsToday ? null : periodDelta(data.trends.map((point) => point.steps))
  const lastDeviceSyncAt = data.device?.lastSyncTime ?? null
  const freshnessTime = lastDeviceSyncAt ? new Date(lastDeviceSyncAt).getTime() : new Date(data.generatedAt).getTime()
  const isStale = selectedDateIsToday && Number.isFinite(freshnessTime) && Date.now() - freshnessTime > 6 * 60 * 60 * 1000
  const isPartial = data.sync.successCount < data.sync.endpointCount

  let headline: HomeAnalysis['headline'] = {
    category: 'recovery',
    eyebrow: 'Daily overview',
    title: 'The metrics that matter, with context',
    body: 'Compare the selected day with your goals and recent average.',
  }

  if ((data.health.irregularRhythmAlerts ?? 0) > 0) {
    headline = {
      category: 'heart',
      eyebrow: 'Needs attention',
      title: 'An irregular rhythm alert is present in the synced period',
      body: 'Open Health to view the available data. Pulseboard does not interpret the alert as a diagnosis or assume it belongs to the selected day.',
    }
  } else if (isPartial || isStale) {
    headline = {
      category: 'recovery',
      eyebrow: isStale ? 'Data needs updating' : 'Partial coverage',
      title: isStale ? 'The device sync is not recent' : 'Some measurements may be missing',
      body: isStale
        ? 'Update the data before interpreting measurements from the selected day.'
        : `${data.sync.successCount} of ${data.sync.endpointCount} API reads completed; the available sections remain usable.`,
    }
  } else if (sleepGoalDifference !== null && sleepGoalDifference <= -60) {
    headline = {
      category: 'sleep',
      eyebrow: 'Today’s priority',
      title: 'Sleep is the metric to improve',
      body: `You slept ${minutesText(sleepGoalDifference)} less than your personal goal. Look at the trend before judging a single night.`,
    }
  } else if (restingHeartRate.difference !== null && restingHeartRate.sampleCount >= 4 && restingHeartRate.difference >= 4) {
    headline = {
      category: 'heart',
      eyebrow: 'Personal variation',
      title: 'Resting heart rate is above your recent average',
      body: `The difference is ${Math.round(restingHeartRate.difference)} bpm compared with the previous ${restingHeartRate.sampleCount} days with data.`,
    }
  } else if (stepsGoalProgress !== null && stepsGoalProgress >= 1) {
    headline = {
      category: 'activity',
      eyebrow: 'Goal reached',
      title: 'Movement is today’s strong point',
      body: `You exceeded your personal goal of ${data.activity.stepsGoal?.toLocaleString('en-US')} steps.`,
    }
  } else if (sleepGoalDifference !== null && sleepGoalDifference >= -30 && restingHeartRate.difference !== null && restingHeartRate.sampleCount >= 4 && Math.abs(restingHeartRate.difference) < 3) {
    headline = {
      category: 'recovery',
      eyebrow: 'Personal context',
      title: 'Sleep and heart rate are close to your baselines',
      body: 'The overview shows no major differences from the available baselines; keep watching the trend over time.',
    }
  }

  return {
    headline,
    stepsGoalProgress,
    stepsPeriodDelta,
    sleepGoalDifference,
    steps,
    sleep,
    restingHeartRate,
    hrv,
    breathingRate,
    spo2,
    sync: {
      succeeded: data.sync.successCount,
      total: data.sync.endpointCount,
      isPartial,
      lastDeviceSyncAt,
      isStale,
    },
  }
}
