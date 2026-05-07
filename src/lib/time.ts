import type { RaceState } from '../types'

export const DEFAULT_RACE_MINUTES = 240
export const MIN_RACE_MINUTES = 1
export const MAX_RACE_MINUTES = 720

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND

export function minutesToMs(minutes: number) {
  return minutes * MS_PER_MINUTE
}

export function clampDurationMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) {
    return DEFAULT_RACE_MINUTES
  }

  return Math.min(MAX_RACE_MINUTES, Math.max(MIN_RACE_MINUTES, Math.round(minutes)))
}

export function createInitialRaceState(minutes = DEFAULT_RACE_MINUTES): RaceState {
  const durationMinutes = clampDurationMinutes(minutes)

  return {
    durationMinutes,
    durationMs: minutesToMs(durationMinutes),
    status: 'ready',
    startedAt: null,
    elapsedBeforeRunMs: 0,
    laps: [],
  }
}

export function getElapsedMs(state: RaceState, now: number) {
  const elapsed =
    state.status === 'running' && state.startedAt !== null
      ? state.elapsedBeforeRunMs + now - state.startedAt
      : state.elapsedBeforeRunMs

  return Math.min(state.durationMs, Math.max(0, elapsed))
}

export function getRemainingMs(state: RaceState, now: number) {
  return Math.max(0, state.durationMs - getElapsedMs(state, now))
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
