import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { badRequest, json, methodNotAllowed, serverError, unauthorized } from '../_shared/http.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

type ChangeRequestBody = {
  lp_project_id: string
  analysis_result_id?: string | null
  instruction: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return methodNotAllowed()
  }

  try {
    const { client, user } = await requireUser(req)
    const body = (await req.json()) as ChangeRequestBody

    if (!body.lp_project_id || !body.instruction) {
      return badRequest('lp_project_id and instruction are required')
    }

    const { data: lpProject, error: lpError } = await client
      .from('lp_projects')
      .select('id, client_id, folder_path')
      .eq('id', body.lp_project_id)
      .single()

    if (lpError || !lpProject) {
      return unauthorized('LP project is not accessible')
    }

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

    return json({
      ai_change_request: createdRequest,
      app_job_id: jobId,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authorization')) {
      return unauthorized(error.message)
    }

    return serverError(error instanceof Error ? error.message : 'Unexpected error')
  }
})
