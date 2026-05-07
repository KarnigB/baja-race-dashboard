import { supabase } from './supabase'
import {
  DEFAULT_RACE_MINUTES,
  clampDurationMinutes,
  getRaceElapsedMs,
  minutesToSeconds,
  msToSeconds,
} from './time'
import type { LapRow, RaceRow } from '../types'

export const ACTIVE_RACE_ID = '00000000-0000-0000-0000-000000000001'

const DEFAULT_RACE_NAME = 'Active Endurance Race'

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

export async function resetRace(race: RaceRow) {
  const client = requireSupabase()
  const { error: deleteError } = await client.from('laps').delete().eq('race_id', race.id)

  if (deleteError) {
    throw deleteError
  }

  const { error: updateError } = await client
    .from('races')
    .update({
      duration_seconds: race.duration_seconds,
      started_at: null,
      status: 'not_started',
      paused_at: null,
      total_paused_seconds: 0,
    })
    .eq('id', race.id)

  if (updateError) {
    throw updateError
  }
}

export async function clearRaceData(race: RaceRow) {
  const client = requireSupabase()
  const { error: deleteError } = await client.from('laps').delete().eq('race_id', race.id)

  if (deleteError) {
    throw deleteError
  }

  const { error: updateError } = await client
    .from('races')
    .update({
      duration_seconds: minutesToSeconds(DEFAULT_RACE_MINUTES),
      started_at: null,
      status: 'not_started',
      paused_at: null,
      total_paused_seconds: 0,
    })
    .eq('id', race.id)

  if (updateError) {
    throw updateError
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
