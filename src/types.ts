export type RaceStatus = 'ready' | 'running' | 'paused'

export type Lap = {
  id: string
  number: number
  loggedAt: number
  raceElapsedMs: number
  lapDurationMs: number
  remainingMs: number
}

export type RaceState = {
  durationMinutes: number
  durationMs: number
  status: RaceStatus
  startedAt: number | null
  elapsedBeforeRunMs: number
  laps: Lap[]
}
