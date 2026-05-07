import type { LapRow, RaceRow } from '../types'
import { formatClock, formatLapTime, getRaceDurationMs, secondsToMs } from '../lib/time'

type LapTableProps = {
  laps: LapRow[]
  race: RaceRow | null
}

export function LapTable({ laps, race }: LapTableProps) {
  const orderedLaps = [...laps].reverse()
  const raceDurationMs = getRaceDurationMs(race)

  return (
    <section className="lap-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Timing log</p>
          <h2>Lap history</h2>
        </div>
        <span>{laps.length} logged</span>
      </div>

      <div className="lap-table-wrap">
        <table className="lap-table">
          <thead>
            <tr>
              <th>Lap</th>
              <th>Lap time</th>
              <th>Race remaining</th>
              <th>Logged</th>
            </tr>
          </thead>
          <tbody>
            {orderedLaps.length > 0 ? (
              orderedLaps.map((lap) => (
                <tr key={lap.id}>
                  <td>#{lap.lap_number}</td>
                  <td>{formatLapTime(secondsToMs(lap.lap_duration_seconds))}</td>
                  <td>{formatClock(Math.max(0, raceDurationMs - secondsToMs(lap.race_elapsed_seconds)))}</td>
                  <td>{new Date(lap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="lap-table__empty" colSpan={4}>
                  No laps logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
