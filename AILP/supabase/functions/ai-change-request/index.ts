import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { badRequest, json, methodNotAllowed, optionsResponse, serverError, unauthorized } from '../_shared/http.ts'
import { createApiLogger } from '../_shared/logging.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

type ChangeRequestBody = {
  lp_project_id: string
  analysis_result_id?: string | null
  instruction: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse()
  }

  const startedAt = Date.now()
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const logger = createApiLogger({
    requestId,
    functionName: 'ai-change-request',
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
    const body = (await req.json()) as ChangeRequestBody
    await logger.log({
      stage: 'request_received',
      message: 'Received AI change request',
      metadata: {
        lp_project_id: body.lp_project_id ?? null,
        analysis_result_id: body.analysis_result_id ?? null,
      },
    })

    if (!body.lp_project_id || !body.instruction) {
      await logger.log({
        level: 'warn',
        stage: 'validation_failed',
        message: 'Missing required fields for AI change request',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
      })
      return badRequest('lp_project_id and instruction are required')
    }

    const { data: lpProject, error: lpError } = await client
      .from('lp_projects')
      .select('id, client_id, folder_path')
      .eq('id', body.lp_project_id)
      .single()

    if (lpError || !lpProject) {
      await logger.log({
        level: 'warn',
        stage: 'lp_project_unavailable',
        message: 'LP project is not accessible',
        statusCode: 401,
        durationMs: Date.now() - startedAt,
        metadata: {
          lp_project_id: body.lp_project_id,
        },
      })
      return unauthorized('LP project is not accessible')
    }
    logger.setContext({ lpProjectId: lpProject.id, clientId: lpProject.client_id })

    const { data: existingVersions } = await client
      .from('git_versions')
      .select('commit_sha, created_at')
      .eq('lp_project_id', body.lp_project_id)
      .order('created_at', { ascending: false })
      .limit(1)

    const beforeCommitSha = existingVersions?.[0]?.commit_sha ?? null
    const service = createServiceClient()

    const { data: createdRequest, error: createError } = await service
      .from('ai_change_requests')
      .insert({
        lp_project_id: body.lp_project_id,
        requested_by: user.id,
        instruction: body.instruction,
        status: 'requested',
        before_commit_sha: beforeCommitSha,
      })
      .select('id, lp_project_id, status, before_commit_sha')
      .single()

    if (createError || !createdRequest) {
      throw new Error(createError?.message ?? 'Failed to create AI change request')
    }
    await logger.log({
      stage: 'change_request_created',
      message: 'Created AI change request row',
      metadata: {
        ai_change_request_id: createdRequest.id,
        before_commit_sha: beforeCommitSha,
      },
    })

    const { data: jobId, error: jobError } = await service.rpc('enqueue_app_job', {
      job_type_input: 'ai_apply_change_request',
      lp_project_id_input: body.lp_project_id,
      ai_change_request_id_input: createdRequest.id,
      requested_payload: {
        analysis_result_id: body.analysis_result_id ?? null,
        instruction: body.instruction,
        folder_path: lpProject.folder_path,
        before_commit_sha: beforeCommitSha,
      },
      requested_by_user_id: user.id,
    })

    if (jobError || !jobId) {
      throw new Error(jobError?.message ?? 'Failed to enqueue AI change job')
    }
    logger.setContext({ appJobId: jobId })
    await logger.log({
      stage: 'job_enqueued',
      message: 'Enqueued AI apply change request job',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      metadata: {
        app_job_id: jobId,
      },
    })

    return json({
      ai_change_request: createdRequest,
      app_job_id: jobId,
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
