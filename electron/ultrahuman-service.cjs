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
  // The Ultrahuman Personal API expects the token sent verbatim in the
  // Authorization header — NOT prefixed with "Bearer". Adding the prefix makes
  // the API respond 401 "Incorrect Personal API Token Provided", which surfaces
  // to the user as a bogus "authorization is no longer valid" error.
  const headers = {
    authorization: apiKey,
    accept: 'application/json',
  }
  if (partnerCode) headers['partner-code'] = partnerCode
  const response = await fetchWithTimeout(`${API_BASE}${path}`, { headers })
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
    endpoints: translateUltrahuman(endpoints, selectedDate, email),
    errors,
    rateLimit: { limit: 300, remaining: null, resetSeconds: 60 },
    requestStats: { total: jobs.length, succeeded: Object.keys(endpoints).length, successfulKeys: Object.keys(endpoints) },
  }
}

// The Ultrahuman Personal API returns every metric as an entry in a single
// `data.metric_data` array, keyed by `type`. Index it so we can look metrics up
// by name instead of walking the array repeatedly.
function indexByType(metricData) {
  const map = {}
  for (const item of Array.isArray(metricData) ? metricData : []) {
    if (item && item.type) map[item.type] = item.object || {}
  }
  return map
}

function isoFromUnix(seconds) {
  const value = Number(seconds)
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null
}

// Ultrahuman timestamps are absolute unix seconds; `day_start_timestamp` marks
// the user's local midnight, so the offset between the two yields the local
// clock time ("HH:MM:SS") without needing a timezone database.
function clockFromOffset(timestamp, dayStart) {
  const secondsIntoDay = ((Math.round(Number(timestamp) - Number(dayStart)) % 86400) + 86400) % 86400
  const hours = Math.floor(secondsIntoDay / 3600)
  const minutes = Math.floor((secondsIntoDay % 3600) / 60)
  const seconds = secondsIntoDay % 60
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function intradayDataset(metric) {
  if (!metric || !Array.isArray(metric.values)) return []
  const dayStart = Number(metric.day_start_timestamp) || 0
  return metric.values
    .filter((point) => point && Number.isFinite(Number(point.value)) && Number.isFinite(Number(point.timestamp)))
    .map((point) => ({ time: clockFromOffset(point.timestamp, dayStart), value: Number(point.value) }))
}

function averageOfValues(metric) {
  const numbers = (metric && Array.isArray(metric.values) ? metric.values : [])
    .map((point) => Number(point.value))
    .filter((value) => Number.isFinite(value))
  if (!numbers.length) return null
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10
}

function translateUltrahuman(raw, selectedDate, email) {
  const byType = indexByType(raw?.metrics?.data?.metric_data)

  // Sleep mapping — each summary field is a small object (e.g. {minutes: 377}).
  const sleepObj = byType.Sleep || {}
  const sleepScore = numeric(sleepObj.sleep_score?.score)
  const totalSleepMinutes = numeric(sleepObj.total_sleep?.minutes)
  const timeInBedMinutes = numeric(sleepObj.time_in_bed?.minutes)
  const deepSleepMinutes = numeric(sleepObj.deep_sleep?.minutes)
  const remSleepMinutes = numeric(sleepObj.rem_sleep?.minutes)
  const lightSleepMinutes = numeric(sleepObj.light_sleep?.minutes)
  const efficiency = numeric(sleepObj.sleep_efficiency?.percentage)
  const noOfCompleteCycles = numeric(sleepObj.full_sleep_cycles?.cycles)
  const sleepStartTime = isoFromUnix(sleepObj.bedtime_start)
  const sleepEndTime = isoFromUnix(sleepObj.bedtime_end)
  const awakeStage = (Array.isArray(sleepObj.sleep_stages) ? sleepObj.sleep_stages : [])
    .find((stage) => stage.type === 'awake')
  const awakeMinutes = awakeStage
    ? Math.round(numeric(awakeStage.stage_time) / 60)
    : (timeInBedMinutes !== null && totalSleepMinutes !== null ? timeInBedMinutes - totalSleepMinutes : null)
  const timeInBed = timeInBedMinutes ?? (totalSleepMinutes !== null && awakeMinutes !== null
    ? totalSleepMinutes + awakeMinutes
    : null)

  const selectedSleep = totalSleepMinutes !== null ? {
    logId: `sleep-${selectedDate}`,
    dateOfSleep: selectedDate,
    isMainSleep: true,
    minutesAsleep: totalSleepMinutes,
    minutesAwake: awakeMinutes,
    minutesToFallAsleep: null,
    minutesAfterWakeUp: null,
    timeInBed,
    sleepScore,
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

  // HRV — prefer the nightly sleep HRV; fall back to the daytime average.
  const hrvValue = numeric(byType.avg_sleep_hrv?.value) ?? numeric(byType.hrv?.avg)
  const recoveryIndex = numeric(byType.recovery_index?.value)

  // Heart rate — resting HR comes from the sleep-time average.
  const restingHr = numeric(byType.night_rhr?.avg) ?? numeric(byType.sleep_rhr?.value)

  // Activity. The Personal API exposes no calories metric, so leave it null.
  const steps = numeric(byType.steps?.total)
  const activeMinutes = numeric(byType.active_minutes?.value)
  const caloriesOut = null

  // Temperature — average the skin-temperature samples for the day.
  const skinTempAvg = averageOfValues(byType.temp) ?? numeric(byType.temp?.last_reading)
  const vo2Max = numeric(byType.vo2_max?.value)

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
    stepsIntraday: { 'activities-steps-intraday': { dataset: intradayDataset(byType.steps) } },
    caloriesIntraday: { 'activities-calories-intraday': { dataset: [] } },
    heartIntraday: {
      'activities-heart': restingHr !== null
        ? [{ dateTime: selectedDate, value: { restingHeartRate: restingHr } }]
        : [],
      'activities-heart-intraday': { dataset: intradayDataset(byType.hr) },
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
      cardioScore: vo2Max,
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
    hrv: { hrv: hrvValue !== null || recoveryIndex !== null ? [{
      dateTime: selectedDate,
      value: {
        dailyRmssd: hrvValue,
        deepRmssd: null,
        entropy: null,
        nonRemHeartRate: recoveryIndex,
      },
    }] : [] },
    spo2: {},
    skinTemperature: { tempSkin: skinTempAvg !== null ? [{ dateTime: selectedDate, value: {
      nightlyRelative: null,
      nightlyTemperatureCelsius: skinTempAvg,
      baselineTemperatureCelsius: null,
      relativeNightlyStddev30dCelsius: null,
    } }] : [] },
    coreTemperature: { tempCore: [] },
    cardio: { cardioScore: vo2Max !== null
      ? [{ dateTime: selectedDate, value: { vo2Max: String(vo2Max) } }]
      : [] },
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
