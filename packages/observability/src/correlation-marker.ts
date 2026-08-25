const SENSITIVE_SINGLE_MARKERS = [
  'authorization',
  'bearer',
  'basic',
  'body',
  'content',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'error',
  'output',
  'password',
  'path',
  'pdf',
  'prompt',
  'raw',
  'secret',
  'selected',
  'selection',
  'session',
  'text',
  'token',
  'url',
  'key',
] as const

const SENSITIVE_COMPOSITE_MARKERS = [
  ['access', 'token'],
  ['api', 'key'],
  ['client', 'credential'],
  ['client', 'secret'],
  ['id', 'token'],
  ['absolute', 'path'],
  ['local', 'pdf', 'path'],
  ['model', 'output'],
  ['model', 'output', 'sensitive', 'text'],
  ['pdf', 'body'],
  ['pdf', 'path'],
  ['private', 'key'],
  ['private', 'pdf'],
  ['private', 'pdf', 'path'],
  ['prompt', 'sensitive', 'text'],
  ['provider', 'body'],
  ['provider', 'error'],
  ['raw', 'output'],
  ['raw', 'provider', 'body'],
  ['raw', 'provider', 'error'],
  ['refresh', 'token'],
  ['selected', 'text'],
  ['session', 'cookie'],
  ['signed', 'url'],
  ['user', 'prompt'],
] as const

const JOINED_SINGLE_MARKERS = [
  'authorization',
  'basic',
  'bearer',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'key',
  'password',
  'prompt',
  'secret',
  'token',
  'url',
] as const

type NormalizedCorrelationValue = Readonly<{
  readonly value: string
  readonly starts: readonly boolean[]
  readonly ends: readonly boolean[]
}>

function isLower(value: string | undefined): boolean {
  return value !== undefined && value >= 'a' && value <= 'z'
}

function isUpper(value: string | undefined): boolean {
  return value !== undefined && value >= 'A' && value <= 'Z'
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= '0' && value <= '9'
}

function isAlphaNumeric(value: string | undefined): boolean {
  return isLower(value) || isUpper(value) || isDigit(value)
}

function normalize(value: string): NormalizedCorrelationValue {
  const characters: string[] = []
  const starts: boolean[] = []
  const ends: boolean[] = []

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === undefined || !isAlphaNumeric(character)) continue
    const previous = value[index - 1]
    const next = value[index + 1]
    starts.push(
      characters.length === 0 ||
        !isAlphaNumeric(previous) ||
        (isLower(previous) && isUpper(character)) ||
        (isDigit(previous) && !isDigit(character)),
    )
    ends.push(
      !isAlphaNumeric(next) ||
        (isUpper(character) && isLower(next)) ||
        (isLower(character) && isUpper(next)) ||
        (!isDigit(character) && isDigit(next)),
    )
    characters.push(character.toLowerCase())
  }

  return { value: characters.join(''), starts, ends }
}

function hasBoundary(
  normalized: NormalizedCorrelationValue,
  start: number,
  end: number,
): boolean {
  return normalized.starts[start] === true && normalized.ends[end - 1] === true
}

function startsWithSensitiveMarker(value: string): boolean {
  return SENSITIVE_SINGLE_MARKERS.some((marker) => value.startsWith(marker))
}

function isJoinedSingleMarker(marker: string): boolean {
  return JOINED_SINGLE_MARKERS.some((value) => value === marker)
}

function containsSensitiveComposite(normalized: NormalizedCorrelationValue): boolean {
  return SENSITIVE_COMPOSITE_MARKERS.some((parts) => {
    const composite = parts.join('')
    let start = normalized.value.indexOf(composite)
    while (start >= 0) {
      const end = start + composite.length
      if (
        hasBoundary(normalized, start, end) ||
        (start > 0 && end < normalized.value.length)
      ) return true
      start = normalized.value.indexOf(composite, start + 1)
    }
    return false
  })
}

function containsBoundedSingleMarker(normalized: NormalizedCorrelationValue): boolean {
  return SENSITIVE_SINGLE_MARKERS.some((marker) => {
    let start = normalized.value.indexOf(marker)
    while (start >= 0) {
      const end = start + marker.length
      const suffix = normalized.value.slice(end)
      const hasJoinedPrefixOnly = isJoinedSingleMarker(marker) && start > 0 && suffix.length === 0
      const followsSensitiveMarker = startsWithSensitiveMarker(suffix)
      if (hasBoundary(normalized, start, end) && !hasJoinedPrefixOnly && !followsSensitiveMarker) {
        return true
      }
      start = normalized.value.indexOf(marker, start + 1)
    }
    return false
  })
}

function containsJoinedSingleMarker(normalized: NormalizedCorrelationValue): boolean {
  return JOINED_SINGLE_MARKERS.some((marker) => {
    let start = normalized.value.indexOf(marker)
    while (start >= 0) {
      const end = start + marker.length
      if (start > 0 && end < normalized.value.length) return true
      start = normalized.value.indexOf(marker, start + marker.length)
    }
    return false
  })
}

export function isSensitiveCorrelationValue(value: string): boolean {
  const normalized = normalize(value)
  return (
    containsSensitiveComposite(normalized) ||
    containsJoinedSingleMarker(normalized) ||
    containsBoundedSingleMarker(normalized)
  )
}
