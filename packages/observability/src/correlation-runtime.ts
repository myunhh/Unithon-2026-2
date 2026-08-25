export type SafePropertyRead =
  | { readonly ok: true; readonly present: boolean; readonly value: unknown }
  | { readonly ok: false; readonly present: false; readonly value: undefined }

const FAILED_PROPERTY_READ = { ok: false, present: false, value: undefined } as const

export function isSafeRecord(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false
  try {
    return !Array.isArray(value)
  } catch (error) {
    if (error instanceof Error) return false
    return false
  }
}

export function readSafeProperty(record: object, key: string): SafePropertyRead {
  try {
    const present = Reflect.has(record, key)
    return present
      ? { ok: true, present: true, value: Reflect.get(record, key) }
      : { ok: true, present: false, value: undefined }
  } catch (error) {
    if (error instanceof Error) return FAILED_PROPERTY_READ
    return FAILED_PROPERTY_READ
  }
}
