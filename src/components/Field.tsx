import type { ReactNode } from 'react'

type FieldProps = {
  children: ReactNode
  error?: string | null
  errorId?: string
  help?: string
  helpId?: string
  htmlFor?: string
  label: ReactNode
  optional?: boolean
}

export function Field({ children, error, errorId, help, helpId, htmlFor, label, optional = false }: FieldProps) {
  const labelContent = (
    <>
      {label}
      {optional ? <span className="field-optional">선택</span> : null}
    </>
  )

  return (
    <div className="field">
      {htmlFor ? <label className="field-label" htmlFor={htmlFor}>{labelContent}</label> : <p className="field-label">{labelContent}</p>}
      {children}
      {help ? <p className="field-help" id={helpId}>{help}</p> : null}
      {error ? <p className="field-error" id={errorId} role="alert">{error}</p> : null}
    </div>
  )
}
