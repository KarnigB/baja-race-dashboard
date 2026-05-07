import { supabase } from './supabase'
import {
  DEFAULT_RACE_MINUTES,
  clampDurationMinutes,
  getRaceElapsedMs,
  minutesToSeconds,
  msToSeconds,
} from './time'
import type {
  DriverRow,
  IssueLogRow,
  IssueSeverity,
  LapRow,
  RaceRow,
  StintRow,
  StopEventRow,
  StopEventType,
  TeamStatus,
  TeamStatusEventRow,
  TrackedTeamRow,
} from '../types'

export const ACTIVE_RACE_ID = '00000000-0000-0000-0000-000000000001'

const DEFAULT_RACE_NAME = 'Active Endurance Race'

export type RaceData = {
  race: RaceRow
  laps: LapRow[]
  stopEvents: StopEventRow[]
  drivers: DriverRow[]
  stints: StintRow[]
  issues: IssueLogRow[]
  trackedTeams: TrackedTeamRow[]
  teamStatusEvents: TeamStatusEventRow[]
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  return supabase
}

export async function ensureActiveRace() {
  const client = requireSupabase()
  const { data: existingRace, error: selectError } = await client
    .from('races')
    .select('*')
    .eq('id', ACTIVE_RACE_ID)
    .maybeSingle()

  if (selectError) {
    throw selectError
  }

  if (existingRace) {
    return existingRace
  }

  const { data: createdRace, error: insertError } = await client
    .from('races')
    .insert({
      id: ACTIVE_RACE_ID,
      name: DEFAULT_RACE_NAME,
      duration_seconds: minutesToSeconds(DEFAULT_RACE_MINUTES),
      status: 'not_started',
    })
    .select()
    .single()

  if (insertError) {
    throw insertError
  }

  return createdRace
}

export async function fetchActiveRace() {
  const client = requireSupabase()
  const { data, error } = await client.from('races').select('*').eq('id', ACTIVE_RACE_ID).single()

  if (error) {
    throw error
  }

  return data
}

export async function fetchRaceLaps(raceId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('laps')
    .select('*')
    .eq('race_id', raceId)
    .order('lap_number', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export async function fetchStopEvents(raceId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('stop_events')
    .select('*')
    .eq('race_id', raceId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export async function fetchDrivers(raceId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('drivers')
    .select('*')
    .eq('race_id', raceId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export async function fetchStints(raceId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('stints')
    .select('*')
    .eq('race_id', raceId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export async function fetchIssueLogs(raceId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('issue_logs')
    .select('*')
    .eq('race_id', raceId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data
}

export async function fetchTrackedTeams(raceId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('tracked_teams')
    .select('*')
    .eq('race_id', raceId)
    .order('car_number', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export async function fetchTeamStatusEvents(raceId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('team_status_events')
    .select('*')
    .eq('race_id', raceId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export async function fetchRaceData(): Promise<RaceData> {
  const race = await ensureActiveRace()
  const [
    laps,
    stopEvents,
    drivers,
    stints,
    issues,
    trackedTeams,
    teamStatusEvents,
  ] = await Promise.all([
    fetchRaceLaps(race.id),
    fetchStopEvents(race.id),
    fetchDrivers(race.id),
    fetchStints(race.id),
    fetchIssueLogs(race.id),
    fetchTrackedTeams(race.id),
    fetchTeamStatusEvents(race.id),
  ])

  return {
    race,
    laps,
    stopEvents,
    drivers,
    stints,
    issues,
    trackedTeams,
    teamStatusEvents,
  }
}

export async function updateRaceDuration(raceId: string, minutes: number) {
  const client = requireSupabase()
  const durationMinutes = clampDurationMinutes(minutes)
  const { error } = await client
    .from('races')
    .update({ duration_seconds: minutesToSeconds(durationMinutes) })
    .eq('id', raceId)

  if (error) {
    throw error
  }
}

export async function updateTargetLapSeconds(raceId: string, targetSeconds: number | null) {
  const client = requireSupabase()
  const { error } = await client
    .from('races')
    .update({ target_lap_seconds: targetSeconds && targetSeconds > 0 ? targetSeconds : null })
    .eq('id', raceId)

  if (error) {
    throw error
  }
}

export async function startRace(raceId: string, timestamp: Date) {
  const client = requireSupabase()
  const { error } = await client
    .from('races')
    .update({
      started_at: timestamp.toISOString(),
      status: 'running',
      paused_at: null,
      total_paused_seconds: 0,
    })
    .eq('id', raceId)

  if (error) {
    throw error
  }
}

export async function pauseRace(raceId: string, timestamp: Date) {
  const client = requireSupabase()
  const { error } = await client
    .from('races')
    .update({
      status: 'paused',
      paused_at: timestamp.toISOString(),
    })
    .eq('id', raceId)

  if (error) {
    throw error
  }
}

export async function resumeRace(race: RaceRow, timestamp: Date) {
  const client = requireSupabase()
  const pausedAtMs = race.paused_at ? new Date(race.paused_at).getTime() : timestamp.getTime()
  const pauseDurationSeconds = Math.max(0, msToSeconds(timestamp.getTime() - pausedAtMs))

  const { error } = await client
    .from('races')
    .update({
      status: 'running',
      paused_at: null,
      total_paused_seconds: race.total_paused_seconds + pauseDurationSeconds,
    })
    .eq('id', race.id)

  if (error) {
    throw error
  }
}

export async function finishRace(raceId: string) {
  const client = requireSupabase()
  const { error } = await client
    .from('races')
    .update({
      status: 'finished',
      paused_at: null,
    })
    .eq('id', raceId)

  if (error) {
    throw error
  }
}

async function deleteRaceRows(raceId: string, tables: string[]) {
  const client = requireSupabase()

  for (const table of tables) {
    const { error } = await client.from(table).delete().eq('race_id', raceId)

    if (error) {
      throw error
    }
  }
}

export async function resetRace(race: RaceRow) {
  const client = requireSupabase()
  await deleteRaceRows(race.id, ['laps', 'stop_events', 'stints'])

  const { error } = await client
    .from('races')
    .update({
      duration_seconds: race.duration_seconds,
      target_lap_seconds: race.target_lap_seconds,
      started_at: null,
      status: 'not_started',
      paused_at: null,
      total_paused_seconds: 0,
    })
    .eq('id', race.id)

  if (error) {
    throw error
  }
}

export async function clearRaceData(race: RaceRow) {
  const client = requireSupabase()
  await deleteRaceRows(race.id, [
    'laps',
    'stop_events',
    'stints',
    'drivers',
    'issue_logs',
    'tracked_teams',
    'team_status_events',
  ])

  const { error } = await client
    .from('races')
    .update({
      duration_seconds: minutesToSeconds(DEFAULT_RACE_MINUTES),
      target_lap_seconds: null,
      started_at: null,
      status: 'not_started',
      paused_at: null,
      total_paused_seconds: 0,
    })
    .eq('id', race.id)

  if (error) {
    throw error
  }
}

export async function logLap(race: RaceRow, laps: LapRow[], timestamp: Date) {
  const client = requireSupabase()
  const raceElapsedMs = getRaceElapsedMs(race, timestamp.getTime())
  const previousLapElapsedSeconds = laps.at(-1)?.race_elapsed_seconds ?? 0
  const raceElapsedSeconds = msToSeconds(raceElapsedMs)
  const lapDurationSeconds = Math.max(0, raceElapsedSeconds - previousLapElapsedSeconds)
  const lapNumber = laps.length + 1

  const { error } = await client.from('laps').insert({
    race_id: race.id,
    lap_number: lapNumber,
    lap_duration_seconds: lapDurationSeconds,
    race_elapsed_seconds: raceElapsedSeconds,
    created_at: timestamp.toISOString(),
  })

  if (error) {
    throw error
  }
}

export async function deleteMostRecentLap(laps: LapRow[]) {
  const mostRecentLap = laps.at(-1)

  if (!mostRecentLap) {
    return
  }

  const client = requireSupabase()
  const { error } = await client.from('laps').delete().eq('id', mostRecentLap.id)

  if (error) {
    throw error
  }
}

export async function addStopEvent(
  race: RaceRow,
  eventType: StopEventType,
  note: string,
  timestamp: Date,
) {
  const client = requireSupabase()
  const { error } = await client.from('stop_events').insert({
    race_id: race.id,
    event_type: eventType,
    race_elapsed_seconds: msToSeconds(getRaceElapsedMs(race, timestamp.getTime())),
    note: note.trim() || null,
    created_at: timestamp.toISOString(),
  })

  if (error) {
    throw error
  }
}

export async function deleteMostRecentStopEvent(stopEvents: StopEventRow[]) {
  const mostRecentEvent = stopEvents.at(-1)

  if (!mostRecentEvent) {
    return
  }

  const client = requireSupabase()
  const { error } = await client.from('stop_events').delete().eq('id', mostRecentEvent.id)

  if (error) {
    throw error
  }
}

export async function addDriver(raceId: string, name: string) {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return
  }

  const client = requireSupabase()
  const { error } = await client.from('drivers').insert({
    race_id: raceId,
    name: trimmedName,
  })

  if (error) {
    throw error
  }
}

async function endOpenStint(race: RaceRow, stints: StintRow[], laps: LapRow[], timestamp: Date) {
  const openStint = stints.find((stint) => stint.end_elapsed_seconds === null)

  if (!openStint) {
    return
  }

  const client = requireSupabase()
  const { error } = await client
    .from('stints')
    .update({
      end_elapsed_seconds: msToSeconds(getRaceElapsedMs(race, timestamp.getTime())),
      end_lap_number: laps.length,
      ended_at: timestamp.toISOString(),
    })
    .eq('id', openStint.id)

  if (error) {
    throw error
  }
}

export async function startDriverStint(
  race: RaceRow,
  stints: StintRow[],
  laps: LapRow[],
  driverId: string,
  timestamp: Date,
) {
  const client = requireSupabase()
  await endOpenStint(race, stints, laps, timestamp)

  const { error } = await client.from('stints').insert({
    race_id: race.id,
    driver_id: driverId,
    start_elapsed_seconds: msToSeconds(getRaceElapsedMs(race, timestamp.getTime())),
    start_lap_number: laps.length,
    created_at: timestamp.toISOString(),
  })

  if (error) {
    throw error
  }
}

export async function endCurrentStint(race: RaceRow, stints: StintRow[], laps: LapRow[], timestamp: Date) {
  await endOpenStint(race, stints, laps, timestamp)
}

export async function addIssue(raceId: string, severity: IssueSeverity, message: string) {
  const trimmedMessage = message.trim()

  if (!trimmedMessage) {
    return
  }

  const client = requireSupabase()
  const { error } = await client.from('issue_logs').insert({
    race_id: raceId,
    severity,
    message: trimmedMessage,
  })

  if (error) {
    throw error
  }
}

export async function resolveIssue(issueId: string) {
  const client = requireSupabase()
  const { error } = await client
    .from('issue_logs')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', issueId)

  if (error) {
    throw error
  }
}

export async function addTrackedTeam(raceId: string, schoolName: string, carNumber: string, notes: string) {
  const trimmedSchoolName = schoolName.trim()
  const trimmedCarNumber = carNumber.trim()

  if (!trimmedSchoolName || !trimmedCarNumber) {
    return
  }

  const client = requireSupabase()
  const { data: team, error: teamError } = await client
    .from('tracked_teams')
    .insert({
      race_id: raceId,
      school_name: trimmedSchoolName,
      car_number: trimmedCarNumber,
      notes: notes.trim() || null,
    })
    .select()
    .single()

  if (teamError) {
    throw teamError
  }

  const { error: statusError } = await client.from('team_status_events').insert({
    race_id: raceId,
    team_id: team.id,
    status: 'unknown',
  })

  if (statusError) {
    throw statusError
  }
}

export async function updateTeamStatus(raceId: string, teamId: string, status: TeamStatus, note: string) {
  const client = requireSupabase()
  const { error } = await client.from('team_status_events').insert({
    race_id: raceId,
    team_id: teamId,
    status,
    note: note.trim() || null,
  })

  if (error) {
    throw error
  }
}
