import { useEffect, useState } from 'react'
import './App.css'
import { LapTable } from './components/LapTable'
import { MetricCard } from './components/MetricCard'
import {
  DEFAULT_RACE_MINUTES,
  MAX_RACE_MINUTES,
  MIN_RACE_MINUTES,
  clampDurationMinutes,
  createInitialRaceState,
  formatAverage,
  formatClock,
  formatLapTime,
  formatSignedGain,
  getElapsedMs,
  getRemainingMs,
  minutesToMs,
} from './lib/time'
import type { Lap, RaceState, RaceStatus } from './types'

const STORAGE_KEY = 'baja-race-dashboard-state'
const TICK_MS = 250

function isRaceStatus(value: unknown): value is RaceStatus {
  return value === 'ready' || value === 'running' || value === 'paused'
}

function isLap(value: unknown): value is Lap {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const lap = value as Partial<Lap>

  return (
    typeof lap.id === 'string' &&
    typeof lap.number === 'number' &&
    typeof lap.loggedAt === 'number' &&
    typeof lap.raceElapsedMs === 'number' &&
    typeof lap.lapDurationMs === 'number' &&
    typeof lap.remainingMs === 'number'
  )
}

function loadRaceState(): RaceState {
  const fallback = createInitialRaceState()
  const stored = window.localStorage.getItem(STORAGE_KEY)

  if (!stored) {
    return fallback
  }

  try {
    const parsed = JSON.parse(stored) as Partial<RaceState>
    const durationMinutes = clampDurationMinutes(parsed.durationMinutes ?? DEFAULT_RACE_MINUTES)
    const status = isRaceStatus(parsed.status) ? parsed.status : 'ready'
    const laps = Array.isArray(parsed.laps) ? parsed.laps.filter(isLap) : []
    const durationMs = minutesToMs(durationMinutes)
    const elapsedBeforeRunMs =
      typeof parsed.elapsedBeforeRunMs === 'number'
        ? Math.min(durationMs, Math.max(0, parsed.elapsedBeforeRunMs))
        : 0

    return {
      durationMinutes,
      durationMs,
      status,
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : null,
      elapsedBeforeRunMs,
      laps,
    }
  } catch {
    return fallback
  }
}

function App() {
  const [raceState, setRaceState] = useState<RaceState>(loadRaceState)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(raceState))
  }, [raceState])

  const elapsedMs = getElapsedMs(raceState, now)
  const remainingMs = getRemainingMs(raceState, now)

  useEffect(() => {
    if (raceState.status === 'running' && remainingMs === 0) {
      setRaceState((current) => ({
        ...current,
        status: 'paused',
        startedAt: null,
        elapsedBeforeRunMs: current.durationMs,
      }))
    }
  }, [raceState.status, remainingMs])

  const completedLaps = raceState.laps.length
  const totalLapMs = raceState.laps.reduce((sum, lap) => sum + lap.lapDurationMs, 0)
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
  const canEditDuration = raceState.status === 'ready' && completedLaps === 0 && elapsedMs === 0
  const raceComplete = remainingMs === 0

  function handleDurationChange(value: string) {
    const durationMinutes = clampDurationMinutes(Number(value))

    setRaceState((current) => ({
      ...current,
      durationMinutes,
      durationMs: minutesToMs(durationMinutes),
      elapsedBeforeRunMs: 0,
      startedAt: null,
    }))
  }

  function handleStart() {
    const timestamp = Date.now()

    setRaceState((current) => ({
      ...current,
      status: 'running',
      startedAt: timestamp,
      elapsedBeforeRunMs: 0,
      laps: [],
    }))
    setNow(timestamp)
  }

  function handlePause() {
    const timestamp = Date.now()

    setRaceState((current) => ({
      ...current,
      status: 'paused',
      startedAt: null,
      elapsedBeforeRunMs: getElapsedMs(current, timestamp),
    }))
    setNow(timestamp)
  }

  function handleResume() {
    const timestamp = Date.now()

    setRaceState((current) => ({
      ...current,
      status: 'running',
      startedAt: timestamp,
    }))
    setNow(timestamp)
  }

  function handleReset() {
    setRaceState((current) => createInitialRaceState(current.durationMinutes))
    setNow(Date.now())
  }

  function handleClearRaceData() {
    window.localStorage.removeItem(STORAGE_KEY)
    setRaceState(createInitialRaceState())
    setNow(Date.now())
  }

  function handleLogLap() {
    const timestamp = Date.now()

    setRaceState((current) => {
      const raceElapsedMs = getElapsedMs(current, timestamp)
      const previousLapElapsedMs = current.laps.at(-1)?.raceElapsedMs ?? 0
      const remainingAtLapMs = Math.max(0, current.durationMs - raceElapsedMs)
      const lapNumber = current.laps.length + 1

      return {
        ...current,
        laps: [
          ...current.laps,
          {
            id: `${timestamp}-${lapNumber}`,
            number: lapNumber,
            loggedAt: timestamp,
            raceElapsedMs,
            lapDurationMs: Math.max(0, raceElapsedMs - previousLapElapsedMs),
            remainingMs: remainingAtLapMs,
          },
        ],
      }
    })
    setNow(timestamp)
  }

  function handleDeleteRecentLap() {
    setRaceState((current) => ({
      ...current,
      laps: current.laps.slice(0, -1),
    }))
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Student endurance command</p>
          <h1>Baja Race Dashboard</h1>
        </div>
        <div className={`race-status race-status--${raceState.status}`}>
          <span></span>
          {raceComplete ? 'Race complete' : raceState.status}
        </div>
      </header>

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
                value={raceState.durationMinutes}
              />
              <span>min</span>
            </label>
          </div>

          <div className="master-clock" aria-live="polite">
            {formatClock(remainingMs)}
          </div>
          <div className="timer-subline">
            <span>Elapsed {formatClock(elapsedMs)}</span>
            <span>Race length {formatClock(raceState.durationMs)}</span>
          </div>
        </div>

        <div className="control-grid">
          <button disabled={raceState.status !== 'ready'} onClick={handleStart} type="button">
            Start
          </button>
          <button disabled={raceState.status !== 'running'} onClick={handlePause} type="button">
            Pause
          </button>
          <button disabled={raceState.status !== 'paused' || raceComplete} onClick={handleResume} type="button">
            Resume
          </button>
          <button onClick={handleReset} type="button">
            Reset
          </button>
          <button
            className="button-primary"
            disabled={raceState.status !== 'running' || raceComplete}
            onClick={handleLogLap}
            type="button"
          >
            Log Lap
          </button>
          <button disabled={completedLaps === 0} onClick={handleDeleteRecentLap} type="button">
            Delete Recent Lap
          </button>
          <button className="button-danger" onClick={handleClearRaceData} type="button">
            Clear Race Data
          </button>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Race projections">
        <MetricCard
          detail="Completed laps logged by the pit crew"
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

      <LapTable laps={raceState.laps} />
    </main>
  )
}

export default App
