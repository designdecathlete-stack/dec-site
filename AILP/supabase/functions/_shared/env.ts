import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

type GoogleServiceAccount = {
  client_email: string
  private_key: string
  token_uri?: string
}

function required(name: string): string {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

function optional(name: string): string | null {
  return Deno.env.get(name) ?? null
}

function parseKeyMap(name: string): Record<string, string> {
  const raw = Deno.env.get(name)

  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    throw new Error(`Invalid JSON in environment variable: ${name}`)
  }
}

export function getSupabaseUrl(): string {
  return required('SUPABASE_URL')
}

export function getPublishableKey(): string {
  const keys = parseKeyMap('SUPABASE_PUBLISHABLE_KEYS')
  return keys.default ?? required('SUPABASE_ANON_KEY')
}

export function getSecretKey(): string {
  const keys = parseKeyMap('SUPABASE_SECRET_KEYS')
  return keys.default ?? required('SUPABASE_SECRET_KEY')
}

export function getCronToken(): string | null {
  return optional('APP_INTERNAL_CRON_TOKEN')
}

export function getGoogleServiceAccount(): GoogleServiceAccount {
  const raw = required('GOOGLE_SERVICE_ACCOUNT_JSON')
  return JSON.parse(raw) as GoogleServiceAccount
}

export function getGoogleAnalyticsScope(): string {
  return optional('GOOGLE_GA4_SCOPES') ?? 'https://www.googleapis.com/auth/analytics.readonly'
}
