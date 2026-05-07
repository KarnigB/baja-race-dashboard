import { getRaceElapsedMs, secondsToMs } from './time'
import type {
  DriverRow,
  LapRow,
  RaceRow,
  StintRow,
  StopEventRow,
  StopEventType,
  TeamStatus,
  TeamStatusEventRow,
  TrackedTeamRow,
} from '../types'

export const ROLLING_LAP_COUNT = 3
export const PADDOCK_TARGET_MS = 3 * 60 * 1000
export const GAIN_POSSIBLE_SECONDS = 5
export const GAIN_DIFFICULT_SECONDS = 10
export const LOW_TRAFFIC_RATIO = 0.5
export const HIGH_TRAFFIC_RATIO = 0.75
export const LOW_CONFIDENCE_UNKNOWN_RATIO = 0.35

type StopStatus = 'on_track' | 'in_pit' | 'in_paddock'

export type StopSummary = {
  status: StopStatus
  currentStopElapsedMs: number
  totalPitMs: number
  totalPaddockMs: number
  pitStops: number
  paddockStops: number
  longestStopMs: number | null
  lastStopMs: number | null
  activeStopEvent: StopEventRow | null
  paddockWarning: boolean
}

export type DriverSummary = {
  driver: DriverRow
  laps: number
  averageLapMs: number | null
  fastestLapMs: number | null
  drivingTimeMs: number
}

export type StintSummary = {
  currentStint: StintRow | null
  currentDriver: DriverRow | null
  stintElapsedMs: number
  stintLaps: number
}

export type TeamStatusSummary = {
  counts: Record<TeamStatus, number>
  latestStatusByTeamId: Map<string, TeamStatusEventRow>
  onTrackRatio: number | null
  recommendation: string
  recommendationTone: 'good' | 'normal' | 'warn'
  confidenceLow: boolean
}

function average(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function getLastLapMs(laps: LapRow[]) {
  const lastLap = laps.at(-1)
  return lastLap ? secondsToMs(lastLap.lap_duration_seconds) : null
}

export function getFullAverageLapMs(laps: LapRow[]) {
  return average(laps.map((lap) => secondsToMs(lap.lap_duration_seconds)))
}

export function getRollingAverageLapMs(laps: LapRow[], count = ROLLING_LAP_COUNT) {
  return average(laps.slice(-count).map((lap) => secondsToMs(lap.lap_duration_seconds)))
}

export function getProjection(remainingMs: number, completedLaps: number, averageLapMs: number | null) {
  if (averageLapMs === null || averageLapMs <= 0) {
    return {
      remaining: null,
      final: null,
    }
  }

  const remaining = Math.floor(remainingMs / averageLapMs)

  return {
    remaining,
    final: completedLaps + remaining,
  }
}

export function getPaceDeltaMs(averageLapMs: number | null, targetLapSeconds: number | null) {
  if (averageLapMs === null || !targetLapSeconds) {
    return null
  }

  return averageLapMs - secondsToMs(targetLapSeconds)
}

export function getGainOneMoreLapSummary(remainingMs: number, rollingAverageMs: number | null) {
  if (rollingAverageMs === null || rollingAverageMs <= 0 || remainingMs <= 0) {
    return {
      label: 'Need rolling pace',
      detail: 'Log laps to calculate the required gain for one more lap.',
      tone: 'normal' as const,
      requiredGainMs: null,
      requiredLapMs: null,
    }
  }

  const projectedRemaining = Math.floor(remainingMs / rollingAverageMs)
  const desiredRemaining = projectedRemaining + 1
  const requiredLapMs = remainingMs / desiredRemaining
  const requiredGainMs = Math.max(0, rollingAverageMs - requiredLapMs)
  const requiredGainSeconds = requiredGainMs / 1000

  if (requiredGainSeconds <= GAIN_POSSIBLE_SECONDS) {
    return {
      label: `Possible: gain ${requiredGainSeconds.toFixed(1)} sec/lap`,
      detail: `Required average from now: ${(requiredLapMs / 1000).toFixed(1)} sec per lap.`,
      tone: 'good' as const,
      requiredGainMs,
      requiredLapMs,
    }
  }

  if (requiredGainSeconds <= GAIN_DIFFICULT_SECONDS) {
    return {
      label: `Difficult: gain ${requiredGainSeconds.toFixed(1)} sec/lap`,
      detail: `Required average from now: ${(requiredLapMs / 1000).toFixed(1)} sec per lap.`,
      tone: 'warn' as const,
      requiredGainMs,
      requiredLapMs,
    }
  }

  return {
    label: `Unlikely: requires ${requiredGainSeconds.toFixed(1)} sec/lap faster`,
    detail: `Required average from now: ${(requiredLapMs / 1000).toFixed(1)} sec per lap.`,
    tone: 'danger' as const,
    requiredGainMs,
    requiredLapMs,
  }
}

function isInEvent(eventType: StopEventType) {
  return eventType === 'pit_in' || eventType === 'paddock_in'
}

function getMatchingOutEventType(eventType: StopEventType) {
  return eventType === 'pit_in' ? 'pit_out' : 'paddock_out'
}

export function getStopSummary(stopEvents: StopEventRow[], race: RaceRow | null, now: number): StopSummary {
  let totalPitMs = 0
  let totalPaddockMs = 0
  let pitStops = 0
  let paddockStops = 0
  let lastStopMs: number | null = null
  let longestStopMs: number | null = null
  let activeStopEvent: StopEventRow | null = null

  for (const event of stopEvents) {
    if (event.event_type === 'pit_in') {
      pitStops += 1
      activeStopEvent = event
      continue
    }

    if (event.event_type === 'paddock_in') {
      paddockStops += 1
      activeStopEvent = event
      continue
    }

    if (activeStopEvent && event.event_type === getMatchingOutEventType(activeStopEvent.event_type)) {
      const durationMs = secondsToMs(event.race_elapsed_seconds - activeStopEvent.race_elapsed_seconds)

      if (activeStopEvent.event_type === 'pit_in') {
        totalPitMs += durationMs
      } else {
        totalPaddockMs += durationMs
      }

      lastStopMs = durationMs
      longestStopMs = Math.max(longestStopMs ?? 0, durationMs)
      activeStopEvent = null
    }
  }

  const currentRaceElapsedMs = race ? getRaceElapsedMs(race, now) : 0
  const currentStopElapsedMs =
    activeStopEvent && isInEvent(activeStopEvent.event_type)
      ? Math.max(0, currentRaceElapsedMs - secondsToMs(activeStopEvent.race_elapsed_seconds))
      : 0

  if (activeStopEvent?.event_type === 'pit_in') {
    totalPitMs += currentStopElapsedMs
  }

  if (activeStopEvent?.event_type === 'paddock_in') {
    totalPaddockMs += currentStopElapsedMs
  }

  if (currentStopElapsedMs > 0) {
    longestStopMs = Math.max(longestStopMs ?? 0, currentStopElapsedMs)
  }

  return {
    status:
      activeStopEvent?.event_type === 'pit_in'
        ? 'in_pit'
        : activeStopEvent?.event_type === 'paddock_in'
          ? 'in_paddock'
          : 'on_track',
    currentStopElapsedMs,
    totalPitMs,
    totalPaddockMs,
    pitStops,
    paddockStops,
    longestStopMs,
    lastStopMs,
    activeStopEvent,
    paddockWarning: activeStopEvent?.event_type === 'paddock_in' && currentStopElapsedMs > PADDOCK_TARGET_MS,
  }
}

export function getStintSummary(
  race: RaceRow | null,
  drivers: DriverRow[],
  stints: StintRow[],
  laps: LapRow[],
  now: number,
): StintSummary {
  const currentStint = stints.find((stint) => stint.end_elapsed_seconds === null) ?? null
  const currentDriver = currentStint
    ? drivers.find((driver) => driver.id === currentStint.driver_id) ?? null
    : null
  const raceElapsedMs = race ? getRaceElapsedMs(race, now) : 0
  const stintElapsedMs = currentStint
    ? Math.max(0, raceElapsedMs - secondsToMs(currentStint.start_elapsed_seconds))
    : 0

  return {
    currentStint,
    currentDriver,
    stintElapsedMs,
    stintLaps: currentStint ? Math.max(0, laps.length - currentStint.start_lap_number) : 0,
  }
}

export function getDriverSummaries(
  race: RaceRow | null,
  drivers: DriverRow[],
  stints: StintRow[],
  laps: LapRow[],
  now: number,
) {
  const raceElapsedSeconds = race ? getRaceElapsedMs(race, now) / 1000 : 0
  const summaries = new Map<string, DriverSummary>()

  for (const driver of drivers) {
    summaries.set(driver.id, {
      driver,
      laps: 0,
      averageLapMs: null,
      fastestLapMs: null,
      drivingTimeMs: 0,
    })
  }

  for (const stint of stints) {
    const summary = summaries.get(stint.driver_id)

    if (!summary) {
      continue
    }

    const stintEndLap = stint.end_lap_number ?? laps.length
    const stintLaps = laps.filter(
      (lap) => lap.lap_number > stint.start_lap_number && lap.lap_number <= stintEndLap,
    )
    const stintLapMs = stintLaps.map((lap) => secondsToMs(lap.lap_duration_seconds))
    const stintDurationSeconds =
      (stint.end_elapsed_seconds ?? raceElapsedSeconds) - stint.start_elapsed_seconds

    summary.laps += stintLaps.length
    summary.drivingTimeMs += secondsToMs(Math.max(0, stintDurationSeconds))

    const allAverageInputs = [
      ...Array(summary.laps - stintLaps.length).fill(summary.averageLapMs ?? 0),
      ...stintLapMs,
    ].filter((value) => value > 0)

    summary.averageLapMs = average(allAverageInputs)

    const stintFastest = stintLapMs.length > 0 ? Math.min(...stintLapMs) : null
    if (stintFastest !== null) {
      summary.fastestLapMs = Math.min(summary.fastestLapMs ?? stintFastest, stintFastest)
    }
  }

  return [...summaries.values()].filter(
    (summary) => summary.laps > 0 || summary.drivingTimeMs > 0,
  )
}

export function getTeamStatusSummary(
  trackedTeams: TrackedTeamRow[],
  statusEvents: TeamStatusEventRow[],
): TeamStatusSummary {
  const latestStatusByTeamId = new Map<string, TeamStatusEventRow>()

  for (const event of statusEvents) {
    latestStatusByTeamId.set(event.team_id, event)
  }

  const counts: Record<TeamStatus, number> = {
    on_track: 0,
    in_pit: 0,
    in_paddock: 0,
    unknown: 0,
    retired: 0,
  }

  for (const team of trackedTeams) {
    const status = latestStatusByTeamId.get(team.id)?.status ?? 'unknown'
    counts[status] += 1
  }

  const knownActiveTeams = trackedTeams.length - counts.unknown - counts.retired
  const onTrackRatio = knownActiveTeams > 0 ? counts.on_track / knownActiveTeams : null
  const confidenceLow =
    trackedTeams.length > 0 && counts.unknown / trackedTeams.length > LOW_CONFIDENCE_UNKNOWN_RATIO

  if (trackedTeams.length === 0) {
    return {
      counts,
      latestStatusByTeamId,
      onTrackRatio,
      recommendation: 'Add teams for traffic signal',
      recommendationTone: 'normal',
      confidenceLow: false,
    }
  }

  if (confidenceLow) {
    return {
      counts,
      latestStatusByTeamId,
      onTrackRatio,
      recommendation: 'Traffic confidence low: update team statuses',
      recommendationTone: 'warn',
      confidenceLow,
    }
  }

  if (onTrackRatio !== null && onTrackRatio < LOW_TRAFFIC_RATIO) {
    return {
      counts,
      latestStatusByTeamId,
      onTrackRatio,
      recommendation: 'LOW TRAFFIC: Push window',
      recommendationTone: 'good',
      confidenceLow,
    }
  }

  if (onTrackRatio !== null && onTrackRatio > HIGH_TRAFFIC_RATIO) {
    return {
      counts,
      latestStatusByTeamId,
      onTrackRatio,
      recommendation: 'HIGH TRAFFIC: Expect traffic',
      recommendationTone: 'warn',
      confidenceLow,
    }
  }

  return {
    counts,
    latestStatusByTeamId,
    onTrackRatio,
    recommendation: 'NORMAL TRAFFIC: Hold pace',
    recommendationTone: 'normal',
    confidenceLow,
  }
}
