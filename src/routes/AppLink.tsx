import type { AnchorHTMLAttributes, MouseEvent } from 'react'

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> & {
  onNavigate: (path: string) => void
}

export function AppLink({ href = '/', onNavigate, ...props }: AppLinkProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
      return
    }

    event.preventDefault()
    onNavigate(href)
  }

  return <a {...props} href={href} onClick={onClick} />
}
