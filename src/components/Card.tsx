import type { HTMLAttributes, PropsWithChildren } from 'react'

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    as?: 'article' | 'aside' | 'div' | 'form' | 'section'
    flush?: boolean
  }
>

export function Card({ as: Tag = 'section', children, className = '', flush = false, ...props }: CardProps) {
  return (
    <Tag {...props} className={`card${flush ? ' card--flush' : ''} ${className}`.trim()}>
      {children}
    </Tag>
  )
}
