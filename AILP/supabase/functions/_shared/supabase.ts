import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

import { getPublishableKey, getSecretKey, getSupabaseUrl } from './env.ts'

export function createServiceClient() {
  return createClient(getSupabaseUrl(), getSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function createUserClient(req: Request) {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader) {
    return null
  }

  return createClient(getSupabaseUrl(), getPublishableKey(), {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function requireUser(req: Request) {
  const client = createUserClient(req)

  if (!client) {
    throw new Error('Missing Authorization header')
  }

  const { data, error } = await client.auth.getUser()

  if (error || !data.user) {
    throw new Error('Failed to resolve authenticated user')
  }

  return { client, user: data.user }
}
