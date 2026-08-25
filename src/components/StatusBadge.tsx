type BadgeTone = 'ready' | 'working' | 'warning' | 'error'

export function StatusBadge({ children, tone = 'ready' }: { children: string; tone?: BadgeTone }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>
}
