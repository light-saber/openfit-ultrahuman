'use strict'

const API_BASE = 'https://partner.ultrahuman.com/api/v1'

let nextApiRequestAt = 0

function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

async function waitForApiSlot() {
  const now = Date.now()
  const slot = Math.max(now, nextApiRequestAt)
  nextApiRequestAt = slot + 225
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now))
}

async function request(path, apiKey, partnerCode) {
  await waitForApiSlot()
  const response = await fetchWithTimeout(`${API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      'partner-code': partnerCode,
      accept: 'application/json',
    },
  })
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 30_000))
    return request(path, apiKey, partnerCode)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload?.message || `UltraSignal ha risposto ${response.status}.`)
    error.status = response.status
    throw error
  }
  return payload
}

function shiftIso(value, days) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12))
  return date.toISOString().slice(0, 10)
}

function numeric(value, transform = (number) => number) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? transform(parsed) : null
}

async function syncUltrahumanData(config, selectedDate, onProgress = () => {}) {
  const { apiKey, partnerCode = 'UDUCCTPQ', email } = config
  const dayAfter = shiftIso(selectedDate, 1)
  const trendStart = shiftIso(selectedDate, -13)

  const jobs = [
    ['metrics', () => request(`/metrics?email=${encodeURIComponent(email)}&date=${selectedDate}`, apiKey, partnerCode)],
  ]
  const endpoints = {}
  const errors = []
  let completed = 0

  await Promise.all(jobs.map(async ([key, run]) => {
    try {
      endpoints[key] = await run()
    } catch (error) {
      errors.push({ key, message: error.message || 'Source unavailable', status: error.status })
    } finally {
      completed += 1
      onProgress({ completed, total: jobs.length, key })
    }
  }))

  if (errors.some((error) => error.status === 401)) {
    throw new Error('The UltraSignal authorization is no longer valid. Reconnect the account.')
  }

  return {
    source: 'ultrahuman',
    date: selectedDate,
    generatedAt: new Date().toISOString(),
    endpoints: translateUltrahuman(endpoints, selectedDate),
    errors,
    rateLimit: { limit: 300, remaining: null, resetSeconds: 60 },
    requestStats: { total: jobs.length, succeeded: Object.keys(endpoints).length, successfulKeys: Object.keys(endpoints) },
  }
}

function translateUltrahuman(raw, selectedDate) {
  const metrics = raw.metrics || {}

  const sleepData = metrics.sleep_data || {}
  const hrvData = metrics.hrv_data || {}
  const heartRate = metrics.heart_rate || {}
  const activity = metrics.activity || {}
  const temperature = metrics.temperature || {}

  // Sleep mapping
  const sleepScore = numeric(sleepData.sleep_score)
  const totalSleepMinutes = numeric(sleepData.total_sleep)
  const deepSleepMinutes = numeric(sleepData.deep_sleep_minutes)
  const remSleepMinutes = numeric(sleepData.rem_sleep_minutes)
  const lightSleepMinutes = numeric(sleepData.light_sleep_minutes)
  const awakeMinutes = numeric(sleepData.awake_time_minutes)
  const sleepStartTime = sleepData.sleep_start_time || null
  const sleepEndTime = sleepData.sleep_end_time || null
  const noOfCompleteCycles = numeric(sleepData.no_of_complete_cycles)

  // Calculate efficiency: sleep_score serves as efficiency percentage
  const sleepPeriod = totalSleepMinutes !== null && awakeMinutes !== null
    ? totalSleepMinutes + (awakeMinutes || 0)
    : null
  const efficiency = sleepScore !== null
    ? sleepScore
    : (sleepPeriod && sleepPeriod > 0 && totalSleepMinutes !== null)
      ? Math.round(totalSleepMinutes / sleepPeriod * 100)
      : null

  const selectedSleep = totalSleepMinutes !== null ? {
    logId: sleepData.id || `sleep-${selectedDate}`,
    dateOfSleep: selectedDate,
    isMainSleep: true,
    minutesAsleep: totalSleepMinutes,
    minutesAwake: awakeMinutes,
    minutesToFallAsleep: null,
    minutesAfterWakeUp: null,
    timeInBed: sleepPeriod,
    efficiency,
    startTime: sleepStartTime,
    endTime: sleepEndTime,
    levels: {
      summary: {
        deep: { minutes: deepSleepMinutes ?? 0, count: noOfCompleteCycles },
        light: { minutes: lightSleepMinutes ?? 0, count: null },
        rem: { minutes: remSleepMinutes ?? 0, count: null },
        wake: { minutes: awakeMinutes ?? 0, count: null },
      },
      data: [],
    },
  } : null

  // HRV mapping
  const hrvValue = numeric(hrvData.hrv_value)
  const recoveryIndex = numeric(hrvData.recovery_index)

  // Heart rate mapping
  const restingHr = numeric(heartRate.resting_hr)

  // Activity mapping
  const steps = numeric(activity.total_steps)
  const caloriesOut = numeric(activity.total_calories_burned)
  const activeMinutes = numeric(activity.active_minutes)

  // Temperature mapping
  const skinTempAvg = numeric(temperature.skin_temp_avg_celsius)

  return {
    profile: { user: { displayName: email || 'Atleta', avatar640: null, memberSince: null, timezone: null } },
    devices: [],
    activity: {
      summary: {
        steps,
        caloriesOut,
        distances: [{ activity: 'total', distance: null }],
        floors: null,
        lightlyActiveMinutes: null,
        fairlyActiveMinutes: null,
        veryActiveMinutes: activeMinutes,
        activeZoneMinutes: { totalMinutes: null },
        sedentaryMinutes: null,
      },
    },
    activityGoals: { goals: {} },
    stepsIntraday: { 'activities-steps-intraday': { dataset: [] } },
    caloriesIntraday: { 'activities-calories-intraday': { dataset: [] } },
    heartIntraday: {
      'activities-heart': restingHr !== null
        ? [{ dateTime: selectedDate, value: { restingHeartRate: restingHr } }]
        : [],
      'activities-heart-intraday': { dataset: [] },
    },
    sleep: { sleep: selectedSleep ? [selectedSleep] : [] },
    sleepTrend: { sleep: selectedSleep ? [selectedSleep] : [] },
    sleepGoal: { goal: {} },
    stepsTrend: { 'activities-steps': steps !== null ? [{ dateTime: selectedDate, value: steps }] : [] },
    caloriesTrend: { 'activities-calories': caloriesOut !== null ? [{ dateTime: selectedDate, value: caloriesOut }] : [] },
    heartTrend: { 'activities-heart': restingHr !== null ? [{ dateTime: selectedDate, value: { restingHeartRate: restingHr } }] : [] },
    metricTrends: { values: [{
      dateTime: selectedDate,
      distanceKm: null,
      floors: null,
      activeMinutes,
      zoneMinutes: null,
      sedentaryMinutes: null,
      hrvMs: hrvValue,
      breathingRate: null,
      spo2: null,
      skinTemperature: skinTempAvg,
      coreTemperature: null,
      cardioScore: null,
      sleepEfficiency: efficiency,
      bodyFat: null,
      waterMl: null,
      caloriesIn: null,
    }] },
    bodyWeight: { weight: [] },
    bodyFat: { fat: [] },
    weightGoal: { goal: {} },
    water: { summary: { water: null } },
    waterGoal: { goal: {} },
    food: { summary: { calories: null } },
    breathing: { br: [] },
    hrv: hrvValue !== null || recoveryIndex !== null ? [{
      dateTime: selectedDate,
      value: {
        dailyRmssd: hrvValue,
        deepRmssd: null,
        entropy: null,
        nonRemHeartRate: recoveryIndex,
      },
    }] : [],
    spo2: {},
    skinTemperature: skinTempAvg !== null ? [{ dateTime: selectedDate, value: {
      nightlyRelative: null,
      nightlyTemperatureCelsius: skinTempAvg,
      baselineTemperatureCelsius: null,
      relativeNightlyStddev30dCelsius: null,
    } }] : [],
    coreTemperature: { tempCore: [] },
    cardio: { cardioScore: [] },
    ecg: { ecgReadings: [] },
    activities: { activities: [] },
    identity: {},
    irregularRhythm: {},
    bloodGlucose: {},
  }
}

module.exports = {
  provider: 'ultrahuman',
  scopes: [],
  createPkce: null,
  createAuthorizationUrl: null,
  exchangeAuthorizationCode: null,
  refreshAccessToken: null,
  revokeToken: null,
  syncData: syncUltrahumanData,
  __test: { translateUltrahuman },
}
