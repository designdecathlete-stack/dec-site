import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { badRequest, json, methodNotAllowed, serverError, unauthorized } from '../_shared/http.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

type PublishBody = {
  ai_change_request_id: string
  approved: boolean
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return methodNotAllowed()
  }

  try {
    const { client, user } = await requireUser(req)
    const body = (await req.json()) as PublishBody

    if (!body.ai_change_request_id) {
      return badRequest('ai_change_request_id is required')
    }

    const { data: changeRequest, error: changeError } = await client
      .from('ai_change_requests')
      .select('id, lp_project_id, status, preview_url, before_commit_sha, after_commit_sha')
      .eq('id', body.ai_change_request_id)
      .single()

    if (changeError || !changeRequest) {
      return unauthorized('AI change request is not accessible')
    }

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
    }

    return json({
      approval_request: approvalRequest,
      app_job_id: jobId,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authorization')) {
      return unauthorized(error.message)
    }

    return serverError(error instanceof Error ? error.message : 'Unexpected error')
  }
})
