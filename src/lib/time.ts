import type { RaceRow } from '../types'

export const DEFAULT_RACE_MINUTES = 240
export const MIN_RACE_MINUTES = 1
export const MAX_RACE_MINUTES = 720

const MS_PER_SECOND = 1000

export function minutesToSeconds(minutes: number) {
  return minutes * 60
}

export function secondsToMs(seconds: number) {
  return seconds * MS_PER_SECOND
}

export function msToSeconds(ms: number) {
  return ms / MS_PER_SECOND
}

export function clampDurationMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) {
    return DEFAULT_RACE_MINUTES
  }

  return Math.min(MAX_RACE_MINUTES, Math.max(MIN_RACE_MINUTES, Math.round(minutes)))
}

export function getDurationMinutes(durationSeconds: number) {
  return Math.round(durationSeconds / 60)
}

export function getRaceDurationMs(race: RaceRow | null) {
  return race ? secondsToMs(race.duration_seconds) : secondsToMs(minutesToSeconds(DEFAULT_RACE_MINUTES))
}

export function getRaceElapsedMs(race: RaceRow | null, now: number) {
  if (!race || race.status === 'not_started' || !race.started_at) {
    return 0
  }

  if (race.status === 'finished') {
    return getRaceDurationMs(race)
  }

  const startedAtMs = new Date(race.started_at).getTime()
  const pausedAtMs = race.paused_at ? new Date(race.paused_at).getTime() : null
  const comparisonMs = race.status === 'paused' && pausedAtMs !== null ? pausedAtMs : now
  const pausedMs = secondsToMs(race.total_paused_seconds)
  const elapsed = comparisonMs - startedAtMs - pausedMs

  return Math.min(getRaceDurationMs(race), Math.max(0, elapsed))
}

export function getRaceRemainingMs(race: RaceRow | null, now: number) {
  return Math.max(0, getRaceDurationMs(race) - getRaceElapsedMs(race, now))
}

export function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatLapTime(ms: number) {
  if (ms <= 0) {
    return '0:00.0'
  }

  const totalTenths = Math.floor(ms / 100)
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor((totalTenths % 600) / 10)
  const tenths = totalTenths % 10

  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
}

export function formatAverage(ms: number | null) {
  if (ms === null) {
    return '--'
  }

  const totalSeconds = Math.round(ms / MS_PER_SECOND)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatSignedGain(ms: number) {
  if (ms <= 0) {
    return '0.0 sec'
  }

  return `${(ms / MS_PER_SECOND).toFixed(1)} sec`
}
