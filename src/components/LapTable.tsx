import type { Lap } from '../types'
import { formatClock, formatLapTime } from '../lib/time'

type LapTableProps = {
  laps: Lap[]
}

export function LapTable({ laps }: LapTableProps) {
  const orderedLaps = [...laps].reverse()

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
                  <td>#{lap.number}</td>
                  <td>{formatLapTime(lap.lapDurationMs)}</td>
                  <td>{formatClock(lap.remainingMs)}</td>
                  <td>{new Date(lap.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
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
