import type { PropsWithChildren } from 'react'

type AlertProps = PropsWithChildren<{
  tone?: 'error' | 'info' | 'success' | 'warning'
  className?: string
}>

export function Alert({ children, className = '', tone = 'info' }: AlertProps) {
  return (
    <div
      className={`alert alert--${tone} ${className}`.trim()}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  )
}
