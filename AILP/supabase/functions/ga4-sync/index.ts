import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { runGa4Report } from '../_shared/ga4.ts'
import { getCronToken } from '../_shared/env.ts'
import { badRequest, forbidden, json, methodNotAllowed, optionsResponse, serverError, unauthorized } from '../_shared/http.ts'
import { createApiLogger } from '../_shared/logging.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

type SyncBody = {
  lp_project_id?: string
  date_from: string
  date_to: string
}

function isInternalRequest(req: Request): boolean {
  const cronToken = getCronToken()
  const requestToken = req.headers.get('x-internal-cron-token')
  return Boolean(cronToken && requestToken && cronToken === requestToken)
}

async function resolveTargets(reader: {
  from: ReturnType<typeof createServiceClient>['from']
}, body: SyncBody) {
  let query = reader
    .from('lp_projects')
    .select('id, client_id, ga4_page_path, clients!inner(ga4_property_id)')
    .eq('status', 'active')

  if (body.lp_project_id) {
    query = query.eq('id', body.lp_project_id)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

async function createRunningJob(service: ReturnType<typeof createServiceClient>, target: {
  client_id: string
  id: string
}, body: SyncBody) {
  const { data: job, error } = await service
    .from('ga4_sync_jobs')
    .insert({
      client_id: target.client_id,
      lp_project_id: target.id,
      date_from: body.date_from,
      date_to: body.date_to,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !job) {
    throw new Error(error?.message ?? 'Failed to create GA4 sync job')
  }

  return job
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse()
  }

  const startedAt = Date.now()
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const logger = createApiLogger({
    requestId,
    functionName: 'ga4-sync',
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
    const body = (await req.json()) as SyncBody
    await logger.log({
      stage: 'request_received',
      message: 'Received GA4 sync request',
      metadata: {
        has_lp_project_id: Boolean(body.lp_project_id),
        date_from: body.date_from ?? null,
        date_to: body.date_to ?? null,
      },
    })

    if (!body.date_from || !body.date_to) {
      await logger.log({
        level: 'warn',
        stage: 'validation_failed',
        message: 'Missing required date range',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
      })
      return badRequest('date_from and date_to are required')
    }

    let actorUserId: string | null = null
    let userReader: ReturnType<typeof createServiceClient> | null = null
    const internalRequest = isInternalRequest(req)

    if (!internalRequest) {
      const { client, user } = await requireUser(req)
      actorUserId = user.id
      userReader = client as unknown as ReturnType<typeof createServiceClient>
      logger.setContext({ actorUserId })
    }

    const service = createServiceClient()
    const targets = await resolveTargets(userReader ?? service, body)
    await logger.log({
      stage: 'targets_resolved',
      message: 'Resolved LP targets for GA4 sync',
      metadata: {
        target_count: targets.length,
        internal_request: internalRequest,
      },
    })

    if (targets.length === 0) {
      await logger.log({
        stage: 'completed',
        message: 'No LP targets matched the sync request',
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      })
      return json({ synced: 0, jobs: [] })
    }

    const results: Array<{ lp_project_id: string; ga4_sync_job_id: string; rows: number; status: 'succeeded' | 'failed' | 'skipped'; error_message?: string }> = []

    for (const target of targets) {
      const propertyId = target.clients.ga4_property_id
      const job = await createRunningJob(service, target, body)
      logger.setContext({ lpProjectId: target.id, clientId: target.client_id, appJobId: job.id })
      await logger.log({
        stage: 'job_created',
        message: 'Created GA4 sync job',
        metadata: {
          ga4_property_id: propertyId ?? null,
        },
      })

      if (!propertyId) {
        const errorMessage = `Missing ga4_property_id for lp_project_id=${target.id}`

        await service
          .from('ga4_sync_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            finished_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        results.push({
          lp_project_id: target.id,
          ga4_sync_job_id: job.id,
          rows: 0,
          status: 'skipped',
          error_message: errorMessage,
        })
        await logger.log({
          level: 'warn',
          stage: 'target_skipped',
          message: 'Skipped GA4 sync because property ID is missing',
          metadata: {
            ga4_sync_job_id: job.id,
          },
        })
        continue
      }

      try {
        const rows = await runGa4Report({
          propertyId,
          pagePath: target.ga4_page_path,
          dateFrom: body.date_from,
          dateTo: body.date_to,
        })

        if (rows.length > 0) {
          const { error: upsertError } = await service.from('ga4_daily_metrics').upsert(
            rows.map((row) => ({
              lp_project_id: target.id,
              metric_date: row.date,
              source_medium: row.sourceMedium,
              sessions: row.sessions,
              total_users: row.totalUsers,
              screen_page_views: row.screenPageViews,
              conversions: row.conversions,
              event_count: row.eventCount,
              engagement_rate: row.engagementRate,
              raw: row,
              synced_at: new Date().toISOString(),
            })),
            {
              onConflict: 'lp_project_id,metric_date,source_medium',
            }
          )

          if (upsertError) {
            throw new Error(upsertError.message)
          }
        }

        const { error: finishError } = await service
          .from('ga4_sync_jobs')
          .update({
            status: 'succeeded',
            finished_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        if (finishError) {
          throw new Error(finishError.message)
        }

        results.push({
          lp_project_id: target.id,
          ga4_sync_job_id: job.id,
          rows: rows.length,
          status: 'succeeded',
        })
        await logger.log({
          stage: 'target_succeeded',
          message: 'Completed GA4 sync for LP target',
          metadata: {
            ga4_sync_job_id: job.id,
            row_count: rows.length,
          },
        })
      } catch (targetError) {
        const errorMessage = targetError instanceof Error ? targetError.message : 'Unknown error'

        await service
          .from('ga4_sync_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            finished_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        results.push({
          lp_project_id: target.id,
          ga4_sync_job_id: job.id,
          rows: 0,
          status: 'failed',
          error_message: errorMessage,
        })
        await logger.log({
          level: 'error',
          stage: 'target_failed',
          message: 'Failed GA4 sync for LP target',
          metadata: {
            ga4_sync_job_id: job.id,
            error_message: errorMessage,
          },
        })
      }
    }

    await logger.log({
      stage: 'completed',
      message: 'Completed GA4 sync request',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      metadata: {
        actor_user_id: actorUserId,
        succeeded_count: results.filter((result) => result.status === 'succeeded').length,
        failed_count: results.filter((result) => result.status === 'failed').length,
        skipped_count: results.filter((result) => result.status === 'skipped').length,
      },
    })
    return json({
      actor_user_id: actorUserId,
      synced: results.filter((result) => result.status === 'succeeded').length,
      jobs: results,
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

    if (error instanceof Error && error.message.includes('permission denied')) {
      await logger.log({
        level: 'warn',
        stage: 'permission_denied',
        message: error.message,
        statusCode: 403,
        durationMs: Date.now() - startedAt,
      })
      return forbidden(error.message)
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
