import type { AgentMetadata } from './contracts.js'

export type JsonObject = Record<string, unknown>

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringAt(value: unknown, key: string): string | undefined {
  return isJsonObject(value) && typeof value[key] === 'string' ? value[key] : undefined
}

export function numberAt(value: unknown, key: string): number | undefined {
  return isJsonObject(value) && typeof value[key] === 'number' ? value[key] : undefined
}

/**
 * Select only scalar protocol fields for metadata. This prevents arbitrary
 * provider payloads (tool arguments, prompts, and file contents) leaking over
 * the desktop boundary.
 */
export function scalarMetadata(source: unknown, keys: readonly string[]): AgentMetadata {
  if (!isJsonObject(source)) return {}
  const metadata: Record<string, string | number | boolean | null> = {}
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      metadata[key] = value
    }
  }
  return metadata
}

export function parseJsonObject(line: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(line)
    return isJsonObject(value) ? value : undefined
  } catch {
    return undefined
  }
}
