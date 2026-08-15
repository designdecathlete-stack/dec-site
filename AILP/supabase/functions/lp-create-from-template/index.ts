import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { badRequest, json, methodNotAllowed, serverError, unauthorized } from '../_shared/http.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

type CreateRequest = {
  client_id: string
  template_lp_project_id: string
  name: string
  slug: string
  instruction?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return methodNotAllowed()
  }

  try {
    const { client, user } = await requireUser(req)
    const body = (await req.json()) as CreateRequest

    if (!body.client_id || !body.template_lp_project_id || !body.name || !body.slug) {
      return badRequest('client_id, template_lp_project_id, name, slug are required')
    }

    const { data: targetClient, error: clientError } = await client
      .from('clients')
      .select('id, slug')
      .eq('id', body.client_id)
      .single()

    if (clientError || !targetClient) {
      return unauthorized('Target client is not accessible')
    }

    const { data: templateLp, error: templateError } = await client
      .from('lp_projects')
      .select('id, client_id, folder_path, public_url, ga4_page_path')
      .eq('id', body.template_lp_project_id)
      .single()

    if (templateError || !templateLp) {
      return unauthorized('Template LP is not accessible')
    }

    const service = createServiceClient()
    const publicUrl = `https://dec-site.site/${body.slug}/`
    const folderPath = body.slug
    const ga4PagePath = `/${body.slug}/`

    const { data: lpProject, error: lpInsertError } = await service
      .from('lp_projects')
      .insert({
        client_id: body.client_id,
        name: body.name,
        slug: body.slug,
        folder_path: folderPath,
        public_url: publicUrl,
        ga4_page_path: ga4PagePath,
        status: 'draft',
      })
      .select('id, client_id, slug, folder_path, public_url, ga4_page_path')
      .single()

    if (lpInsertError || !lpProject) {
      throw new Error(lpInsertError?.message ?? 'Failed to create LP project')
    }

    const { data: changeRequest, error: changeError } = await service
      .from('ai_change_requests')
      .insert({
        lp_project_id: lpProject.id,
        requested_by: user.id,
        instruction:
          body.instruction ??
          `Create a new LP from template ${templateLp.folder_path} for ${targetClient.slug}.`,
        status: 'requested',
      })
      .select('id, status')
      .single()

    if (changeError || !changeRequest) {
      throw new Error(changeError?.message ?? 'Failed to create initial change request')
    }

    const { data: jobId, error: jobError } = await service.rpc('enqueue_app_job', {
      job_type_input: 'lp_create_from_template',
      lp_project_id_input: lpProject.id,
      ai_change_request_id_input: changeRequest.id,
      requested_payload: {
        target_client_id: body.client_id,
        template_lp_project_id: body.template_lp_project_id,
        template_folder_path: templateLp.folder_path,
        new_folder_path: folderPath,
        new_public_url: publicUrl,
        new_ga4_page_path: ga4PagePath,
      },
      requested_by_user_id: user.id,
    })

    if (jobError || !jobId) {
      throw new Error(jobError?.message ?? 'Failed to enqueue LP create job')
    }

    return json({
      lp_project: lpProject,
      ai_change_request: changeRequest,
      app_job_id: jobId,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authorization')) {
      return unauthorized(error.message)
    }

    return serverError(error instanceof Error ? error.message : 'Unexpected error')
  }
})
