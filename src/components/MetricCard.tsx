import type { ReactNode } from 'react'

type MetricCardProps = {
  title: string
  value: ReactNode
  detail?: ReactNode
  tone?: 'default' | 'accent' | 'warning'
}

export function MetricCard({ title, value, detail, tone = 'default' }: MetricCardProps) {
  return (
    <section className={`metric-card metric-card--${tone}`}>
      <p className="metric-card__title">{title}</p>
      <div className="metric-card__value">{value}</div>
      {detail ? <div className="metric-card__detail">{detail}</div> : null}
    </section>
  )
}
