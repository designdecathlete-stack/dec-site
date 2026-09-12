import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureLpWorkspace } from '../guards/path-guard.js'
import { writeJobStep } from '../logging/job-log.js'
import { applyDraftChanges, createPreviewFolder, prepareRepo, pushBranch, writeDraftProposal } from './git.js'
import { createDraftChangePlan, createImprovementProposal, estimateCost } from './openai.js'


function stripHtmlForAi(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractHtmlSignals(html) {
  const source = String(html || '')
  const headings = [...source.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map(match => ({ level: Number(match[1]), text: stripHtmlForAi(match[2]).slice(0, 140) }))
    .filter(item => item.text)
    .slice(0, 30)
  const links = [...source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map(match => {
      const href = (match[1].match(/href=["']([^"']+)["']/i) || [])[1] || ''
      return { text: stripHtmlForAi(match[2]).slice(0, 100), href: href.slice(0, 180) }
    })
    .filter(item => item.text || item.href)
    .slice(0, 40)
  const sections = [...source.matchAll(/<section\b([^>]*)>/gi)]
    .map(match => {
      const attrs = match[1]
      const id = (attrs.match(/id=["']([^"']+)["']/i) || [])[1] || ''
      const klass = (attrs.match(/class=["']([^"']+)["']/i) || [])[1] || ''
      return { id, class: klass }
    })
    .filter(item => item.id || item.class)
    .slice(0, 40)
  return { headings, links, sections, text_sample: stripHtmlForAi(source).slice(0, 5000) }
}

async function loadLpSourceContext(workspace, folderPath) {
  const normalizedFolder = String(folderPath || '').replace(/^\/+|\/+$/g, '')
  const htmlPath = join(workspace.repo, normalizedFolder, 'index.html')
  let html = ''
  try {
    html = await readFile(htmlPath, 'utf8')
  } catch {
    html = ''
  }
  const cssCandidates = ['style.css', 'styles.css', 'main.css', 'css/style.css']
  const css = []
  for (const name of cssCandidates) {
    try {
      const content = await readFile(join(workspace.repo, normalizedFolder, name), 'utf8')
      css.push({ file: name, sample: content.slice(0, 4000) })
    } catch {}
  }
  return {
    html_file: html ? `${normalizedFolder}/index.html` : null,
    html_signals: extractHtmlSignals(html),
    css_files: css,
  }
}

function dateDaysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function metricTotals(metrics) {
  return metrics.reduce((sum, row) => {
    sum.sessions += Number(row.sessions || 0)
    sum.total_users += Number(row.total_users || 0)
    sum.screen_page_views += Number(row.screen_page_views || 0)
    sum.conversions += Number(row.conversions || 0)
    sum.event_count += Number(row.event_count || 0)
    if (row.engagement_rate !== null && row.engagement_rate !== undefined) {
      sum.engagement_rate_sum += Number(row.engagement_rate || 0)
      sum.engagement_rate_count += 1
    }
    return sum
  }, {
    sessions: 0,
    total_users: 0,
    screen_page_views: 0,
    conversions: 0,
    event_count: 0,
    engagement_rate_sum: 0,
    engagement_rate_count: 0,
  })
}

async function loadLpContext(supabase, lpProjectId) {
  const [overviewResult, metricsResult] = await Promise.all([
    supabase
      .from('lp_dashboard_overview')
      .select('*')
      .eq('lp_project_id', lpProjectId)
      .single(),
    supabase
      .from('ga4_daily_metrics')
      .select('metric_date,source_medium,sessions,total_users,screen_page_views,conversions,event_count,engagement_rate')
      .eq('lp_project_id', lpProjectId)
      .gte('metric_date', dateDaysAgo(90))
      .order('metric_date', { ascending: true })
      .limit(1000),
  ])

  if (overviewResult.error) throw new Error(overviewResult.error.message)
  if (metricsResult.error) throw new Error(metricsResult.error.message)

  const metrics = metricsResult.data ?? []
  const totals = metricTotals(metrics)
  const overview = overviewResult.data

  return {
    overview,
    metrics,
    aiContext: {
      lp_project_id: overview.lp_project_id,
      client_name: overview.client_name,
      lp_name: overview.lp_name,
      folder_path: overview.folder_path,
      public_url: overview.public_url,
      publish_status: overview.publish_status,
      ga4_connection_status: overview.ga4_connection_status,
      ga4_property_id: overview.ga4_property_id,
      ga4_page_path: overview.ga4_page_path,
      date_range: {
        from: metrics[0]?.metric_date ?? null,
        to: metrics[metrics.length - 1]?.metric_date ?? null,
      },
      totals_90d: {
        sessions: totals.sessions,
        total_users: totals.total_users,
        screen_page_views: totals.screen_page_views,
        conversions: totals.conversions,
        event_count: totals.event_count,
        conversion_rate: totals.sessions > 0 ? totals.conversions / totals.sessions : null,
        average_engagement_rate: totals.engagement_rate_count > 0
          ? totals.engagement_rate_sum / totals.engagement_rate_count
          : null,
      },
      latest_30d_from_dashboard: {
        sessions: overview.sessions_30d,
        total_users: overview.total_users_30d,
        page_views: overview.page_views_30d,
        conversions: overview.conversions_30d,
        conversion_rate: overview.conversion_rate_30d,
      },
      top_source_mediums_90d: Object.values(metrics.reduce((grouped, row) => {
        const key = row.source_medium || '(unknown)'
        grouped[key] ??= { source_medium: key, sessions: 0, conversions: 0 }
        grouped[key].sessions += Number(row.sessions || 0)
        grouped[key].conversions += Number(row.conversions || 0)
        return grouped
      }, {})).sort((left, right) => right.sessions - left.sessions).slice(0, 8),
    },
  }
}

function normalizeProposalResult(result) {
  const findings = Array.isArray(result.findings) ? result.findings : []
  const recommendations = Array.isArray(result.recommendations) ? result.recommendations : []
  return {
    score: Number.isFinite(Number(result.score)) ? Math.max(0, Math.min(100, Math.round(Number(result.score)))) : null,
    summary: String(result.summary || 'AI提案を生成しました。').slice(0, 2000),
    findings,
    recommendations,
  }
}

async function saveAiResults({ config, supabase, job, context, proposal }) {
  const normalized = normalizeProposalResult(proposal.parsed)
  const cost = estimateCost(config, proposal.usage)

  const { data: analysis, error: analysisError } = await supabase
    .from('ai_analysis_results')
    .insert({
      lp_project_id: job.lp_project_id,
      ga4_metric_date_from: context.aiContext.date_range.from,
      ga4_metric_date_to: context.aiContext.date_range.to,
      score: normalized.score,
      summary: normalized.summary,
      findings: normalized.findings,
      recommendations: normalized.recommendations,
      model: proposal.model,
    })
    .select('id')
    .single()

  if (analysisError) throw new Error(analysisError.message)

  const { data: interaction, error: interactionError } = await supabase
    .from('lp_ai_interactions')
    .insert({
      job_id: job.id,
      lp_project_id: job.lp_project_id,
      model: proposal.model,
      action_type: job.job_type,
      prompt_summary: 'LP-scoped GA4 metrics and dashboard overview were used to create improvement proposals.',
      response_summary: normalized.summary,
      input_refs: [
        'lp_dashboard_overview',
        'ga4_daily_metrics',
      ],
      output_refs: [
        { table: 'ai_analysis_results', id: analysis.id },
      ],
      input_tokens: cost.inputTokens,
      output_tokens: cost.outputTokens,
      cached_input_tokens: cost.cachedInputTokens,
      reasoning_tokens: cost.reasoningTokens,
      total_tokens: cost.totalTokens,
      estimated_cost_usd: cost.estimatedCostUsd,
      estimated_cost_jpy: cost.estimatedCostJpy,
      status: 'succeeded',
    })
    .select('id')
    .single()

  if (interactionError) throw new Error(interactionError.message)

  const { error: usageError } = await supabase
    .from('lp_ai_usage_logs')
    .insert({
      client_id: context.overview.client_id,
      lp_project_id: job.lp_project_id,
      job_id: job.id,
      ai_interaction_id: interaction.id,
      model: proposal.model,
      action_type: job.job_type,
      input_tokens: cost.inputTokens,
      output_tokens: cost.outputTokens,
      cached_input_tokens: cost.cachedInputTokens,
      reasoning_tokens: cost.reasoningTokens,
      total_tokens: cost.totalTokens,
      input_unit_price_usd: config.openAiInputUsdPerMillion,
      output_unit_price_usd: config.openAiOutputUsdPerMillion,
      cached_input_unit_price_usd: config.openAiCachedInputUsdPerMillion,
      estimated_cost_usd: cost.estimatedCostUsd,
      estimated_cost_jpy: cost.estimatedCostJpy,
      pricing_source: 'env',
      pricing_version: 'manual',
      status: 'succeeded',
    })

  if (usageError) throw new Error(usageError.message)

  const { error: jobUpdateError } = await supabase
    .from('lp_jobs')
    .update({
      result_summary: normalized.summary,
      payload: {
        ...(job.payload ?? {}),
        ai_analysis_result_id: analysis.id,
        ai_interaction_id: interaction.id,
        recommendation_count: normalized.recommendations.length,
        diagnosis: proposal.parsed?.diagnosis ?? null,
        rejected_ideas: Array.isArray(proposal.parsed?.rejected_ideas) ? proposal.parsed.rejected_ideas : [],
        improvement_logic_version: 'docs/ai-improvement-logic.md',
      },
    })
    .eq('id', job.id)

  if (jobUpdateError) throw new Error(jobUpdateError.message)

  return { analysisId: analysis.id, interactionId: interaction.id, normalized, cost }
}

async function latestAnalysis(supabase, lpProjectId) {
  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select('*')
    .eq('lp_project_id', lpProjectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

function draftMarkdown({ job, context, analysis }) {
  const recommendations = Array.isArray(analysis?.recommendations) ? analysis.recommendations : []
  const findings = Array.isArray(analysis?.findings) ? analysis.findings : []
  return [
    '# AILP Draft Proposal',
    '',
    `Job: ${job.id}`,
    `LP: ${context.overview.lp_name}`,
    `Client: ${context.overview.client_name}`,
    `Public URL: ${context.overview.public_url ?? ''}`,
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    analysis?.summary ?? 'No analysis summary is available.',
    '',
    '## Findings',
    '',
    ...findings.map((item, index) => `${index + 1}. ${item.title ?? 'Finding'} - ${item.body ?? ''}`),
    '',
    '## Recommended Changes',
    '',
    ...recommendations.map((item, index) => `${index + 1}. ${item.title ?? 'Recommendation'} - ${item.body ?? ''}`),
    '',
    '## Guardrails',
    '',
    '- This draft was created in an LP-scoped workspace.',
    '- It is not merged into main.',
    '- Production URL is unchanged until approval.',
    '',
  ].join('\n')
}

export async function runJob({ config, supabase, job }) {
  if (!job.lp_project_id) {
    throw new Error(`Job ${job.id} is missing lp_project_id`)
  }

  await writeJobStep(supabase, job.id, 'workspace_prepare', {
    status: 'running',
    summary: 'Preparing LP-scoped workspace',
    lp_project_id: job.lp_project_id,
  })

  const workspace = await ensureLpWorkspace(config.workspaceRoot, job.lp_project_id)

  await writeJobStep(supabase, job.id, 'workspace_ready', {
    summary: 'Workspace is ready',
    lp_project_id: job.lp_project_id,
    workspace_root: workspace.root,
    dry_run: config.dryRun,
  })

  if (job.job_type === 'propose_improvements' || job.job_type === 'analyze_lp') {
    await writeJobStep(supabase, job.id, 'lp_context_load', {
      status: 'running',
      summary: 'Loading LP-scoped dashboard and GA4 metrics',
      lp_project_id: job.lp_project_id,
    })

    const context = await loadLpContext(supabase, job.lp_project_id)

    await writeJobStep(supabase, job.id, 'lp_context_ready', {
      summary: 'LP-scoped context is ready',
      lp_project_id: job.lp_project_id,
      metric_rows: context.metrics.length,
      ga4_connection_status: context.overview.ga4_connection_status,
      public_url: context.overview.public_url,
    })

    if (config.dryRun) {
      await writeJobStep(supabase, job.id, 'dry_run_complete', {
        summary: 'Dry run loaded GA4 context without calling AI',
        lp_project_id: job.lp_project_id,
        metric_rows: context.metrics.length,
      })
      return
    }

    await writeJobStep(supabase, job.id, 'source_context_load', {
      status: 'running',
      summary: 'Loading current LP HTML/CSS signals for marketer review',
      lp_project_id: job.lp_project_id,
      folder_path: context.overview.folder_path,
    })

    await prepareRepo({ config, workspace, branchName: `ailp/${context.overview.folder_path}/analysis-context`.replace(/[^A-Za-z0-9/_-]/g, '-') })
    const sourceContext = await loadLpSourceContext(workspace, context.overview.folder_path)

    await writeJobStep(supabase, job.id, 'ai_proposal_start', {
      status: 'running',
      summary: 'Requesting LP improvement proposals from OpenAI with GA4 and current HTML/CSS signals',
      lp_project_id: job.lp_project_id,
      model: config.openAiModel,
    })

    const proposal = await createImprovementProposal({
      config,
      context: {
        ...context.aiContext,
        current_lp_source: sourceContext,
        improvement_logic_version: 'docs/ai-improvement-logic.md',
      },
    })
    const saved = await saveAiResults({ config, supabase, job, context, proposal })

    await writeJobStep(supabase, job.id, 'ai_proposal_saved', {
      summary: 'AI proposal was saved to ai_analysis_results',
      lp_project_id: job.lp_project_id,
      ai_analysis_result_id: saved.analysisId,
      recommendation_count: saved.normalized.recommendations.length,
      total_tokens: saved.cost.totalTokens,
      estimated_cost_jpy: saved.cost.estimatedCostJpy,
    })
    return
  }

  if (job.job_type === 'create_draft_version') {
    const context = await loadLpContext(supabase, job.lp_project_id)
    const analysis = await latestAnalysis(supabase, job.lp_project_id)
    if (!analysis) {
      throw new Error('No ai_analysis_results found. Run propose_improvements first.')
    }

    const branchName = `ailp/${context.overview.folder_path}/job-${job.id}`.replace(/[^A-Za-z0-9/_-]/g, '-')

    await writeJobStep(supabase, job.id, 'draft_repo_prepare', {
      status: 'running',
      summary: 'Preparing local draft branch without touching main',
      lp_project_id: job.lp_project_id,
      branch: branchName,
    })

    if (config.dryRun) {
      await writeJobStep(supabase, job.id, 'dry_run_complete', {
        summary: 'Dry run skipped Git draft creation',
        lp_project_id: job.lp_project_id,
        branch: branchName,
      })
      return
    }

    await prepareRepo({ config, workspace, branchName })
    const artifact = await writeDraftProposal({
      config,
      workspace,
      folderPath: context.overview.folder_path,
      branchName,
      markdown: draftMarkdown({ job, context, analysis }),
    })

    const { error: versionError } = await supabase.from('git_versions').insert({
      lp_project_id: job.lp_project_id,
      version_label: `draft-${job.id.slice(0, 8)}`,
      branch: artifact.branchName,
      commit_sha: artifact.commitSha,
      folder_path: context.overview.folder_path,
      change_summary: analysis.summary,
      is_production: false,
    })
    if (versionError) throw new Error(versionError.message)

    const { error: artifactError } = await supabase.from('lp_job_artifacts').insert({
      job_id: job.id,
      lp_project_id: job.lp_project_id,
      artifact_type: 'draft_proposal',
      file_path: artifact.filePath,
      git_branch: artifact.branchName,
      commit_sha: artifact.commitSha,
      diff_summary: artifact.diffSummary,
      metadata: {
        production_unchanged: true,
      },
    })
    if (artifactError) throw new Error(artifactError.message)

    const { error: jobUpdateError } = await supabase.from('lp_jobs').update({
      result_summary: `Draft branch ${artifact.branchName} created at ${artifact.commitSha.slice(0, 7)}. Production main was not changed.`,
      git_branch: artifact.branchName,
      commit_sha: artifact.commitSha,
    }).eq('id', job.id)
    if (jobUpdateError) throw new Error(jobUpdateError.message)

    await writeJobStep(supabase, job.id, 'draft_created', {
      summary: 'Draft proposal commit was created in the LP workspace',
      lp_project_id: job.lp_project_id,
      branch: artifact.branchName,
      commit_sha: artifact.commitSha,
      file_path: artifact.filePath,
      diff_summary: artifact.diffSummary,
    })
    return
  }

  if (job.job_type === 'create_preview_folder') {
    const context = await loadLpContext(supabase, job.lp_project_id)
    const versionSlug = job.payload?.version_slug || `draft-${job.id.slice(0, 8)}`
    const branchName = `ailp/${context.overview.folder_path}/${versionSlug}`.replace(/[^A-Za-z0-9/_-]/g, '-')

    await writeJobStep(supabase, job.id, 'preview_repo_prepare', {
      status: 'running',
      summary: 'Preparing preview folder branch without touching main',
      lp_project_id: job.lp_project_id,
      branch: branchName,
      version_slug: versionSlug,
    })

    if (config.dryRun) {
      await writeJobStep(supabase, job.id, 'dry_run_complete', {
        summary: 'Dry run skipped preview folder creation',
        lp_project_id: job.lp_project_id,
        branch: branchName,
      })
      return
    }

    await prepareRepo({ config, workspace, branchName })
    const preview = await createPreviewFolder({
      config,
      workspace,
      folderPath: context.overview.folder_path,
      branchName,
      versionSlug,
    })

    let pushed = false
    if (job.payload?.push === true) {
      await writeJobStep(supabase, job.id, 'preview_branch_push', {
        status: 'running',
        summary: 'Pushing preview branch to GitHub',
        lp_project_id: job.lp_project_id,
        branch: branchName,
      })
      await pushBranch({ config, workspace, branchName })
      pushed = true
    }

    const { error: versionError } = await supabase.from('git_versions').insert({
      lp_project_id: job.lp_project_id,
      version_label: versionSlug,
      branch: preview.branchName,
      commit_sha: preview.commitSha,
      folder_path: preview.previewPath,
      change_summary: `Preview folder created from ${context.overview.folder_path}.`,
      is_production: false,
    })
    if (versionError) throw new Error(versionError.message)

    const { error: artifactError } = await supabase.from('lp_job_artifacts').insert({
      job_id: job.id,
      lp_project_id: job.lp_project_id,
      artifact_type: 'preview_folder',
      file_path: preview.previewPath,
      git_branch: preview.branchName,
      commit_sha: preview.commitSha,
      preview_url: preview.previewUrl,
      diff_summary: preview.diffSummary,
      metadata: {
        production_unchanged: true,
        pushed,
      },
    })
    if (artifactError) throw new Error(artifactError.message)

    const { error: jobUpdateError } = await supabase.from('lp_jobs').update({
      result_summary: `Preview folder ${preview.previewPath} created. Production main was not changed.${pushed ? ' Branch was pushed.' : ' Branch was not pushed.'}`,
      git_branch: preview.branchName,
      commit_sha: preview.commitSha,
      preview_url: preview.previewUrl,
    }).eq('id', job.id)
    if (jobUpdateError) throw new Error(jobUpdateError.message)

    await writeJobStep(supabase, job.id, 'preview_folder_created', {
      summary: 'Preview folder commit was created',
      lp_project_id: job.lp_project_id,
      branch: preview.branchName,
      commit_sha: preview.commitSha,
      preview_path: preview.previewPath,
      preview_url: preview.previewUrl,
      pushed,
      diff_summary: preview.diffSummary,
    })
    return
  }


  if (job.job_type === 'apply_to_draft') {
    const context = await loadLpContext(supabase, job.lp_project_id)
    const analysis = job.payload?.ai_analysis_result_id
      ? await (async () => {
          const { data, error } = await supabase
            .from('ai_analysis_results')
            .select('*')
            .eq('id', job.payload.ai_analysis_result_id)
            .eq('lp_project_id', job.lp_project_id)
            .maybeSingle()
          if (error) throw new Error(error.message)
          return data
        })()
      : await latestAnalysis(supabase, job.lp_project_id)
    if (!analysis) {
      throw new Error('No ai_analysis_results found. Run propose_improvements first.')
    }

    const versionSlug = job.payload?.version_slug || `draft-${job.id.slice(0, 8)}`
    const branchName = `ailp/${context.overview.folder_path}/${versionSlug}`.replace(/[^A-Za-z0-9/_-]/g, '-')

    await writeJobStep(supabase, job.id, 'draft_apply_prepare', {
      status: 'running',
      summary: 'Preparing draft-only LP changes without touching production folder or main',
      lp_project_id: job.lp_project_id,
      branch: branchName,
      version_slug: versionSlug,
      ai_analysis_result_id: analysis.id,
    })

    if (config.dryRun) {
      await writeJobStep(supabase, job.id, 'dry_run_complete', {
        summary: 'Dry run skipped draft apply',
        lp_project_id: job.lp_project_id,
        branch: branchName,
      })
      return
    }

    await prepareRepo({ config, workspace, branchName })
    const sourceContext = await loadLpSourceContext(workspace, context.overview.folder_path)
    const planResponse = await createDraftChangePlan({
      config,
      context: {
        ...context.aiContext,
        current_lp_source: sourceContext,
        improvement_logic_version: 'docs/ai-improvement-logic.md',
      },
      analysis,
    })
    const cost = estimateCost(config, planResponse.usage)

    const draft = await applyDraftChanges({
      config,
      workspace,
      folderPath: context.overview.folder_path,
      branchName,
      versionSlug,
      plan: planResponse.parsed,
      analysisId: analysis.id,
    })

    let pushed = false
    if (job.payload?.push !== false) {
      await writeJobStep(supabase, job.id, 'draft_branch_push', {
        status: 'running',
        summary: 'Pushing draft branch to GitHub',
        lp_project_id: job.lp_project_id,
        branch: branchName,
      })
      await pushBranch({ config, workspace, branchName })
      pushed = true
    }

    const { data: interaction, error: interactionError } = await supabase
      .from('lp_ai_interactions')
      .insert({
        job_id: job.id,
        lp_project_id: job.lp_project_id,
        model: planResponse.model,
        action_type: job.job_type,
        prompt_summary: 'Latest LP-scoped AI analysis was converted into a draft-only LP update plan.',
        response_summary: planResponse.parsed?.headline || analysis.summary,
        input_refs: [{ table: 'ai_analysis_results', id: analysis.id }],
        output_refs: [{ git_branch: draft.branchName, commit_sha: draft.commitSha, file_path: draft.previewPath }],
        input_tokens: cost.inputTokens,
        output_tokens: cost.outputTokens,
        cached_input_tokens: cost.cachedInputTokens,
        reasoning_tokens: cost.reasoningTokens,
        total_tokens: cost.totalTokens,
        estimated_cost_usd: cost.estimatedCostUsd,
        estimated_cost_jpy: cost.estimatedCostJpy,
        status: 'succeeded',
      })
      .select('id')
      .single()
    if (interactionError) throw new Error(interactionError.message)

    const { error: usageError } = await supabase.from('lp_ai_usage_logs').insert({
      client_id: context.overview.client_id,
      lp_project_id: job.lp_project_id,
      job_id: job.id,
      ai_interaction_id: interaction.id,
      model: planResponse.model,
      action_type: job.job_type,
      input_tokens: cost.inputTokens,
      output_tokens: cost.outputTokens,
      cached_input_tokens: cost.cachedInputTokens,
      reasoning_tokens: cost.reasoningTokens,
      total_tokens: cost.totalTokens,
      input_unit_price_usd: config.openAiInputUsdPerMillion,
      output_unit_price_usd: config.openAiOutputUsdPerMillion,
      cached_input_unit_price_usd: config.openAiCachedInputUsdPerMillion,
      estimated_cost_usd: cost.estimatedCostUsd,
      estimated_cost_jpy: cost.estimatedCostJpy,
      pricing_source: 'env',
      pricing_version: 'manual',
      status: 'succeeded',
    })
    if (usageError) throw new Error(usageError.message)

    const { error: versionError } = await supabase.from('git_versions').insert({
      lp_project_id: job.lp_project_id,
      version_label: versionSlug,
      branch: draft.branchName,
      commit_sha: draft.commitSha,
      folder_path: draft.previewPath,
      change_summary: planResponse.parsed?.headline || analysis.summary,
      is_production: false,
    })
    if (versionError) throw new Error(versionError.message)

    const { error: artifactError } = await supabase.from('lp_job_artifacts').insert({
      job_id: job.id,
      lp_project_id: job.lp_project_id,
      artifact_type: 'draft_lp_update',
      file_path: draft.previewPath,
      git_branch: draft.branchName,
      commit_sha: draft.commitSha,
      preview_url: draft.previewUrl,
      diff_summary: draft.diffSummary,
      metadata: {
        production_unchanged: true,
        main_unchanged: true,
        pushed,
        github_branch_url: draft.githubBranchUrl,
        netlify_preview_status: draft.netlifyPreviewStatus,
        ai_analysis_result_id: analysis.id,
        ai_interaction_id: interaction.id,
        applied_edits: draft.appliedEdits,
        direct_html_edit_enabled: true,
      },
    })
    if (artifactError) throw new Error(artifactError.message)

    const { error: jobUpdateError } = await supabase.from('lp_jobs').update({
      result_summary: `Draft ${draft.previewPath} updated from AI proposal. Production folder and main were not changed.${pushed ? ' Branch was pushed.' : ' Branch was not pushed.'}`,
      git_branch: draft.branchName,
      commit_sha: draft.commitSha,
      preview_url: draft.previewUrl,
      payload: {
        ...(job.payload ?? {}),
        ai_analysis_result_id: analysis.id,
        ai_interaction_id: interaction.id,
        github_branch_url: draft.githubBranchUrl,
        netlify_preview_status: draft.netlifyPreviewStatus,
      },
    }).eq('id', job.id)
    if (jobUpdateError) throw new Error(jobUpdateError.message)

    await writeJobStep(supabase, job.id, 'draft_applied', {
      summary: 'Draft-only LP update commit was created',
      lp_project_id: job.lp_project_id,
      branch: draft.branchName,
      commit_sha: draft.commitSha,
      preview_path: draft.previewPath,
      preview_url: draft.previewUrl,
      github_branch_url: draft.githubBranchUrl,
      netlify_preview_status: draft.netlifyPreviewStatus,
      pushed,
      diff_summary: draft.diffSummary,
      applied_edits: draft.appliedEdits,
    })
    return
  }

  if (config.dryRun) {
    await writeJobStep(supabase, job.id, 'dry_run_complete', {
      summary: 'Dry run completed without AI, Git, or publish operations',
      lp_project_id: job.lp_project_id,
    })
    return
  }

  throw new Error('Non-dry-run execution is not implemented yet')
}
