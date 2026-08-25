import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ServerEnv } from './env.js'

/**
 * Server-only boundary. Do not import this module from src/, and never prefix these values with VITE_.
 */
export function createServerSupabaseClient(environment: ServerEnv): SupabaseClient | null {
  if (!environment.supabase) return null

  return createClient(environment.supabase.url, environment.supabase.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
