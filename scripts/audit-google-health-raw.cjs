'use strict'

const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const googleHealth = require('../electron/google-health-service.cjs')

app.setName('pulseboard-fitbit-desktop')

const array = (value) => Array.isArray(value) ? value : []
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function readSecure(file) {
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (envelope.encrypted !== true || !safeStorage.isEncryptionAvailable()) throw new Error('Archivio sicuro non disponibile.')
  return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, 'base64')))
}

function atomicWrite(file, content) {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, content, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

function writeSecure(file, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Archivio sicuro non disponibile.')
  const serialized = JSON.stringify(value)
  const envelope = {
    version: 1,
    encrypted: true,
    data: safeStorage.encryptString(serialized).toString('base64'),
  }
  atomicWrite(file, JSON.stringify(envelope))
}

function localIsoToday() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function responseName(url) {
  const parsed = new URL(url)
  const dataType = parsed.pathname.match(/\/dataTypes\/([^/]+)\/([^/]+)/)
  if (dataType) return `${dataType[1]}:${dataType[2]}`
  return parsed.pathname.split('/').filter(Boolean).slice(-2).join('/') || parsed.hostname
}

function collectLeafPaths(value, prefix = '', paths = new Set(), depth = 0) {
  if (depth > 10) return paths
  if (Array.isArray(value)) {
    paths.add(`${prefix}[]`)
    for (const item of value.slice(0, 250)) collectLeafPaths(item, `${prefix}[]`, paths, depth + 1)
    return paths
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectLeafPaths(child, prefix ? `${prefix}.${key}` : key, paths, depth + 1)
    }
    return paths
  }
  paths.add(`${prefix}:${value === null ? 'null' : typeof value}`)
  return paths
}

function dataPoints(captures, type) {
  return captures
    .filter((capture) => capture.name.startsWith(`${type}:`))
    .flatMap((capture) => array(capture.body.dataPoints))
}

function rollupPoints(captures, type) {
  return captures
    .filter((capture) => capture.name.startsWith(`${type}:`))
    .flatMap((capture) => array(capture.body.rollupDataPoints))
}

function civilDate(value) {
  const date = value?.date || value
  if (!date?.year || !date?.month || !date?.day) return null
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function recordForDate(items, selector, date) {
  return array(items).find((item) => civilDate(selector(item)?.date) === date) ?? null
}

app.whenReady().then(async () => {
  try {
    const credentialsPath = path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop', 'credentials.secure.json')
    const credentials = readSecure(credentialsPath)
    if (credentials.config?.provider !== 'google-health' || !credentials.token) throw new Error('Google Health non è collegato.')

    let token = credentials.token
    if (!token.access_token || Number(token.expiresAt || 0) < Date.now() + 90_000) {
      token = await googleHealth.refreshAccessToken(credentials.config, token)
    }

    const captures = []
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input, init) => {
      const response = await originalFetch(input, init)
      const url = typeof input === 'string' ? input : input.url
      if (url.startsWith('https://health.googleapis.com/v4/')) {
        const body = await response.clone().json().catch(() => ({}))
        captures.push({
          name: responseName(url),
          method: init?.method || 'GET',
          status: response.status,
          body,
        })
      }
      return response
    }

    const date = process.argv.find((argument) => /^\d{4}-\d{2}-\d{2}$/.test(argument)) || localIsoToday()
    const translated = await googleHealth.syncData(token.access_token, date)
    globalThis.fetch = originalFetch

    let cacheUpdated = false
    if (process.argv.includes('--update-cache')) {
      const total = Number(translated.requestStats?.total || 0)
      const succeeded = Number(translated.requestStats?.succeeded || 0)
      const successfulKeys = array(translated.requestStats?.successfulKeys)
      const minimumUsefulResponses = Math.max(3, Math.ceil(total * 0.2))
      const measurementKeys = ['stepsDaily', 'caloriesDaily', 'distanceDaily', 'activeMinutesDaily', 'zoneMinutesDaily', 'weightDaily', 'waterDaily', 'nutritionDaily', 'heartIntradayRaw', 'restingHeartRaw', 'hrvRaw', 'spo2Raw', 'breathingRaw', 'skinTemperatureRaw', 'cardioRaw', 'sleepRaw', 'activitiesRaw', 'ecgRaw', 'irnAlertsRaw', 'glucoseRaw']
      const hasMeasurementResponse = successfulKeys.some((key) => measurementKeys.includes(key))
      if (!total || succeeded < minimumUsefulResponses || !hasMeasurementResponse) {
        throw new Error('La sincronizzazione non ha restituito abbastanza sorgenti valide. La cache precedente è stata conservata.')
      }

      const cachePath = path.join(path.dirname(credentialsPath), 'health-cache.secure.json')
      writeSecure(cachePath, translated)
      writeSecure(credentialsPath, { ...credentials, token, lastSyncAt: translated.generatedAt })
      cacheUpdated = true
    }

    const sleepPoints = dataPoints(captures, 'sleep')
    const exercisePoints = dataPoints(captures, 'exercise')
    const activeMinutes = rollupPoints(captures, 'active-minutes')
    const zoneMinutes = rollupPoints(captures, 'active-zone-minutes')
    const hrvPoints = dataPoints(captures, 'daily-heart-rate-variability')
    const oxygenPoints = dataPoints(captures, 'daily-oxygen-saturation')
    const respiratoryPoints = dataPoints(captures, 'daily-respiratory-rate')
    const skinTemperaturePoints = dataPoints(captures, 'daily-sleep-temperature-derivations')

    const groupedResponses = new Map()
    for (const capture of captures) {
      const current = groupedResponses.get(capture.name) || { name: capture.name, pages: 0, dataPoints: 0, rollupDataPoints: 0, fields: new Set() }
      current.pages += 1
      current.dataPoints += array(capture.body.dataPoints).length
      current.rollupDataPoints += array(capture.body.rollupDataPoints).length
      collectLeafPaths(capture.body).forEach((field) => current.fields.add(field))
      groupedResponses.set(capture.name, current)
    }

    const currentSleep = sleepPoints.find((point) => point.sleep?.interval?.endTime?.slice(0, 10) === date) ?? null
    const currentHrv = recordForDate(hrvPoints, (point) => point.dailyHeartRateVariability, date)
    const currentOxygen = recordForDate(oxygenPoints, (point) => point.dailyOxygenSaturation, date)
    const currentRespiratory = recordForDate(respiratoryPoints, (point) => point.dailyRespiratoryRate, date)
    const currentSkinTemperature = recordForDate(skinTemperaturePoints, (point) => point.dailySleepTemperatureDerivations, date)
    const currentActiveMinutes = activeMinutes.find((point) => civilDate(point.civilStartTime) === date) ?? null
    const currentZoneMinutes = zoneMinutes.find((point) => civilDate(point.civilStartTime) === date) ?? null

    const responseGroups = [...groupedResponses.values()].map((group) => ({
      name: group.name,
      pages: group.pages,
      dataPoints: group.dataPoints,
      rollupDataPoints: group.rollupDataPoints,
      fieldCount: group.fields.size,
    })).sort((left, right) => left.name.localeCompare(right.name))

    const summary = {
      date,
      cacheUpdated,
      requests: {
        jobs: translated.requestStats.total,
        succeeded: translated.requestStats.succeeded,
        failed: translated.errors.length,
        httpResponses: captures.length,
      },
      nonEmptyResponses: responseGroups.filter((group) => group.dataPoints || group.rollupDataPoints || group.fieldCount),
      emptyResponses: responseGroups.filter((group) => !group.dataPoints && !group.rollupDataPoints && !group.fieldCount).map((group) => group.name),
      currentRawValues: {
        sleep: currentSleep ? {
          type: currentSleep.sleep?.type ?? null,
          metadata: object(currentSleep.sleep?.metadata),
          summary: object(currentSleep.sleep?.summary),
          stageSegmentCount: array(currentSleep.sleep?.stages).length,
        } : null,
        activeMinuteLevels: array(currentActiveMinutes?.activeMinutes?.activeMinutesRollupByActivityLevel),
        activeZoneMinuteBuckets: object(currentZoneMinutes?.activeZoneMinutes),
        hrv: object(currentHrv?.dailyHeartRateVariability),
        oxygenSaturation: object(currentOxygen?.dailyOxygenSaturation),
        respiratoryRate: object(currentRespiratory?.dailyRespiratoryRate),
        skinTemperature: object(currentSkinTemperature?.dailySleepTemperatureDerivations),
      },
      implementedRawFieldCoverage: {
        sleepStageTimelineSegments: array(currentSleep?.sleep?.stages).length,
        sleepStageTransitionCounts: array(currentSleep?.sleep?.summary?.stagesSummary).map((stage) => ({ type: stage.type, count: stage.count })),
        minutesToFallAsleep: currentSleep?.sleep?.summary?.minutesToFallAsleep ?? null,
        minutesAfterWakeUp: currentSleep?.sleep?.summary?.minutesAfterWakeUp ?? null,
        hrvDeepSleepRmssd: currentHrv?.dailyHeartRateVariability?.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds ?? null,
        hrvEntropy: currentHrv?.dailyHeartRateVariability?.entropy ?? null,
        nonRemHeartRate: currentHrv?.dailyHeartRateVariability?.nonRemHeartRateBeatsPerMinute ?? null,
        oxygenLowerBound: currentOxygen?.dailyOxygenSaturation?.lowerBoundPercentage ?? null,
        oxygenUpperBound: currentOxygen?.dailyOxygenSaturation?.upperBoundPercentage ?? null,
        skinNightlyTemperature: currentSkinTemperature?.dailySleepTemperatureDerivations?.nightlyTemperatureCelsius ?? null,
        skinBaselineTemperature: currentSkinTemperature?.dailySleepTemperatureDerivations?.baselineTemperatureCelsius ?? null,
        skinRelativeStddev30d: currentSkinTemperature?.dailySleepTemperatureDerivations?.relativeNightlyStddev30dCelsius ?? null,
        exerciseSteps: exercisePoints.map((point) => point.exercise?.metricsSummary?.steps ?? null),
        exerciseAveragePaceSecondsPerMeter: exercisePoints.map((point) => point.exercise?.metricsSummary?.averagePaceSecondsPerMeter ?? null),
        exerciseHeartRateZoneDurations: exercisePoints.map((point) => object(point.exercise?.metricsSummary?.heartRateZoneDurations)),
      },
    }

    if (process.argv.includes('--summary')) {
      console.log(JSON.stringify(summary, null, 2))
      app.quit()
      return
    }

    const report = {
      date,
      requests: {
        expected: translated.requestStats.total,
        succeeded: translated.requestStats.succeeded,
        failed: translated.errors.map((error) => ({ key: error.key, status: error.status ?? null })),
        capturedGoogleResponses: captures.length,
      },
      rawResponseInventory: captures
        .map((capture) => ({
          name: capture.name,
          method: capture.method,
          status: capture.status,
          dataPoints: array(capture.body.dataPoints).length,
          rollupDataPoints: array(capture.body.rollupDataPoints).length,
          topLevelFields: Object.keys(object(capture.body)).sort(),
          leafPaths: [...collectLeafPaths(capture.body)].sort(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      rawHighlights: {
        sleep: sleepPoints.map((point) => ({
          pointFields: Object.keys(object(point)).sort(),
          sleepFields: Object.keys(object(point.sleep)).sort(),
          metadata: object(point.sleep?.metadata),
          summary: object(point.sleep?.summary),
          stageSegmentCount: array(point.sleep?.stages).length,
        })),
        activeMinuteLevels: activeMinutes.map((point) => array(point.activeMinutes?.activeMinutesRollupByActivityLevel)),
        activeZoneMinuteBuckets: zoneMinutes.map((point) => object(point.activeZoneMinutes)),
        exercises: exercisePoints.map((point) => ({
          fields: Object.keys(object(point.exercise)).sort(),
          type: point.exercise?.exerciseType ?? null,
          displayName: point.exercise?.displayName ?? null,
          metricsSummary: object(point.exercise?.metricsSummary),
          hasRouteOrLocation: Boolean(point.exercise?.route || point.exercise?.location || point.exercise?.laps),
        })),
        hrv: hrvPoints.map((point) => object(point.dailyHeartRateVariability)),
        oxygenSaturation: oxygenPoints.map((point) => object(point.dailyOxygenSaturation)),
        respiratoryRate: respiratoryPoints.map((point) => object(point.dailyRespiratoryRate)),
        skinTemperature: skinTemperaturePoints.map((point) => object(point.dailySleepTemperatureDerivations)),
      },
      summary,
    }

    console.log(JSON.stringify(report, null, 2))
    app.quit()
  } catch (error) {
    console.error(error.stack || error.message)
    app.exit(1)
  }
})
