import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { badRequest, json, methodNotAllowed, serverError, unauthorized } from '../_shared/http.ts'
import { createApiLogger } from '../_shared/logging.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

type PublishBody = {
  ai_change_request_id: string
  approved: boolean
}

Deno.serve(async (req) => {
  const startedAt = Date.now()
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const logger = createApiLogger({
    requestId,
    functionName: 'lp-publish',
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
    const body = (await req.json()) as PublishBody
    await logger.log({
      stage: 'request_received',
      message: 'Received LP publish approval request',
      metadata: {
        ai_change_request_id: body.ai_change_request_id ?? null,
        approved: body.approved ?? null,
      },
    })

    if (!body.ai_change_request_id) {
      await logger.log({
        level: 'warn',
        stage: 'validation_failed',
        message: 'Missing ai_change_request_id',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
      })
      return badRequest('ai_change_request_id is required')
    }

    const { data: changeRequest, error: changeError } = await client
      .from('ai_change_requests')
      .select('id, lp_project_id, status, preview_url, before_commit_sha, after_commit_sha')
      .eq('id', body.ai_change_request_id)
      .single()

    if (changeError || !changeRequest) {
      await logger.log({
        level: 'warn',
        stage: 'change_request_unavailable',
        message: 'AI change request is not accessible',
        statusCode: 401,
        durationMs: Date.now() - startedAt,
        metadata: {
          ai_change_request_id: body.ai_change_request_id,
        },
      })
      return unauthorized('AI change request is not accessible')
    }
    logger.setContext({ lpProjectId: changeRequest.lp_project_id })

    const service = createServiceClient()
    const status = body.approved ? 'approved' : 'rejected'
    const decidedAt = new Date().toISOString()

    const { data: approvalRequest, error: approvalError } = await service
      .from('approval_requests')
      .insert({
        lp_project_id: changeRequest.lp_project_id,
        ai_change_request_id: changeRequest.id,
        requested_by: user.id,
        approved_by: body.approved ? user.id : null,
        status,
        title: body.approved ? 'Publish LP update' : 'Reject LP update',
        summary: body.approved
          ? 'Approved in ailp-management backend flow'
          : 'Rejected in ailp-management backend flow',
        preview_url: changeRequest.preview_url,
        before_commit_sha: changeRequest.before_commit_sha,
        after_commit_sha: changeRequest.after_commit_sha,
        requested_at: decidedAt,
        decided_at: decidedAt,
      })
      .select('id, status, lp_project_id')
      .single()

    if (approvalError || !approvalRequest) {
      throw new Error(approvalError?.message ?? 'Failed to create approval request')
    }
    await logger.log({
      stage: 'approval_request_created',
      message: 'Created approval request for LP publish flow',
      metadata: {
        approval_request_id: approvalRequest.id,
        approval_status: status,
      },
    })

    const { error: updateError } = await service
      .from('ai_change_requests')
      .update({
        status,
      })
      .eq('id', changeRequest.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    let jobId: string | null = null

    if (body.approved) {
      const jobResult = await service.rpc('enqueue_app_job', {
        job_type_input: 'lp_publish',
        lp_project_id_input: changeRequest.lp_project_id,
        ai_change_request_id_input: changeRequest.id,
        requested_payload: {
          approval_request_id: approvalRequest.id,
          preview_url: changeRequest.preview_url,
          before_commit_sha: changeRequest.before_commit_sha,
          after_commit_sha: changeRequest.after_commit_sha,
        },
        requested_by_user_id: user.id,
      })

      if (jobResult.error || !jobResult.data) {
        throw new Error(jobResult.error?.message ?? 'Failed to enqueue publish job')
      }

      jobId = jobResult.data
      logger.setContext({ appJobId: jobId })
      await logger.log({
        stage: 'job_enqueued',
        message: 'Enqueued LP publish job',
        metadata: {
          app_job_id: jobId,
        },
      })
    }

    await logger.log({
      stage: 'completed',
      message: 'Completed LP publish approval request',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      metadata: {
        approval_request_id: approvalRequest.id,
        approved: body.approved,
        app_job_id: jobId,
      },
    })

    return json({
      approval_request: approvalRequest,
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
