import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { LapTable } from './components/LapTable'
import { MetricCard } from './components/MetricCard'
import {
  clearRaceData,
  deleteMostRecentLap,
  ensureActiveRace,
  fetchActiveRace,
  fetchRaceLaps,
  finishRace,
  logLap,
  pauseRace,
  resetRace,
  resumeRace,
  startRace,
  updateRaceDuration,
} from './lib/raceSync'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  DEFAULT_RACE_MINUTES,
  MAX_RACE_MINUTES,
  MIN_RACE_MINUTES,
  formatAverage,
  formatClock,
  formatLapTime,
  formatSignedGain,
  getDurationMinutes,
  getRaceDurationMs,
  getRaceElapsedMs,
  getRaceRemainingMs,
  secondsToMs,
} from './lib/time'
import type { LapRow, RaceRow } from './types'

type SyncStatus = 'disabled' | 'connecting' | 'connected' | 'error'

const TICK_MS = 250

function App() {
  const [race, setRace] = useState<RaceRow | null>(null)
  const [laps, setLaps] = useState<LapRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isSupabaseConfigured ? 'connecting' : 'disabled',
  )
  const [syncWarning, setSyncWarning] = useState<string | null>(
    isSupabaseConfigured
      ? null
      : 'Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
  const finishRequestedRaceId = useRef<string | null>(null)
  const raceId = race?.id ?? null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)

    return () => window.clearInterval(timer)
  }, [])

  const reportSupabaseError = useCallback((context: string, error: unknown) => {
    console.error(`[Supabase] ${context}`, error)
    setSyncStatus((current) => (current === 'disabled' ? current : 'error'))
    setSyncWarning(`${context}. Live sync may be unavailable until Supabase reconnects.`)
  }, [])

  const refreshRaceData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }

    try {
      const activeRace = await ensureActiveRace()
      const activeLaps = await fetchRaceLaps(activeRace.id)
      setRace(activeRace)
      setLaps(activeLaps)
      setSyncWarning(null)
    } catch (error) {
      reportSupabaseError('Unable to load the active race', error)
    } finally {
      setIsLoading(false)
    }
  }, [reportSupabaseError])

  useEffect(() => {
    queueMicrotask(() => {
      void refreshRaceData()
    })
  }, [refreshRaceData])

  useEffect(() => {
    if (!supabase || !raceId) {
      return undefined
    }

    queueMicrotask(() => setSyncStatus('connecting'))
    const realtimeClient = supabase

    const refreshLaps = async () => {
      try {
        setLaps(await fetchRaceLaps(raceId))
      } catch (error) {
        reportSupabaseError('Unable to refresh laps from realtime change', error)
      }
    }

    const channel = realtimeClient
      .channel(`active-race-${raceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'races', filter: `id=eq.${raceId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            void refreshRaceData()
            return
          }

          setRace(payload.new as RaceRow)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'laps', filter: `race_id=eq.${raceId}` },
        () => {
          void refreshLaps()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus('connected')
          setSyncWarning(null)
          return
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setSyncStatus('error')
          setSyncWarning('Supabase Realtime is not connected. The dashboard will retry when data changes.')
        }
      })

    return () => {
      void realtimeClient.removeChannel(channel)
    }
  }, [raceId, refreshRaceData, reportSupabaseError])

  const elapsedMs = getRaceElapsedMs(race, now)
  const remainingMs = getRaceRemainingMs(race, now)
  const raceDurationMs = getRaceDurationMs(race)
  const completedLaps = laps.length
  const totalLapMs = laps.reduce((sum, lap) => sum + secondsToMs(lap.lap_duration_seconds), 0)
  const averageLapMs = completedLaps > 0 ? totalLapMs / completedLaps : null
  const estimatedRemainingLaps =
    averageLapMs !== null && averageLapMs > 0 ? Math.floor(remainingMs / averageLapMs) : null
  const estimatedFinalLaps =
    estimatedRemainingLaps !== null ? completedLaps + estimatedRemainingLaps : null
  const oneMoreLapTarget =
    estimatedRemainingLaps !== null && remainingMs > 0 ? estimatedRemainingLaps + 1 : null
  const requiredLapMs =
    oneMoreLapTarget !== null && oneMoreLapTarget > 0 ? remainingMs / oneMoreLapTarget : null
  const requiredGainMs =
    averageLapMs !== null && requiredLapMs !== null ? Math.max(0, averageLapMs - requiredLapMs) : null
  const raceComplete = race?.status === 'finished' || remainingMs === 0
  const controlDisabled = !race || !isSupabaseConfigured || isLoading || isMutating
  const canEditDuration = Boolean(race?.status === 'not_started' && completedLaps === 0 && !controlDisabled)
  const raceStatusClass = race?.status ?? 'not_started'
  const raceStatusLabel = raceComplete ? 'Race complete' : race?.status.replace('_', ' ') ?? 'offline'
  const durationMinutes = race ? getDurationMinutes(race.duration_seconds) : DEFAULT_RACE_MINUTES
  const syncStatusLabel =
    syncStatus === 'connected'
      ? 'Live sync'
      : syncStatus === 'connecting'
        ? 'Connecting'
        : syncStatus === 'disabled'
          ? 'Sync disabled'
          : 'Sync issue'

  useEffect(() => {
    if (!race || race.status !== 'running') {
      finishRequestedRaceId.current = null
      return
    }

    if (remainingMs > 0 || finishRequestedRaceId.current === race.id) {
      return
    }

    finishRequestedRaceId.current = race.id
    finishRace(race.id).catch((error: unknown) => {
      finishRequestedRaceId.current = null
      reportSupabaseError('Unable to mark the race finished', error)
    })
  }, [race, remainingMs, reportSupabaseError])

  async function runMutation(label: string, mutation: () => Promise<void>) {
    if (!race || !isSupabaseConfigured) {
      return
    }

    setIsMutating(true)

    try {
      await mutation()
      const [updatedRace, updatedLaps] = await Promise.all([fetchActiveRace(), fetchRaceLaps(race.id)])
      setRace(updatedRace)
      setLaps(updatedLaps)
      setSyncWarning(null)
    } catch (error) {
      reportSupabaseError(label, error)
    } finally {
      setIsMutating(false)
    }
  }

  function handleDurationChange(value: string) {
    void runMutation('Unable to update race duration', async () => {
      if (!race) {
        return
      }

      await updateRaceDuration(race.id, Number(value))
    })
  }

  function handleStart() {
    void runMutation('Unable to start race', async () => {
      if (race) {
        await startRace(race.id, new Date())
      }
    })
  }

  function handlePause() {
    void runMutation('Unable to pause race', async () => {
      if (race) {
        await pauseRace(race.id, new Date())
      }
    })
  }

  function handleResume() {
    void runMutation('Unable to resume race', async () => {
      if (race) {
        await resumeRace(race, new Date())
      }
    })
  }

  function handleReset() {
    void runMutation('Unable to reset race', async () => {
      if (race) {
        await resetRace(race)
      }
    })
  }

  function handleClearRaceData() {
    void runMutation('Unable to clear race data', async () => {
      if (race) {
        await clearRaceData(race)
      }
    })
  }

  function handleLogLap() {
    void runMutation('Unable to log lap', async () => {
      if (race) {
        await logLap(race, laps, new Date())
      }
    })
  }

  function handleDeleteRecentLap() {
    void runMutation('Unable to delete the most recent lap', async () => {
      await deleteMostRecentLap(laps)
    })
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Student endurance command</p>
          <h1>Baja Race Dashboard</h1>
        </div>
        <div className="status-stack">
          <div className={`race-status race-status--${raceStatusClass}`}>
            <span></span>
            {raceStatusLabel}
          </div>
          <div className={`sync-status sync-status--${syncStatus}`}>
            <span></span>
            {syncStatusLabel}
          </div>
        </div>
      </header>

      {syncWarning ? <div className="sync-warning">{syncWarning}</div> : null}

      <section className="timer-panel">
        <div className="timer-panel__main">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Master clock</p>
              <h2>Race timer</h2>
            </div>
            <label className="duration-input">
              <span>Duration</span>
              <input
                aria-label="Race duration in minutes"
                disabled={!canEditDuration}
                max={MAX_RACE_MINUTES}
                min={MIN_RACE_MINUTES}
                onChange={(event) => handleDurationChange(event.target.value)}
                type="number"
                value={durationMinutes}
              />
              <span>min</span>
            </label>
          </div>

          <div className="master-clock" aria-live="polite">
            {isLoading ? '0:00:00' : formatClock(remainingMs)}
          </div>
          <div className="timer-subline">
            <span>Elapsed {formatClock(elapsedMs)}</span>
            <span>Race length {formatClock(raceDurationMs)}</span>
          </div>
        </div>

        <div className="control-grid">
          <button disabled={controlDisabled || race?.status !== 'not_started'} onClick={handleStart} type="button">
            Start
          </button>
          <button disabled={controlDisabled || race?.status !== 'running'} onClick={handlePause} type="button">
            Pause
          </button>
          <button disabled={controlDisabled || race?.status !== 'paused' || raceComplete} onClick={handleResume} type="button">
            Resume
          </button>
          <button disabled={controlDisabled} onClick={handleReset} type="button">
            Reset
          </button>
          <button
            className="button-primary"
            disabled={controlDisabled || race?.status !== 'running' || raceComplete}
            onClick={handleLogLap}
            type="button"
          >
            Log Lap
          </button>
          <button disabled={controlDisabled || completedLaps === 0} onClick={handleDeleteRecentLap} type="button">
            Delete Recent Lap
          </button>
          <button className="button-danger" disabled={controlDisabled} onClick={handleClearRaceData} type="button">
            Clear Race Data
          </button>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Race projections">
        <MetricCard
          detail="Completed laps saved to the shared race"
          title="Completed Laps"
          value={completedLaps}
        />
        <MetricCard
          detail={completedLaps > 0 ? 'Mean of all completed lap durations' : 'Log a lap to calculate pace'}
          title="Average Lap"
          value={formatAverage(averageLapMs)}
        />
        <MetricCard
          detail={estimatedRemainingLaps !== null ? 'Based on current average pace' : 'Waiting for lap data'}
          title="Estimated Remaining Laps"
          value={estimatedRemainingLaps ?? '--'}
        />
        <MetricCard
          detail="Completed laps plus projected remaining laps"
          title="Estimated Final Laps"
          tone="accent"
          value={estimatedFinalLaps ?? '--'}
        />
        <MetricCard
          detail={
            requiredGainMs !== null && requiredLapMs !== null
              ? `Run ${formatLapTime(requiredLapMs)} average to fit ${oneMoreLapTarget} more laps`
              : 'Log at least one lap while the clock is running'
          }
          title="Time Needed to Gain One More Lap"
          tone="warning"
          value={requiredGainMs !== null ? `${formatSignedGain(requiredGainMs)} / lap` : 'Need laps'}
        />
      </section>

      <LapTable laps={laps} race={race} />
    </main>
  )
}

export default App
