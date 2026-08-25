import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
  }
>

export function Button({ children, className = '', variant = 'primary', ...props }: ButtonProps) {
  return (
    <button {...props} className={`button button--${variant} ${className}`.trim()} type={props.type ?? 'button'}>
      {children}
    </button>
  )
}
