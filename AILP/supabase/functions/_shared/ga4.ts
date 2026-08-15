import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { getGoogleAnalyticsScope, getGoogleServiceAccount } from './env.ts'

type RunReportRow = {
  date: string
  sourceMedium: string
  sessions: number
  totalUsers: number
  screenPageViews: number
  conversions: number
  eventCount: number
  engagementRate: number | null
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function getAccessToken(): Promise<string> {
  const account = getGoogleServiceAccount()
  const scope = getGoogleAnalyticsScope()
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: account.client_email,
    scope,
    aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(account.private_key),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  )

  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`

  const tokenResponse = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text()
    throw new Error(`Failed to fetch Google access token: ${body}`)
  }

  const tokenJson = await tokenResponse.json()
  return tokenJson.access_token as string
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')

  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
}

function googleDateToIso(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function metricNumber(value: string | undefined): number {
  if (!value) {
    return 0
  }

  return Number(value)
}

export async function runGa4Report(args: {
  propertyId: string
  pagePath: string
  dateFrom: string
  dateTo: string
}): Promise<RunReportRow[]> {
  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${args.propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dimensions: [
          { name: 'date' },
          { name: 'sessionSourceMedium' },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'conversions' },
          { name: 'eventCount' },
          { name: 'engagementRate' },
        ],
        dateRanges: [
          {
            startDate: args.dateFrom,
            endDate: args.dateTo,
          },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: {
              matchType: 'BEGINS_WITH',
              value: args.pagePath,
            },
          },
        },
      }),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GA4 runReport failed: ${body}`)
  }

  const json = await response.json()
  const rows = (json.rows ?? []) as Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>

  return rows.map((row) => ({
    date: googleDateToIso(row.dimensionValues?.[0]?.value ?? ''),
    sourceMedium: row.dimensionValues?.[1]?.value ?? '(all)',
    sessions: metricNumber(row.metricValues?.[0]?.value),
    totalUsers: metricNumber(row.metricValues?.[1]?.value),
    screenPageViews: metricNumber(row.metricValues?.[2]?.value),
    conversions: metricNumber(row.metricValues?.[3]?.value),
    eventCount: metricNumber(row.metricValues?.[4]?.value),
    engagementRate: row.metricValues?.[5]?.value ? Number(row.metricValues[5].value) : null,
  }))
}
