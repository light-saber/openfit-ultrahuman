'use strict'

const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const array = (value) => Array.isArray(value) ? value : []
const object = (value) => value && typeof value === 'object' ? value : {}
const available = (value) => value !== null && value !== undefined && value !== ''
const countValues = (items, selector) => array(items).filter((item) => available(selector(item))).length

// When Electron is launched with this standalone script, it otherwise uses
// the generic "Electron" identity and cannot decrypt Pulseboard's safeStorage.
app.setName('pulseboard-fitbit-desktop')

app.whenReady().then(() => {
  const cachePath = path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop', 'health-cache.secure.json')
  if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(cachePath)) {
    console.error('Cache cifrata non disponibile.')
    app.exit(1)
    return
  }

  try {
    const envelope = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    if (envelope.encrypted !== true) throw new Error('La cache non è cifrata.')
    const payload = JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, 'base64')))
    const endpoints = object(payload.endpoints)
    const activity = object(object(endpoints.activity).summary)
    const devices = array(endpoints.devices)
    const sleep = array(object(endpoints.sleep).sleep)
    const stepsTrend = array(object(endpoints.stepsTrend)['activities-steps'])
    const caloriesTrend = array(object(endpoints.caloriesTrend)['activities-calories'])
    const heartTrend = array(object(endpoints.heartTrend)['activities-heart'])
    const sleepTrend = array(object(endpoints.sleepTrend).sleep)
    const metricTrends = array(object(endpoints.metricTrends).values)
    const heartRoot = object(endpoints.heartIntraday)
    const heartToday = array(heartRoot['activities-heart'])[0]?.value || {}
    const heartIntraday = array(object(heartRoot['activities-heart-intraday']).dataset)
    const stepsIntraday = array(object(object(endpoints.stepsIntraday)['activities-steps-intraday']).dataset)
    const activities = array(object(endpoints.activities).activities)
    const weight = array(object(endpoints.bodyWeight).weight)
    const fat = array(object(endpoints.bodyFat).fat)
    const hrv = array(object(endpoints.hrv).hrv)
    const breathing = array(object(endpoints.breathing).br)
    const skinTemperature = array(object(endpoints.skinTemperature).tempSkin)
    const coreTemperature = array(object(endpoints.coreTemperature).tempCore)
    const cardio = array(object(endpoints.cardio).cardioScore)
    const ecg = array(object(endpoints.ecg).ecgReadings)
    const glucose = array(object(endpoints.bloodGlucose).dataPoints)
    const irregular = object(endpoints.irregularRhythm)
    const detailed = process.argv.includes('--details')

    const report = {
      source: payload.source,
      selectedDate: payload.date,
      sync: {
        requested: payload.requestStats?.total ?? null,
        succeeded: payload.requestStats?.succeeded ?? null,
        failedKeys: array(payload.errors).map((error) => ({ key: error.key, status: error.status ?? null })),
      },
      availability: {
        device: devices.length > 0,
        activity: {
          steps: available(activity.steps),
          calories: available(activity.caloriesOut),
          distance: available(array(activity.distances).find((item) => item.activity === 'total')?.distance),
          floors: available(activity.floors),
          activeMinutes: available(activity.fairlyActiveMinutes) || available(activity.veryActiveMinutes),
          zoneMinutes: available(object(activity.activeZoneMinutes).totalMinutes),
          sedentaryMinutes: available(activity.sedentaryMinutes),
          stepsIntradayPoints: stepsIntraday.length,
          recentActivities: activities.length,
          activityCalories: countValues(activities, (item) => item.calories),
          activityDistance: countValues(activities, (item) => item.distance),
          activityAverageHeartRate: countValues(activities, (item) => item.averageHeartRate),
          activityZoneMinutes: countValues(activities, (item) => object(item.activeZoneMinutes).totalMinutes),
          moderateMinutes: available(activity.fairlyActiveMinutes),
          vigorousMinutes: available(activity.veryActiveMinutes),
        },
        heart: {
          intradayPoints: heartIntraday.length,
          restingRate: available(heartToday.restingHeartRate),
          hrvRecords: hrv.length,
          cardioRecords: cardio.length,
          ecgRecords: ecg.length,
          irregularRhythmRecords: array(object(irregular.alerts).dataPoints).length,
        },
        overnight: {
          sleepRecords: sleep.length,
          sleepStageGroups: sleep[0] ? Object.keys(object(object(sleep[0].levels).summary)).length : 0,
          spo2: available(object(endpoints.spo2).value?.avg),
          breathingRecords: breathing.length,
          skinTemperatureRecords: skinTemperature.length,
          coreTemperatureRecords: coreTemperature.length,
        },
        body: {
          weightRecords: weight.length,
          fatRecords: fat.length,
          water: available(object(object(endpoints.water).summary).water),
          nutrition: available(object(object(endpoints.food).summary).calories),
          glucoseRecords: glucose.length,
        },
        trends: {
          days: Math.max(stepsTrend.length, caloriesTrend.length, heartTrend.length, sleepTrend.length, metricTrends.length),
          metricTrendRows: metricTrends.length,
          stepsDays: countValues(stepsTrend, (item) => item.value),
          caloriesDays: countValues(caloriesTrend, (item) => item.value),
          restingHeartDays: countValues(heartTrend, (item) => object(item.value).restingHeartRate),
          sleepDurationDays: countValues(sleepTrend, (item) => item.minutesAsleep),
          sleepEfficiencyDays: countValues(sleepTrend, (item) => item.efficiency),
          distanceDays: countValues(metricTrends, (item) => item.distanceKm),
          activeMinutesDays: countValues(metricTrends, (item) => item.activeMinutes),
          zoneMinutesDays: countValues(metricTrends, (item) => item.zoneMinutes),
          sedentaryMinutesDays: countValues(metricTrends, (item) => item.sedentaryMinutes),
          hrvDays: countValues(metricTrends, (item) => item.hrvMs),
          breathingDays: countValues(metricTrends, (item) => item.breathingRate),
          spo2Days: countValues(metricTrends, (item) => item.spo2),
          skinTemperatureDays: countValues(metricTrends, (item) => item.skinTemperature),
          coreTemperatureDays: countValues(metricTrends, (item) => item.coreTemperature),
          cardioDays: countValues(metricTrends, (item) => item.cardioScore),
          metricSleepEfficiencyDays: countValues(metricTrends, (item) => item.sleepEfficiency),
          bodyFatDays: countValues(metricTrends, (item) => item.bodyFat),
          waterDays: countValues(metricTrends, (item) => item.waterMl),
          nutritionDays: countValues(metricTrends, (item) => item.caloriesIn),
        },
      },
    }

    if (detailed) {
      const sleepRecord = sleep[0] || null
      const sleepSummary = object(object(sleepRecord).levels).summary
      const latest = (items) => array(items).at(-1) ?? null
      const heartValues = heartIntraday.map((point) => Number(point.value)).filter(Number.isFinite)

      report.details = {
        activity: {
          steps: activity.steps ?? null,
          caloriesOut: activity.caloriesOut ?? null,
          distanceKm: array(activity.distances).find((item) => item.activity === 'total')?.distance ?? null,
          floors: activity.floors ?? null,
          moderateMinutes: activity.fairlyActiveMinutes ?? null,
          vigorousMinutes: activity.veryActiveMinutes ?? null,
          activeMinutesTotal: [activity.fairlyActiveMinutes, activity.veryActiveMinutes]
            .filter(available).reduce((sum, value) => sum + Number(value || 0), 0),
          activeZoneMinutes: object(activity.activeZoneMinutes).totalMinutes ?? null,
          sedentaryMinutes: activity.sedentaryMinutes ?? null,
          stepsIntradayPoints: stepsIntraday.length,
        },
        heart: {
          latestBeatsPerMinute: latest(heartIntraday)?.value ?? null,
          minimumBeatsPerMinute: heartValues.length ? Math.min(...heartValues) : null,
          maximumBeatsPerMinute: heartValues.length ? Math.max(...heartValues) : null,
          restingBeatsPerMinute: heartToday.restingHeartRate ?? null,
          hrvMilliseconds: latest(hrv)?.value?.dailyRmssd ?? latest(hrv)?.value?.deepRmssd ?? null,
          oxygenSaturationPercent: object(endpoints.spo2).value?.avg ?? null,
          respiratoryRate: latest(breathing)?.value?.breathingRate ?? null,
          skinTemperatureDeltaCelsius: latest(skinTemperature)?.value?.nightlyRelative ?? null,
          coreTemperatureCelsius: latest(coreTemperature)?.value?.coreTemperature ?? null,
          vo2Max: latest(cardio)?.value?.vo2Max ?? null,
          ecgClassifications: ecg.map((item) => item.resultClassification).filter(Boolean),
          irregularRhythmAlerts: array(object(irregular.alerts).dataPoints).length,
          bloodGlucoseRecords: glucose.length,
        },
        sleep: sleepRecord ? {
          date: sleepRecord.dateOfSleep ?? null,
          isMainSleep: sleepRecord.isMainSleep ?? null,
          minutesAsleep: sleepRecord.minutesAsleep ?? null,
          minutesAwake: sleepRecord.minutesAwake ?? null,
          timeInBedMinutes: sleepRecord.timeInBed ?? null,
          efficiencyPercent: sleepRecord.efficiency ?? null,
          sleepScore: sleepRecord.sleepScore ?? null,
          startTime: sleepRecord.startTime ?? null,
          endTime: sleepRecord.endTime ?? null,
          stagesMinutes: Object.fromEntries(Object.entries(object(sleepSummary)).map(([key, value]) => [key, object(value).minutes ?? null])),
        } : null,
        body: {
          latestWeightKg: latest(weight)?.weight ?? null,
          latestBmi: latest(weight)?.bmi ?? null,
          latestBodyFatPercent: latest(fat)?.fat ?? null,
          waterMl: object(object(endpoints.water).summary).water ?? null,
          caloriesIn: object(object(endpoints.food).summary).calories ?? null,
        },
        activities: activities.map((item) => ({
          name: item.activityName ?? item.name ?? null,
          startTime: item.startTime ?? item.originalStartTime ?? null,
          durationMinutes: available(item.duration) ? Math.round(Number(item.duration) / 60000) : null,
          calories: item.calories ?? null,
          distanceKm: item.distance ?? null,
          averageHeartRate: item.averageHeartRate ?? null,
          activeZoneMinutes: object(item.activeZoneMinutes).totalMinutes ?? null,
        })),
      }
    }

    console.log(JSON.stringify(report, null, 2))
    app.quit()
  } catch (error) {
    console.error(error.message)
    app.exit(1)
  }
})
