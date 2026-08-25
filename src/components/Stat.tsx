import type { ReactNode } from 'react'

type StatProps = {
  label: string
  value: ReactNode
  description?: string
}

export function Stat({ label, value, description }: StatProps) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {description ? <span className="stat-description">{description}</span> : null}
    </div>
  )
}
