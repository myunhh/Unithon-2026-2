import type { HTMLAttributes, PropsWithChildren } from 'react'

export function EmptyRow({ children, className = '', ...props }: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) {
  return <p {...props} className={`empty-row ${className}`.trim()}>{children}</p>
}
