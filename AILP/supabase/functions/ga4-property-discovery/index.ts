import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { listGa4PropertyCandidates } from '../_shared/ga4.ts'
import { resolveAnalyticsSettings } from '../_shared/analytics-settings.ts'
import { badRequest, forbidden, json, methodNotAllowed, optionsResponse, serverError, unauthorized } from '../_shared/http.ts'
import { createApiLogger } from '../_shared/logging.ts'
import { requireUser } from '../_shared/supabase.ts'

type DiscoveryBody = {
  lp_project_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse()
  }

  const startedAt = Date.now()
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const logger = createApiLogger({
    requestId,
    functionName: 'ga4-property-discovery',
    httpMethod: req.method,
  })

  if (req.method !== 'POST') {
    await logger.log({
      level: 'warn',
      stage: 'method_not_allowed',
      message: 'Rejected non-POST request',
      statusCode: 405,
      durationMs: Date.now() - startedAt,
    })
    return methodNotAllowed()
  }

  try {
    const { client, user } = await requireUser(req)
    logger.setContext({ actorUserId: user.id })
    const body = (await req.json()) as DiscoveryBody

    const { data: isAdmin, error: roleError } = await client.rpc('current_user_is_admin')

    if (roleError) {
      throw new Error(roleError.message)
    }

    if (!isAdmin) {
      await logger.log({
        level: 'warn',
        stage: 'permission_denied',
        message: 'Rejected GA4 property discovery for non-admin user',
        statusCode: 403,
        durationMs: Date.now() - startedAt,
      })
      return forbidden('Admin access is required')
    }

    let publicUrl: string | null = null
    let lpProjectId: string | null = null
    let settings: ReturnType<typeof resolveAnalyticsSettings> | null = null

    if (body.lp_project_id) {
      const { data: lpProject, error: lpError } = await client
        .from('lp_projects')
        .select('id, client_id, public_url, ga4_page_path, clients(ga4_property_id), lp_analytics_settings(ga4_property_id,ga4_page_path,ga4_measurement_id,gtm_container_id,is_active)')
        .eq('id', body.lp_project_id)
        .single()

      if (lpError || !lpProject) {
        await logger.log({
          level: 'warn',
          stage: 'lp_project_unavailable',
          message: 'LP project is not accessible for GA4 discovery',
          statusCode: 400,
          durationMs: Date.now() - startedAt,
        })
        return badRequest('lp_project_id is invalid')
      }

      logger.setContext({ lpProjectId: lpProject.id, clientId: lpProject.client_id })
      publicUrl = lpProject.public_url
      lpProjectId = lpProject.id
      settings = resolveAnalyticsSettings(lpProject)
    }

    const candidates = await listGa4PropertyCandidates({ publicUrl })
    await logger.log({
      stage: 'completed',
      message: 'Resolved GA4 property candidates',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      metadata: {
        lp_project_id: lpProjectId,
        public_url: publicUrl,
        candidate_count: candidates.length,
        matched_host_count: candidates.filter((candidate) => candidate.matchedHost).length,
      },
    })

    return json({
      lp_project_id: lpProjectId,
      public_url: publicUrl,
      candidates,
      analytics_settings: settings,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authorization')) {
      await logger.log({
        level: 'warn',
        stage: 'authorization_failed',
        message: error.message,
        statusCode: 401,
        durationMs: Date.now() - startedAt,
      })
      return unauthorized(error.message)
    }

    await logger.log({
      level: 'error',
      stage: 'request_failed',
      message: error instanceof Error ? error.message : 'Unexpected error',
      statusCode: 500,
      durationMs: Date.now() - startedAt,
    })
    return serverError(error instanceof Error ? error.message : 'Unexpected error')
  }
})
