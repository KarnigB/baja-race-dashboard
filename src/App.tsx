import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { LapTable } from './components/LapTable'
import { MetricCard } from './components/MetricCard'
import {
  GAIN_DIFFICULT_SECONDS,
  PADDOCK_TARGET_MS,
  getDriverSummaries,
  getFullAverageLapMs,
  getGainOneMoreLapSummary,
  getLastLapMs,
  getPaceDeltaMs,
  getProjection,
  getRollingAverageLapMs,
  getStintSummary,
  getStopSummary,
  getTeamStatusSummary,
} from './lib/metrics'
import {
  addDriver,
  addIssue,
  addStopEvent,
  addTrackedTeam,
  clearRaceData,
  deleteMostRecentLap,
  deleteMostRecentStopEvent,
  endCurrentStint,
  fetchRaceData,
  finishRace,
  logLap,
  pauseRace,
  resetRace,
  resolveIssue,
  resumeRace,
  startDriverStint,
  startRace,
  updateRaceDuration,
  updateTargetLapSeconds,
  updateTeamStatus,
} from './lib/raceSync'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  DEFAULT_RACE_MINUTES,
  MAX_RACE_MINUTES,
  MIN_RACE_MINUTES,
  formatAverage,
  formatClock,
  formatLapTime,
  getDurationMinutes,
  getRaceDurationMs,
  getRaceElapsedMs,
  getRaceRemainingMs,
  minutesToSeconds,
  secondsToMs,
} from './lib/time'
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
} from './types'

type SyncStatus = 'disabled' | 'connecting' | 'connected' | 'error'

const TICK_MS = 250
const REALTIME_TABLES = [
  'laps',
  'stop_events',
  'drivers',
  'stints',
  'issue_logs',
  'tracked_teams',
  'team_status_events',
] as const

function getTargetParts(targetLapSeconds: number | null | undefined) {
  const totalSeconds = Math.max(0, Math.round(targetLapSeconds ?? 0))

  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  }
}

function formatPaceDelta(deltaMs: number | null) {
  if (deltaMs === null) {
    return 'Set target'
  }

  const seconds = Math.abs(deltaMs / 1000).toFixed(1)

  if (deltaMs > 0) {
    return `+${seconds} sec slower than target`
  }

  if (deltaMs < 0) {
    return `-${seconds} sec faster than target`
  }

  return 'On target pace'
}

function getStatusLabel(status: TeamStatus) {
  switch (status) {
    case 'on_track':
      return 'On Track'
    case 'in_pit':
      return 'In Pit'
    case 'in_paddock':
      return 'In Paddock'
    case 'retired':
      return 'Retired'
    case 'unknown':
      return 'Unknown'
  }
}

function getStopEventLabel(eventType: StopEventType) {
  switch (eventType) {
    case 'pit_in':
      return 'Pit In'
    case 'pit_out':
      return 'Pit Out'
    case 'paddock_in':
      return 'Paddock In'
    case 'paddock_out':
      return 'Paddock Out'
  }
}

function App() {
  const [race, setRace] = useState<RaceRow | null>(null)
  const [laps, setLaps] = useState<LapRow[]>([])
  const [stopEvents, setStopEvents] = useState<StopEventRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [stints, setStints] = useState<StintRow[]>([])
  const [issues, setIssues] = useState<IssueLogRow[]>([])
  const [trackedTeams, setTrackedTeams] = useState<TrackedTeamRow[]>([])
  const [teamStatusEvents, setTeamStatusEvents] = useState<TeamStatusEventRow[]>([])
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
  const [driverName, setDriverName] = useState('')
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [issueMessage, setIssueMessage] = useState('')
  const [issueSeverity, setIssueSeverity] = useState<IssueSeverity>('info')
  const [teamName, setTeamName] = useState('')
  const [teamCarNumber, setTeamCarNumber] = useState('')
  const [teamNotes, setTeamNotes] = useState('')
  const [stopNote, setStopNote] = useState('')
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

  const applyRaceData = useCallback((data: Awaited<ReturnType<typeof fetchRaceData>>) => {
    setRace(data.race)
    setLaps(data.laps)
    setStopEvents(data.stopEvents)
    setDrivers(data.drivers)
    setStints(data.stints)
    setIssues(data.issues)
    setTrackedTeams(data.trackedTeams)
    setTeamStatusEvents(data.teamStatusEvents)
  }, [])

  const refreshRaceData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }

    try {
      applyRaceData(await fetchRaceData())
      setSyncWarning(null)
    } catch (error) {
      reportSupabaseError('Unable to load live race data', error)
    } finally {
      setIsLoading(false)
    }
  }, [applyRaceData, reportSupabaseError])

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
    const refreshFromRealtime = () => {
      void refreshRaceData()
    }

    let channel = realtimeClient.channel(`active-race-${raceId}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'races', filter: `id=eq.${raceId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          refreshFromRealtime()
          return
        }

        setRace(payload.new as RaceRow)
      },
    )

    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `race_id=eq.${raceId}` },
        refreshFromRealtime,
      )
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('connected')
        setSyncWarning(null)
        return
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setSyncStatus('error')
        setSyncWarning('Supabase Realtime is not connected. Refresh or check the Supabase project if this persists.')
      }
    })

    return () => {
      void realtimeClient.removeChannel(channel)
    }
  }, [raceId, refreshRaceData])

  const elapsedMs = getRaceElapsedMs(race, now)
  const remainingMs = getRaceRemainingMs(race, now)
  const raceDurationMs = getRaceDurationMs(race)
  const completedLaps = laps.length
  const lastLapMs = getLastLapMs(laps)
  const fullAverageLapMs = getFullAverageLapMs(laps)
  const rollingAverageLapMs = getRollingAverageLapMs(laps)
  const fullProjection = getProjection(remainingMs, completedLaps, fullAverageLapMs)
  const rollingProjection = getProjection(remainingMs, completedLaps, rollingAverageLapMs)
  const paceDeltaMs = getPaceDeltaMs(rollingAverageLapMs, race?.target_lap_seconds ?? null)
  const gainOneMore = getGainOneMoreLapSummary(remainingMs, rollingAverageLapMs)
  const stopSummary = getStopSummary(stopEvents, race, now)
  const stintSummary = getStintSummary(race, drivers, stints, laps, now)
  const driverSummaries = getDriverSummaries(race, drivers, stints, laps, now)
  const trafficSummary = getTeamStatusSummary(trackedTeams, teamStatusEvents)
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
  const targetParts = getTargetParts(race?.target_lap_seconds)
  const rollingLapLabel = completedLaps >= 3 ? 'Rolling 3-lap average' : `Rolling ${completedLaps || 0}-lap average`
  const driverSelectValue = selectedDriverId || drivers[0]?.id || ''
  const activeIssues = issues.filter((issue) => !issue.resolved)
  const combinedStopMs = stopSummary.totalPitMs + stopSummary.totalPaddockMs

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
      applyRaceData(await fetchRaceData())
      setSyncWarning(null)
    } catch (error) {
      reportSupabaseError(label, error)
    } finally {
      setIsMutating(false)
    }
  }

  function handleDurationChange(value: string) {
    void runMutation('Unable to update race duration', async () => {
      if (race) {
        await updateRaceDuration(race.id, Number(value))
      }
    })
  }

  function handleTargetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const minutes = Number(formData.get('targetMinutes') ?? 0)
    const seconds = Number(formData.get('targetSeconds') ?? 0)
    const targetSeconds = Math.max(0, minutesToSeconds(minutes) + seconds)

    void runMutation('Unable to update target lap time', async () => {
      if (race) {
        await updateTargetLapSeconds(race.id, targetSeconds || null)
      }
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
    if (!window.confirm('Reset race clock, laps, stops, and stints? Drivers and tracked teams will stay.')) {
      return
    }

    void runMutation('Unable to reset race', async () => {
      if (race) {
        await resetRace(race)
      }
    })
  }

  function handleClearRaceData() {
    if (!window.confirm('Clear all race data, drivers, issues, tracked teams, laps, stops, and stints?')) {
      return
    }

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

  function handleStopEvent(eventType: StopEventType) {
    void runMutation(`Unable to log ${getStopEventLabel(eventType)}`, async () => {
      if (race) {
        await addStopEvent(race, eventType, stopNote, new Date())
        setStopNote('')
      }
    })
  }

  function handleDeleteRecentStopEvent() {
    void runMutation('Unable to delete most recent stop event', async () => {
      await deleteMostRecentStopEvent(stopEvents)
    })
  }

  function handleAddDriver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runMutation('Unable to add driver', async () => {
      if (race) {
        await addDriver(race.id, driverName)
        setDriverName('')
      }
    })
  }

  function handleStartDriverStint() {
    if (!driverSelectValue) {
      return
    }

    void runMutation('Unable to start driver stint', async () => {
      if (race) {
        await startDriverStint(race, stints, laps, driverSelectValue, new Date())
      }
    })
  }

  function handleEndCurrentStint() {
    void runMutation('Unable to end current stint', async () => {
      if (race) {
        await endCurrentStint(race, stints, laps, new Date())
      }
    })
  }

  function handleAddIssue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runMutation('Unable to add issue log entry', async () => {
      if (race) {
        await addIssue(race.id, issueSeverity, issueMessage)
        setIssueMessage('')
        setIssueSeverity('info')
      }
    })
  }

  function handleResolveIssue(issueId: string) {
    void runMutation('Unable to resolve issue', async () => {
      await resolveIssue(issueId)
    })
  }

  function handleAddTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runMutation('Unable to add tracked team', async () => {
      if (race) {
        await addTrackedTeam(race.id, teamName, teamCarNumber, teamNotes)
        setTeamName('')
        setTeamCarNumber('')
        setTeamNotes('')
      }
    })
  }

  function handleTeamStatus(teamId: string, status: TeamStatus) {
    void runMutation('Unable to update team status', async () => {
      if (race) {
        await updateTeamStatus(race.id, teamId, status, '')
      }
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

      <section className="timer-panel section-block" aria-labelledby="race-clock-heading">
        <div className="timer-panel__main">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Race Clock</p>
              <h2 id="race-clock-heading">Master timer</h2>
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
            <span>Current driver {stintSummary.currentDriver?.name ?? 'Not set'}</span>
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

      <section className="metrics-grid priority-grid" aria-label="Priority race metrics">
        <MetricCard
          detail={`Stint ${formatClock(stintSummary.stintElapsedMs)} | ${stintSummary.stintLaps} stint laps`}
          title="Current Driver"
          tone="accent"
          value={stintSummary.currentDriver?.name ?? 'Not set'}
        />
        <MetricCard
          detail={race?.target_lap_seconds ? formatPaceDelta(getPaceDeltaMs(lastLapMs, race.target_lap_seconds)) : 'Set target to compare'}
          title="Last Lap"
          value={lastLapMs !== null ? formatLapTime(lastLapMs) : '--'}
        />
        <MetricCard
          detail={formatPaceDelta(paceDeltaMs)}
          title={rollingLapLabel}
          value={formatAverage(rollingAverageLapMs)}
        />
        <MetricCard
          detail={`Full average projection: ${fullProjection.final ?? '--'} laps`}
          title="Projected Final Laps"
          tone="accent"
          value={rollingProjection.final ?? '--'}
        />
        <MetricCard
          detail={gainOneMore.detail}
          title="Gain One More Lap"
          tone={gainOneMore.tone === 'good' ? 'accent' : 'warning'}
          value={gainOneMore.label}
        />
        <MetricCard
          detail={`${trafficSummary.counts.on_track} cars on track | ${trafficSummary.confidenceLow ? 'Update statuses' : 'Confidence OK'}`}
          title="Traffic Recommendation"
          tone={trafficSummary.recommendationTone === 'good' ? 'accent' : 'warning'}
          value={trafficSummary.recommendation}
        />
      </section>

      <section className="dashboard-grid">
        <section className="dashboard-panel lap-strategy">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lap Strategy</p>
              <h2>Target and projections</h2>
            </div>
          </div>

          <form className="target-form" key={race?.target_lap_seconds ?? 'target-empty'} onSubmit={handleTargetSubmit}>
            <label>
              <span>Target min</span>
              <input defaultValue={targetParts.minutes} min={0} name="targetMinutes" type="number" />
            </label>
            <label>
              <span>Target sec</span>
              <input defaultValue={targetParts.seconds} max={59} min={0} name="targetSeconds" type="number" />
            </label>
            <button disabled={controlDisabled} type="submit">
              Save Target
            </button>
          </form>

          <div className="compact-stats">
            <div>
              <span>Target lap</span>
              <strong>{race?.target_lap_seconds ? formatLapTime(secondsToMs(race.target_lap_seconds)) : '--'}</strong>
            </div>
            <div>
              <span>Full-race average</span>
              <strong>{formatAverage(fullAverageLapMs)}</strong>
            </div>
            <div>
              <span>Rolling projection</span>
              <strong>{rollingProjection.remaining ?? '--'} remaining / {rollingProjection.final ?? '--'} final</strong>
            </div>
            <div>
              <span>Full average projection</span>
              <strong>{fullProjection.remaining ?? '--'} remaining / {fullProjection.final ?? '--'} final</strong>
            </div>
            <div>
              <span>Required gain threshold</span>
              <strong>Possible under 5 sec/lap, difficult under {GAIN_DIFFICULT_SECONDS} sec/lap</strong>
            </div>
          </div>
        </section>

        <section className="dashboard-panel stops-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Stops</p>
              <h2>Pit and paddock</h2>
            </div>
            <span>{stopSummary.status.replace('_', ' ')}</span>
          </div>

          {stopSummary.paddockWarning ? (
            <div className="danger-banner">Paddock stop over {formatClock(PADDOCK_TARGET_MS)} target.</div>
          ) : null}

          <div className="stop-controls">
            <button disabled={controlDisabled || stopSummary.status !== 'on_track'} onClick={() => handleStopEvent('pit_in')} type="button">
              Pit In
            </button>
            <button disabled={controlDisabled || stopSummary.status !== 'in_pit'} onClick={() => handleStopEvent('pit_out')} type="button">
              Pit Out
            </button>
            <button disabled={controlDisabled || stopSummary.status !== 'on_track'} onClick={() => handleStopEvent('paddock_in')} type="button">
              Paddock In
            </button>
            <button disabled={controlDisabled || stopSummary.status !== 'in_paddock'} onClick={() => handleStopEvent('paddock_out')} type="button">
              Paddock Out
            </button>
          </div>

          <label className="wide-label">
            <span>Stop note</span>
            <input onChange={(event) => setStopNote(event.target.value)} placeholder="Refuel complete, repair started..." value={stopNote} />
          </label>

          <div className="compact-stats">
            <div>
              <span>Current stop</span>
              <strong>{formatClock(stopSummary.currentStopElapsedMs)}</strong>
            </div>
            <div>
              <span>Total pit time</span>
              <strong>{formatClock(stopSummary.totalPitMs)}</strong>
            </div>
            <div>
              <span>Total paddock time</span>
              <strong>{formatClock(stopSummary.totalPaddockMs)}</strong>
            </div>
            <div>
              <span>Combined stop time</span>
              <strong>{formatClock(combinedStopMs)}</strong>
            </div>
            <div>
              <span>Stops</span>
              <strong>{stopSummary.pitStops} pit / {stopSummary.paddockStops} paddock</strong>
            </div>
            <div>
              <span>Longest / last</span>
              <strong>{stopSummary.longestStopMs ? formatClock(stopSummary.longestStopMs) : '--'} / {stopSummary.lastStopMs ? formatClock(stopSummary.lastStopMs) : '--'}</strong>
            </div>
          </div>

          <button disabled={controlDisabled || stopEvents.length === 0} onClick={handleDeleteRecentStopEvent} type="button">
            Correct Recent Stop Event
          </button>
        </section>

        <section className="dashboard-panel driver-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Driver / Stint</p>
              <h2>Current driver and comparison</h2>
            </div>
          </div>

          <form className="inline-form" onSubmit={handleAddDriver}>
            <input onChange={(event) => setDriverName(event.target.value)} placeholder="Driver name" value={driverName} />
            <button disabled={controlDisabled || !driverName.trim()} type="submit">
              Add Driver
            </button>
          </form>

          <div className="driver-controls">
            <select onChange={(event) => setSelectedDriverId(event.target.value)} value={driverSelectValue}>
              <option value="">Select driver</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
            <button disabled={controlDisabled || !driverSelectValue} onClick={handleStartDriverStint} type="button">
              Start Stint
            </button>
            <button disabled={controlDisabled || !stintSummary.currentStint} onClick={handleEndCurrentStint} type="button">
              End Stint
            </button>
          </div>

          <div className="compact-stats">
            <div>
              <span>Current driver</span>
              <strong>{stintSummary.currentDriver?.name ?? '--'}</strong>
            </div>
            <div>
              <span>Stint time</span>
              <strong>{formatClock(stintSummary.stintElapsedMs)}</strong>
            </div>
            <div>
              <span>Stint laps</span>
              <strong>{stintSummary.stintLaps}</strong>
            </div>
          </div>

          <div className="mini-table-wrap">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Laps</th>
                  <th>Avg</th>
                  <th>Fastest</th>
                  <th>Drive time</th>
                </tr>
              </thead>
              <tbody>
                {driverSummaries.length > 0 ? (
                  driverSummaries.map((summary) => (
                    <tr key={summary.driver.id}>
                      <td>{summary.driver.name}</td>
                      <td>{summary.laps}</td>
                      <td>{formatAverage(summary.averageLapMs)}</td>
                      <td>{summary.fastestLapMs ? formatLapTime(summary.fastestLapMs) : '--'}</td>
                      <td>{formatClock(summary.drivingTimeMs)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No stint data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-panel traffic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Traffic / Other Teams</p>
              <h2>Competitor status</h2>
            </div>
          </div>

          <form className="team-form" onSubmit={handleAddTeam}>
            <input onChange={(event) => setTeamCarNumber(event.target.value)} placeholder="Car #" value={teamCarNumber} />
            <input onChange={(event) => setTeamName(event.target.value)} placeholder="School / team" value={teamName} />
            <input onChange={(event) => setTeamNotes(event.target.value)} placeholder="Notes" value={teamNotes} />
            <button disabled={controlDisabled || !teamName.trim() || !teamCarNumber.trim()} type="submit">
              Add Team
            </button>
          </form>

          <div className={`recommendation recommendation--${trafficSummary.recommendationTone}`}>
            {trafficSummary.recommendation}
          </div>

          <div className="traffic-counts">
            <span>Track {trafficSummary.counts.on_track}</span>
            <span>Pit {trafficSummary.counts.in_pit}</span>
            <span>Paddock {trafficSummary.counts.in_paddock}</span>
            <span>Unknown {trafficSummary.counts.unknown}</span>
            <span>Retired {trafficSummary.counts.retired}</span>
          </div>

          <div className="team-list">
            {trackedTeams.length > 0 ? (
              trackedTeams.map((team) => {
                const currentStatus = trafficSummary.latestStatusByTeamId.get(team.id)?.status ?? 'unknown'

                return (
                  <div className="team-row" key={team.id}>
                    <div>
                      <strong>#{team.car_number} {team.school_name}</strong>
                      <span>{getStatusLabel(currentStatus)}{team.notes ? ` | ${team.notes}` : ''}</span>
                    </div>
                    <div className="team-actions">
                      {(['on_track', 'in_pit', 'in_paddock', 'unknown', 'retired'] as TeamStatus[]).map((status) => (
                        <button
                          className={currentStatus === status ? 'is-active' : ''}
                          disabled={controlDisabled}
                          key={status}
                          onClick={() => handleTeamStatus(team.id, status)}
                          type="button"
                        >
                          {getStatusLabel(status)}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="empty-text">Add teams before the race for traffic recommendations.</p>
            )}
          </div>
        </section>

        <section className="dashboard-panel issue-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Issue Log</p>
              <h2>Live team updates</h2>
            </div>
            <span>{activeIssues.length} active</span>
          </div>

          <form className="issue-form" onSubmit={handleAddIssue}>
            <select onChange={(event) => setIssueSeverity(event.target.value as IssueSeverity)} value={issueSeverity}>
              <option value="info">Info</option>
              <option value="watch">Watch</option>
              <option value="critical">Critical</option>
            </select>
            <input onChange={(event) => setIssueMessage(event.target.value)} placeholder="Driver reports vibration..." value={issueMessage} />
            <button disabled={controlDisabled || !issueMessage.trim()} type="submit">
              Add Update
            </button>
          </form>

          <div className="issue-list">
            {issues.length > 0 ? (
              issues.map((issue) => (
                <div className={`issue-row issue-row--${issue.severity} ${issue.resolved ? 'is-resolved' : ''}`} key={issue.id}>
                  <div>
                    <span>{new Date(issue.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} | {issue.severity}</span>
                    <strong>{issue.message}</strong>
                  </div>
                  <button disabled={controlDisabled || issue.resolved} onClick={() => handleResolveIssue(issue.id)} type="button">
                    {issue.resolved ? 'Resolved' : 'Resolve'}
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-text">No issue updates yet.</p>
            )}
          </div>
        </section>
      </section>

      <LapTable laps={laps} race={race} />
    </main>
  )
}

export default App
