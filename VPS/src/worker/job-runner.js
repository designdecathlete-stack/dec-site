import { setTimeout as wait } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureLpWorkspace } from '../guards/path-guard.js'
import { writeJobStep } from '../logging/job-log.js'
import { applyDraftChanges, createLpVariantFolder, createPreviewFolder, prepareRepo, publishPreviewFolderToMain, publishVersionToProduction, pushBranch, writeDraftProposal } from './git.js'
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


async function loadCodexKnowledgeFiles(repoPath) {
  const docs = [
    'docs/ai-proposal-prompt.md',
    'docs/ai-html-edit-prompt.md',
    'docs/ai-improvement-logic.md',
    'docs/ga4-scoring-logic.md',
  ]
  const loaded = []
  for (const file of docs) {
    try {
      const content = await readFile(join(repoPath, file), 'utf8')
      loaded.push({ file, content: content.slice(0, 20000) })
    } catch (error) {
      loaded.push({ file, missing: true, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return loaded
}

function codexProposalPrompt({ context, sourceContext, knowledgeFiles }) {
  return [
    '# AILP Codex Proposal Task',
    '',
    'あなたはプロのLPマーケター兼フロントエンド編集者です。',
    'GA4実データ、現在のHTML/CSS、ノウハウmdを根拠に、LP改善提案を作成してください。',
    '',
    '## 必須方針',
    '',
    '- LP単位の機密情報だけを使い、他LPの情報を混ぜない。',
    '- マクロ改善（別LP制作）とミクロ改善（現LPの細部改善）を分ける。',
    '- GA4指標とHTML/CSS上の根拠を必ず紐づける。',
    '- draft反映で使えるように target_area / target_selector_or_text を具体化する。',
    '- 現実的に反映できる改善を優先し、デザインを大きく壊す指示は避ける。',
    '',
    '## 保存先',
    '',
    '結果は Supabase public.ai_analysis_results に保存する想定です。',
    'recommendations はJSON配列で、少なくとも title, body, evidence, hypothesis, priority, route, target_area, target_selector_or_text, expected_effect, implementation_scope, approved_for_draft, review_note を含めてください。',
    '',
    '## LP context',
    '',
    '```json',
    JSON.stringify(context.aiContext, null, 2),
    '```',
    '',
    '## Current HTML/CSS signals',
    '',
    '```json',
    JSON.stringify(sourceContext, null, 2),
    '```',
    '',
    '## Knowledge files',
    '',
    ...knowledgeFiles.map(item => item.missing
      ? `### ${item.file}\n\n読み込み失敗: ${item.error || 'missing'}\n`
      : `### ${item.file}\n\n${item.content}\n`),
  ].join('\n')
}

async function createCodexProposalTask({ supabase, job, context, sourceContext, repoPath }) {
  const existingAnalysis = await latestAnalysis(supabase, job.lp_project_id)
  if (existingAnalysis) {
    const recommendations = Array.isArray(existingAnalysis.recommendations) ? existingAnalysis.recommendations : []
    const { error: jobUpdateError } = await supabase
      .from('lp_jobs')
      .update({
        result_summary: `Codex提案を保存済みです。改善案 ${recommendations.length}件`,
        payload: {
          ...(job.payload ?? {}),
          executor: 'codex',
          codex_task_status: 'completed_by_codex',
          ai_analysis_result_id: existingAnalysis.id,
          recommendation_count: recommendations.length,
          codex_note: 'Linked latest LP-scoped Codex proposal so the UI does not remain in a waiting state.',
        },
      })
      .eq('id', job.id)
    if (jobUpdateError) throw new Error(jobUpdateError.message)

    await writeJobStep(supabase, job.id, 'codex_proposal_linked', {
      summary: 'Linked the latest LP-scoped Codex proposal to this job.',
      lp_project_id: job.lp_project_id,
      ai_analysis_result_id: existingAnalysis.id,
      recommendation_count: recommendations.length,
    })
    return
  }

  const knowledgeFiles = await loadCodexKnowledgeFiles(repoPath)
  const prompt = codexProposalPrompt({ context, sourceContext, knowledgeFiles })
  const metadata = {
    executor: 'codex',
    status: 'ready_for_codex',
    prompt_files: knowledgeFiles.map(item => ({ file: item.file, missing: Boolean(item.missing) })),
    prompt_text: prompt.slice(0, 120000),
    lp_context: context.aiContext,
    source_context: sourceContext,
    expected_output_table: 'ai_analysis_results',
    expected_output_shape: {
      score: 'integer 0-100',
      summary: 'text',
      findings: 'jsonb[]',
      recommendations: 'jsonb[] with macro/micro route and target selectors',
      model: 'codex',
    },
  }

  const { error: artifactError } = await supabase
    .from('lp_job_artifacts')
    .insert({
      job_id: job.id,
      lp_project_id: job.lp_project_id,
      artifact_type: 'codex_proposal_task',
      file_path: null,
      diff_summary: 'Codex proposal task prepared from GA4, current HTML/CSS, and knowledge md files.',
      metadata,
    })
  if (artifactError) throw new Error(artifactError.message)

  const { error: jobUpdateError } = await supabase
    .from('lp_jobs')
    .update({
      result_summary: 'Codex用タスクを作成しました。CodexがGA4・HTML/CSS・ノウハウmdを読んで提案を保存する状態です。',
      payload: {
        ...(job.payload ?? {}),
        executor: 'codex',
        codex_task_status: 'ready_for_codex',
        codex_prompt_files: metadata.prompt_files,
      },
    })
    .eq('id', job.id)
  if (jobUpdateError) throw new Error(jobUpdateError.message)

  await writeJobStep(supabase, job.id, 'codex_task_ready', {
    summary: 'Codex proposal task was prepared without calling OpenAI from the VPS worker.',
    lp_project_id: job.lp_project_id,
    prompt_files: metadata.prompt_files,
  })
}


function fallbackDraftPlanFromAnalysis(analysis) {
  const recommendations = Array.isArray(analysis?.recommendations) ? analysis.recommendations : []
  const approved = recommendations
    .filter(item => item?.approved_for_draft !== false)
    .slice(0, 5)
  const changes = (approved.length ? approved : recommendations.slice(0, 5)).map((item, index) => ({
    title: String(item?.title || `改善 ${index + 1}`).slice(0, 120),
    body: String(item?.body || item?.hypothesis || item?.expected_effect || '').slice(0, 700),
    target_area: item?.target_area || item?.area || 'other',
    target_selector_or_text: item?.target_selector_or_text || item?.selector || '',
    edit_intent: item?.edit_intent || 'replace_copy',
  }))
  return {
    headline: changes[0]?.title || 'AI改善提案をdraftに反映',
    lead: analysis?.summary || 'GA4と現在のLP内容から、確認用draftに改善案を反映しました。',
    changes,
    cta_label: 'LINEで相談する',
    self_review_summary: 'Codex HTML編集タスクを保存し、保存済み改善案をもとに既存デザインを崩さない範囲でdraftを作成しました。',
  }
}

function codexHtmlEditPrompt({ context, sourceContext, analysis, plan, knowledgeFiles }) {
  return [
    '# AILP Codex HTML Edit Task',
    '',
    'あなたはLPのHTML/CSSを壊さずに改善できるフロントエンド編集者です。',
    'GA4根拠つき改善案、現在のHTML/CSS、ノウハウmdを読み、draft用のHTML/CSS編集を作ってください。',
    '',
    '## 編集方針',
    '',
    '- 本番フォルダは直接変更しない。draft / preview 用だけを編集する。',
    '- 既存デザイン、画像、公開URL、LPフォルダ構成を壊さない。',
    '- target_area / target_selector_or_text を優先して、hero、CTA、trust、FAQなど該当箇所を自然に置換または補足する。',
    '- 変更前後をログ化できるように before / after / target_area / target_selector_or_text を残す。',
    '- マクロ改善は新規LP案、ミクロ改善は現LPの部分編集として扱う。',
    '',
    '## LP context',
    '',
    '```json',
    JSON.stringify(context.aiContext, null, 2),
    '```',
    '',
    '## Current HTML/CSS signals',
    '',
    '```json',
    JSON.stringify(sourceContext, null, 2),
    '```',
    '',
    '## Improvement analysis',
    '',
    '```json',
    JSON.stringify({
      id: analysis?.id,
      summary: analysis?.summary,
      findings: analysis?.findings || [],
      recommendations: analysis?.recommendations || [],
    }, null, 2),
    '```',
    '',
    '## Draft plan currently used by worker',
    '',
    '```json',
    JSON.stringify(plan, null, 2),
    '```',
    '',
    '## Knowledge files',
    '',
    ...knowledgeFiles.map(item => item.missing
      ? `### ${item.file}\n\n読み込み失敗: ${item.error || 'missing'}\n`
      : `### ${item.file}\n\n${item.content}\n`),
  ].join('\n')
}

async function createCodexHtmlEditTask({ supabase, job, context, sourceContext, analysis, plan, repoPath, versionSlug }) {
  const knowledgeFiles = await loadCodexKnowledgeFiles(repoPath)
  const prompt = codexHtmlEditPrompt({ context, sourceContext, analysis, plan, knowledgeFiles })
  const metadata = {
    executor: 'codex_html',
    status: 'ready_for_codex',
    version_slug: versionSlug,
    prompt_files: knowledgeFiles.map(item => ({ file: item.file, missing: Boolean(item.missing) })),
    prompt_text: prompt.slice(0, 140000),
    lp_context: context.aiContext,
    source_context: sourceContext,
    ai_analysis_result_id: analysis?.id || null,
    draft_plan: plan,
    expected_output: {
      preview_folder: `ailp-previews/${context.overview.folder_path}/${versionSlug}`,
      output_files: ['index.html', 'related css if needed'],
      log_fields: ['target_area', 'target_selector_or_text', 'before', 'after'],
    },
  }
  const { error: artifactError } = await supabase
    .from('lp_job_artifacts')
    .insert({
      job_id: job.id,
      lp_project_id: job.lp_project_id,
      artifact_type: 'codex_html_edit_task',
      file_path: null,
      diff_summary: 'Codex HTML edit task prepared from saved recommendations, current HTML/CSS, and knowledge md files.',
      metadata,
    })
  if (artifactError) throw new Error(artifactError.message)
  await writeJobStep(supabase, job.id, 'codex_html_task_ready', {
    summary: 'Codex HTML edit task was prepared. Worker will create a draft preview from the same saved recommendations without calling OpenAI.',
    lp_project_id: job.lp_project_id,
    version_slug: versionSlug,
    prompt_files: metadata.prompt_files,
  })
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


async function loadDraftLpContext(supabase, lpProjectId) {
  const overviewResult = await supabase
    .from('lp_dashboard_overview')
    .select('*')
    .eq('lp_project_id', lpProjectId)
    .single()
  if (overviewResult.error) throw new Error(overviewResult.error.message)
  const overview = overviewResult.data

  const metricsResult = await supabase
    .from('ga4_daily_metrics')
    .select('metric_date,source_medium,sessions,total_users,screen_page_views,conversions,event_count,engagement_rate')
    .eq('lp_project_id', lpProjectId)
    .gte('metric_date', dateDaysAgo(30))
    .order('metric_date', { ascending: true })
    .limit(200)
  if (metricsResult.error) throw new Error(metricsResult.error.message)

  const metrics = metricsResult.data ?? []
  const totals = metricTotals(metrics)
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
        average_engagement_rate: totals.engagement_rate_count > 0 ? totals.engagement_rate_sum / totals.engagement_rate_count : null,
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

function fallbackMeasurementProposal(context) {
  const connectionStatus = context.overview.ga4_connection_status || 'missing'
  const summary = 'GA4計測データが不足しているため、まず計測設定とCVイベントの検証を優先してください。'
  return {
    parsed: {
      score: 30,
      summary,
      diagnosis: {
        primary_issue: 'measurement',
        reason: `GA4 connection status is ${connectionStatus}, metric rows are ${context.metrics.length}.`,
      },
      findings: [{
        title: 'GA4計測データ不足',
        body: 'LP単位のGA4指標が不足しており、CVRや行動改善の判断に必要な実測値が揃っていません。',
        evidence: [
          `GA4接続状態: ${connectionStatus}`,
          `取得済みmetric rows: ${context.metrics.length}`,
        ],
      }],
      recommendations: [{
        title: 'GA4・CV計測設定の検証',
        body: 'GA4 Property / Page Path / CVイベントが対象LPに正しく紐づいているか確認し、ホットペッパー・LINEなど主要CTAクリックをCVまたは重要イベントとして計測できる状態にしてください。',
        priority: 'high',
        target_area: 'measurement',
        target_selector_or_text: 'GA4設定、GTMイベント、主要CTAリンク',
        expected_effect: '改善提案とdraft反映の根拠になるCV・クリック・流入データを取得できる',
        implementation_scope: 'small',
        approved_for_draft: true,
        review_note: '実測データが不足しているため、LP文言変更より先に計測正常化を優先するのが現実的です。',
      }],
      rejected_ideas: [{
        title: '大幅なLP改修',
        reason: 'GA4計測が不足しており、改修効果を検証できないため先送りします。',
      }],
    },
    rawText: JSON.stringify({ summary }),
    usage: {},
    model: 'measurement-fallback',
  }
}


function primaryHtmlEvidence(sourceContext) {
  const headings = sourceContext?.html_signals?.headings || []
  const links = sourceContext?.html_signals?.links || []
  const firstHeading = headings.find(item => item.level === 1)?.text || headings[0]?.text || 'ファーストビュー見出し'
  const cta = links.find(item => /line|予約|相談|申込|tel|電話|hotpepper|beauty/i.test(`${item.text} ${item.href}`))
  return {
    firstHeading,
    ctaText: cta?.text || '主要CTA',
    headingCount: headings.length,
    linkCount: links.length,
  }
}

function fallbackHeuristicProposal(context, sourceContext, cause) {
  const totals = context.aiContext?.latest_30d_from_dashboard || {}
  const totals90 = context.aiContext?.totals_90d || {}
  const sessions = Number(totals.sessions ?? totals90.sessions ?? 0)
  const conversions = Number(totals.conversions ?? totals90.conversions ?? 0)
  const conversionRate = Number(totals.conversion_rate ?? totals90.conversion_rate ?? 0)
  const engagementRate = Number(totals90.average_engagement_rate ?? 0)
  const html = primaryHtmlEvidence(sourceContext)
  const summary = conversions <= 0
    ? 'AI生成が一時的に利用できなかったため、GA4とHTMLから保守的な改善案を作成しました。まずCV計測とCTA導線を確認してください。'
    : 'AI生成が一時的に利用できなかったため、GA4とHTMLから保守的な改善案を作成しました。CTAとファーストビューの訴求を優先して改善してください。'
  const cvrText = sessions > 0 ? `${(conversionRate * 100).toFixed(2)}%` : '未算出'
  return {
    parsed: {
      score: sessions > 0 && conversions > 0 ? 62 : 42,
      summary,
      diagnosis: {
        primary_issue: conversions <= 0 ? 'measurement' : 'action',
        reason: `OpenAI proposal fallback. sessions=${sessions}, conversions=${conversions}, cvr=${cvrText}, engagement=${engagementRate ? `${(engagementRate * 100).toFixed(1)}%` : 'unknown'}.`,
      },
      findings: [
        {
          title: conversions <= 0 ? 'CV計測またはCTA到達に課題' : 'CTA行動率の改善余地',
          body: `直近データではsessions=${sessions}、conversions=${conversions}、CVR=${cvrText}です。数値上、CTAクリック・予約意向イベントの計測確認と導線強化を優先します。`,
          evidence: [`sessions: ${sessions}`, `conversions: ${conversions}`, `CVR: ${cvrText}`],
        },
        {
          title: 'ファーストビューの約束を明確にする余地',
          body: `現在の主要見出し候補は「${html.firstHeading}」です。誰に、どんな変化を約束するLPかを冒頭で明確にするとCTA前の納得感を高められます。`,
          evidence: [`H1/見出し候補: ${html.firstHeading}`, `検出CTA候補: ${html.ctaText}`],
        },
      ],
      recommendations: [
        {
          title: 'CV・CTAイベントの計測確認',
          body: 'LINE、予約、電話、外部予約リンクなど主要CTAがGA4/GTMで重要イベントとして取れているか確認し、未計測なら最優先で補正します。',
          priority: 'high',
          target_area: 'measurement',
          target_selector_or_text: html.ctaText,
          expected_effect: '改善前後のCVRとCTAクリック率を比較できる状態にする',
          implementation_scope: 'small',
          approved_for_draft: true,
          review_note: 'CVが少ない、または計測不備が疑われる場合に現実的で検証可能な改善です。',
          ga4_evidence: [`sessions=${sessions}`, `conversions=${conversions}`, `cvr=${cvrText}`],
          html_evidence: [`cta=${html.ctaText}`],
          reason_chain: 'CVが低い/不明 → まず計測とCTA到達を確認 → 改善効果を評価可能にする',
        },
        {
          title: 'ファーストビューで対象者と得られる変化を明確化',
          body: '現在の見出しの近くに、対象者・悩み・施術後の変化が一文で伝わる補足コピーを追加します。',
          priority: 'high',
          target_area: 'hero',
          target_selector_or_text: html.firstHeading,
          expected_effect: 'LP冒頭の理解を早め、CTAまで読む理由を強くする',
          implementation_scope: 'small',
          approved_for_draft: true,
          review_note: '既存デザインを崩さず、文章追加または置換で検証できます。',
          ga4_evidence: [`engagement_rate=${engagementRate ? `${(engagementRate * 100).toFixed(1)}%` : 'unknown'}`],
          html_evidence: [`heading=${html.firstHeading}`],
          reason_chain: '冒頭の約束が弱い可能性 → 対象者と変化を明示 → 読了/CTAクリック改善を狙う',
        },
        {
          title: 'CTA直前の不安解消コピーを追加',
          body: 'CTAの近くに、相談前の不安を下げる短い説明を加えます。例: 初回相談の流れ、所要時間、無理な勧誘がないこと。',
          priority: 'medium',
          target_area: 'cta',
          target_selector_or_text: html.ctaText,
          expected_effect: 'CTAクリック前の心理的抵抗を下げる',
          implementation_scope: 'small',
          approved_for_draft: true,
          review_note: 'CTA周辺のコピー改善なので既存構成を壊さず実装できます。',
          ga4_evidence: [`conversions=${conversions}`, `cvr=${cvrText}`],
          html_evidence: [`cta=${html.ctaText}`],
          reason_chain: 'CTA手前で迷う可能性 → 不安解消を追加 → クリック率改善を狙う',
        },
      ],
      rejected_ideas: [{
        title: '全面リデザイン',
        reason: 'OpenAI生成が利用できない状況では根拠が粗くなるため、まず小さく検証できる改善に限定します。',
      }],
      fallback: {
        type: 'heuristic_no_openai',
        cause: String(cause?.message || cause || 'OpenAI request failed'),
      },
    },
    rawText: JSON.stringify({ summary, fallback: true }),
    usage: {},
    model: 'heuristic-fallback',
  }
}

function withProposalTimeout(promise, timeoutMs, label) {
  let timeout
  promise.catch(() => {})
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}

async function createImprovementProposalWithRecovery({ config, supabase, job, context, sourceContext }) {
  if (!config.openAiProposalUseOpenAi) {
    await writeJobStep(supabase, job.id, 'ai_proposal_safe_fallback', {
      summary: 'OpenAI proposal generation is disabled for safety. Saved a GA4/HTML heuristic proposal instead.',
      lp_project_id: job.lp_project_id,
    })
    return fallbackHeuristicProposal(context, sourceContext, 'OPENAI_PROPOSAL_USE_OPENAI=false')
  }

  const maxAttempts = Math.max(1, Number(config.openAiProposalMaxAttempts || 1))
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await writeJobStep(supabase, job.id, 'ai_proposal_attempt', {
        status: 'running',
        summary: `OpenAI proposal attempt ${attempt}/${maxAttempts}`,
        lp_project_id: job.lp_project_id,
        attempt,
        max_attempts: maxAttempts,
        timeout_ms: config.openAiRequestTimeoutMs,
      })
      const proposalPromise = createImprovementProposal({
        config,
        context: {
          ...context.aiContext,
          current_lp_source: sourceContext,
          improvement_logic_version: 'docs/ai-improvement-logic.md',
        },
      })
      return await withProposalTimeout(proposalPromise, Number(config.openAiRequestTimeoutMs || 45000), `OpenAI proposal attempt ${attempt}`)
    } catch (error) {
      lastError = error
      await writeJobStep(supabase, job.id, 'ai_proposal_attempt_failed', {
        status: attempt < maxAttempts ? 'running' : 'failed',
        summary: `OpenAI proposal attempt ${attempt}/${maxAttempts} failed`,
        lp_project_id: job.lp_project_id,
        attempt,
        max_attempts: maxAttempts,
        error_message: error instanceof Error ? error.message : String(error),
      })
      if (attempt < maxAttempts) {
        await wait(Number(config.openAiProposalRetryDelayMs || 0))
      }
    }
  }
  await writeJobStep(supabase, job.id, 'ai_proposal_heuristic_fallback', {
    summary: 'OpenAI did not return a usable proposal. Saved a GA4/HTML heuristic proposal instead of failing the job.',
    lp_project_id: job.lp_project_id,
    error_message: lastError instanceof Error ? lastError.message : String(lastError || 'Unknown OpenAI error'),
  })
  return fallbackHeuristicProposal(context, sourceContext, lastError)
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


function rootClientFolder(folderPath) {
  return String(folderPath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || ''
}

async function nextLpVariantInfo(supabase, clientId, sourceFolderPath) {
  const root = rootClientFolder(sourceFolderPath)
  if (!root) throw new Error(`Invalid source folder_path: ${sourceFolderPath}`)
  const { data, error } = await supabase
    .from('lp_projects')
    .select('name,slug,folder_path')
    .eq('client_id', clientId)
  if (error) throw new Error(error.message)
  const rows = data || []
  const used = new Set(rows.map(row => String(row.folder_path || '').replace(/^\/+|\/+$/g, '')))
  let number = 2
  while (used.has(`${root}/lp${number}`)) number += 1
  return {
    lpNumber: number,
    slug: `lp${number}`,
    nameSuffix: `LP${number}`,
    folderPath: `${root}/lp${number}`,
    publicUrl: `https://dec-site.netlify.app/${root}/lp${number}/`,
    ga4PagePath: `/${root}/lp${number}/`,
  }
}

async function cloneLpAccess(supabase, sourceLpProjectId, newLpProjectId) {
  const access = await supabase
    .from('access_user_lp_projects')
    .select('access_user_id')
    .eq('lp_project_id', sourceLpProjectId)
  if (!access.error && access.data?.length) {
    await supabase.from('access_user_lp_projects').insert(
      access.data.map(row => ({ access_user_id: row.access_user_id, lp_project_id: newLpProjectId }))
    )
  }

  const memberships = await supabase
    .from('lp_user_memberships')
    .select('user_id')
    .eq('lp_project_id', sourceLpProjectId)
  if (!memberships.error && memberships.data?.length) {
    await supabase.from('lp_user_memberships').insert(
      memberships.data.map(row => ({ user_id: row.user_id, lp_project_id: newLpProjectId }))
    )
  }
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

  if (job.job_type === 'propose_improvements' && job.payload?.executor === 'codex') {
    await writeJobStep(supabase, job.id, 'codex_context_load', {
      status: 'running',
      summary: 'Loading LP-scoped GA4 data and existing workspace files for Codex task',
      lp_project_id: job.lp_project_id,
    })
    const context = await loadLpContext(supabase, job.lp_project_id)
    const workspace = await ensureLpWorkspace(config.workspaceRoot, job.lp_project_id)
    const sourceContext = await loadLpSourceContext(workspace, context.overview.folder_path)
    await createCodexProposalTask({ supabase, job, context, sourceContext, repoPath: workspace.repo })
    return
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

    if (!context.metrics.length || context.overview.ga4_connection_status !== 'configured') {
      await writeJobStep(supabase, job.id, 'measurement_fallback', {
        summary: 'GA4 metrics are missing or incomplete. Saved measurement-first proposal without calling OpenAI.',
        lp_project_id: job.lp_project_id,
        metric_rows: context.metrics.length,
        ga4_connection_status: context.overview.ga4_connection_status,
      })
      const saved = await saveAiResults({ config, supabase, job, context, proposal: fallbackMeasurementProposal(context) })
      await writeJobStep(supabase, job.id, 'ai_proposal_saved', {
        summary: 'Measurement fallback proposal was saved to ai_analysis_results',
        lp_project_id: job.lp_project_id,
        ai_analysis_result_id: saved.analysisId,
        recommendation_count: saved.normalized.recommendations.length,
        total_tokens: saved.cost.totalTokens,
        estimated_cost_jpy: saved.cost.estimatedCostJpy,
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

    const proposal = await createImprovementProposalWithRecovery({
      config,
      supabase,
      job,
      context,
      sourceContext,
    })
    const saved = await saveAiResults({ config, supabase, job, context, proposal })

    await writeJobStep(supabase, job.id, 'ai_proposal_saved', {
      summary: proposal.model === 'heuristic-fallback' ? 'Heuristic fallback proposal was saved to ai_analysis_results' : 'AI proposal was saved to ai_analysis_results',
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

    if (job.payload?.action === 'create_lp_variant') {
      const variant = await nextLpVariantInfo(supabase, context.overview.client_id, context.overview.folder_path)
      const lpName = String(job.payload?.lp_name || `${context.overview.client_name} ${variant.nameSuffix}`).trim()
      const sourceMode = job.payload?.source || 'copy_current_lp'
      const sourceFolderPath = sourceMode === 'template' && job.payload?.template_folder_path
        ? String(job.payload.template_folder_path)
        : context.overview.folder_path
      const branchName = `ailp/${variant.folderPath}/create`.replace(/[^A-Za-z0-9/_-]/g, '-')

      await writeJobStep(supabase, job.id, 'lp_variant_repo_prepare', {
        status: 'running',
        summary: 'Preparing repository to create a new LP under the same client',
        lp_project_id: job.lp_project_id,
        source_folder_path: sourceFolderPath,
        target_folder_path: variant.folderPath,
      })
      await prepareRepo({ config, workspace, branchName })
      const created = await createLpVariantFolder({
        config,
        workspace,
        sourceFolderPath,
        targetFolderPath: variant.folderPath,
        branchName,
        lpName,
      })

      const { data: newLp, error: lpError } = await supabase.from('lp_projects').insert({
        client_id: context.overview.client_id,
        name: lpName,
        slug: variant.slug,
        folder_path: variant.folderPath,
        public_url: created.publicUrl,
        ga4_page_path: variant.ga4PagePath,
        status: 'active',
      }).select('id').single()
      if (lpError) throw new Error(lpError.message)

      await supabase.from('lp_projects').update({
        lp_number: variant.lpNumber,
        is_primary: false,
        parent_lp_project_id: job.lp_project_id,
        creation_method: sourceMode === 'template' ? 'template' : 'copy_current_lp',
        template_key: sourceMode === 'template' ? (job.payload?.template_key || null) : null,
      }).eq('id', newLp.id)

      await supabase.from('lp_analytics_settings').insert({
        lp_project_id: newLp.id,
        ga4_property_id: null,
        ga4_page_path: variant.ga4PagePath,
        ga4_measurement_id: null,
        gtm_container_id: null,
        is_active: true,
      })
      await cloneLpAccess(supabase, job.lp_project_id, newLp.id)

      await supabase.from('git_versions').insert({
        lp_project_id: newLp.id,
        version_label: 'mainLP-initial',
        branch: created.branchName,
        commit_sha: created.commitSha,
        folder_path: created.folderPath,
        change_summary: `Created ${lpName} from ${sourceFolderPath}. GA4/GTM settings are required per LP.`,
        is_production: true,
        public_url: created.publicUrl,
        published_at: new Date().toISOString(),
      })

      await supabase.from('lp_job_artifacts').insert({
        job_id: job.id,
        lp_project_id: newLp.id,
        artifact_type: 'lp_variant_created',
        file_path: created.folderPath,
        git_branch: created.branchName,
        commit_sha: created.commitSha,
        preview_url: created.publicUrl,
        diff_summary: created.diffSummary,
        metadata: {
          source_lp_project_id: job.lp_project_id,
          source_folder_path: sourceFolderPath,
          creation_method: sourceMode,
          ga4_gtm_required: true,
        },
      })

      await supabase.from('lp_jobs').update({
        result_summary: `Created ${lpName} at ${created.publicUrl}. Configure GA4/GTM for this LP before analysis.`,
        git_branch: created.branchName,
        commit_sha: created.commitSha,
        preview_url: created.publicUrl,
        payload: {
          ...(job.payload || {}),
          created_lp_project_id: newLp.id,
          created_folder_path: created.folderPath,
          created_public_url: created.publicUrl,
          ga4_gtm_required: true,
        },
      }).eq('id', job.id)

      await writeJobStep(supabase, job.id, 'lp_variant_created', {
        summary: 'New LP variant was created under the same client and published to main',
        source_lp_project_id: job.lp_project_id,
        new_lp_project_id: newLp.id,
        folder_path: created.folderPath,
        public_url: created.publicUrl,
        commit_sha: created.commitSha,
      })
      return
    }

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
    await writeJobStep(supabase, job.id, 'draft_context_load', {
      status: 'running',
      summary: 'Loading LP dashboard and GA4 context for draft generation',
      lp_project_id: job.lp_project_id,
    })
    const context = await loadDraftLpContext(supabase, job.lp_project_id)
    await writeJobStep(supabase, job.id, 'draft_context_ready', {
      summary: 'Draft context is ready',
      lp_project_id: job.lp_project_id,
      folder_path: context.overview.folder_path,
      metric_rows: context.metrics.length,
    })
    await writeJobStep(supabase, job.id, 'draft_analysis_load', {
      status: 'running',
      summary: 'Loading AI analysis for draft generation',
      lp_project_id: job.lp_project_id,
      ai_analysis_result_id: job.payload?.ai_analysis_result_id || null,
    })
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
    await writeJobStep(supabase, job.id, 'draft_analysis_ready', {
      summary: 'AI analysis is ready for draft generation',
      lp_project_id: job.lp_project_id,
      ai_analysis_result_id: analysis.id,
      recommendation_count: Array.isArray(analysis.recommendations) ? analysis.recommendations.length : 0,
    })
    const overrideRecommendations = Array.isArray(job.payload?.override_recommendations)
      ? job.payload.override_recommendations
      : null
    const manualInstruction = String(job.payload?.manual_instruction || '').trim()
    const baseRecommendations = overrideRecommendations || (Array.isArray(analysis.recommendations) ? analysis.recommendations : [])
    const draftRecommendations = manualInstruction
      ? [
          ...baseRecommendations,
          {
            title: '管理者からの追加修正指示',
            body: manualInstruction,
            evidence: ['draft preview確認後の手動修正指示'],
            hypothesis: manualInstruction,
            priority: 'high',
            route: 'manual_revision',
            target_area: 'manual_revision',
            target_selector_or_text: '',
            expected_effect: 'preview確認後の違和感を修正し、公開前の精度を上げる',
            implementation_scope: 'small',
            approved_for_draft: true,
            review_note: '管理画面の修正指示として追加',
          },
        ]
      : baseRecommendations
    const draftAnalysis = (overrideRecommendations || manualInstruction)
      ? {
          ...analysis,
          recommendations: draftRecommendations,
          summary: manualInstruction
            ? `${analysis.summary || 'AI analysis'} / 手動修正指示を反映: ${manualInstruction.slice(0, 120)}`
            : `${analysis.summary || 'AI analysis'} / 管理画面で保存された改善案をdraftに反映`,
        }
      : analysis
    if (manualInstruction) {
      await writeJobStep(supabase, job.id, 'draft_manual_instruction_ready', {
        summary: 'Manual revision instruction is ready for draft regeneration',
        lp_project_id: job.lp_project_id,
        manual_instruction: manualInstruction,
        source_draft_job_id: job.payload?.source_draft_job_id || null,
        source_draft_commit_sha: job.payload?.source_draft_commit_sha || null,
      })
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
    let planResponse
    if (job.payload?.html_executor === 'codex' || job.payload?.executor === 'codex_html') {
      const parsed = fallbackDraftPlanFromAnalysis(draftAnalysis)
      planResponse = { parsed, rawText: JSON.stringify(parsed), usage: {}, model: 'codex-html-handoff' }
      await createCodexHtmlEditTask({
        supabase,
        job,
        context,
        sourceContext,
        analysis: draftAnalysis,
        plan: parsed,
        repoPath: workspace.repo,
        versionSlug,
      })
    } else {
      planResponse = await createDraftChangePlan({
        config,
        context: {
          ...context.aiContext,
          current_lp_source: sourceContext,
          improvement_logic_version: 'docs/ai-improvement-logic.md',
          operator_saved_proposals: overrideRecommendations,
          draft_source: job.payload?.draft_source || 'latest_ai_analysis',
          route: job.payload?.route || null,
        },
        analysis: draftAnalysis,
      })
    }
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
    let mainPreviewPublish = null
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
    if (pushed && job.payload?.publish_preview_folder === true) {
      await writeJobStep(supabase, job.id, 'preview_folder_publish', {
        status: 'running',
        summary: 'Publishing preview folder to main without changing production LP folder',
        lp_project_id: job.lp_project_id,
        branch: branchName,
        preview_path: draft.previewPath,
      })
      mainPreviewPublish = await publishPreviewFolderToMain({
        config,
        branchName,
        previewPath: draft.previewPath,
      })
    }

    const { data: interaction, error: interactionError } = await supabase
      .from('lp_ai_interactions')
      .insert({
        job_id: job.id,
        lp_project_id: job.lp_project_id,
        model: planResponse.model,
        action_type: job.job_type,
        prompt_summary: manualInstruction ? 'Manual draft revision instruction was converted into a draft-only LP update plan.' : 'Latest LP-scoped AI analysis was converted into a draft-only LP update plan.',
        response_summary: planResponse.parsed?.headline || analysis.summary,
        input_refs: [{ table: 'ai_analysis_results', id: analysis.id, draft_source: job.payload?.draft_source || 'latest_ai_analysis', manual_instruction: manualInstruction || null }],
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
        draft_source: job.payload?.draft_source || 'latest_ai_analysis',
        route: job.payload?.route || null,
        manual_instruction: manualInstruction || null,
        source_draft_job_id: job.payload?.source_draft_job_id || null,
        source_draft_commit_sha: job.payload?.source_draft_commit_sha || null,
        preview_folder_published_to_main: Boolean(mainPreviewPublish?.published),
        preview_folder_main_commit_sha: mainPreviewPublish?.commitSha || null,
      },
    })
    if (artifactError) throw new Error(artifactError.message)

    const { error: jobUpdateError } = await supabase.from('lp_jobs').update({
      result_summary: `Draft ${draft.previewPath} updated from ${manualInstruction ? 'manual revision instruction' : 'AI proposal'}. Production folder and main were not changed.${pushed ? ' Branch was pushed.' : ' Branch was not pushed.'}`,
      git_branch: draft.branchName,
      commit_sha: draft.commitSha,
      preview_url: draft.previewUrl,
      payload: {
        ...(job.payload ?? {}),
        ai_analysis_result_id: analysis.id,
        ai_interaction_id: interaction.id,
        github_branch_url: draft.githubBranchUrl,
        netlify_preview_status: draft.netlifyPreviewStatus,
        preview_folder_published_to_main: Boolean(mainPreviewPublish?.published),
        preview_folder_main_commit_sha: mainPreviewPublish?.commitSha || null,
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

  if (job.job_type === 'publish_version') {
    const context = await loadLpContext(supabase, job.lp_project_id)
    const artifactQuery = supabase
      .from('lp_job_artifacts')
      .select('*')
      .eq('lp_project_id', job.lp_project_id)
      .eq('artifact_type', 'draft_lp_update')
      .order('created_at', { ascending: false })
      .limit(1)

    if (job.payload?.draft_job_id) artifactQuery.eq('job_id', job.payload.draft_job_id)
    if (job.payload?.commit_sha) artifactQuery.eq('commit_sha', job.payload.commit_sha)

    const { data: artifacts, error: artifactLookupError } = await artifactQuery
    if (artifactLookupError) throw new Error(artifactLookupError.message)
    const artifact = artifacts?.[0]
    if (!artifact) throw new Error('No draft artifact found to publish.')

    const { data: draftVersion, error: versionLookupError } = await supabase
      .from('git_versions')
      .select('*')
      .eq('lp_project_id', job.lp_project_id)
      .eq('commit_sha', artifact.commit_sha)
      .maybeSingle()
    if (versionLookupError) throw new Error(versionLookupError.message)
    const isApprovedDraft = String(draftVersion?.change_summary || '').startsWith('[承認済みdraft]')
    if (!isApprovedDraft && job.payload?.allow_unapproved !== true) {
      throw new Error('Draft is not approved. Click "このdraftでOK" before publishing to production.')
    }

    const sourceBranch = artifact.git_branch || job.payload?.git_branch
    const previewPath = artifact.file_path
    if (!sourceBranch || !previewPath) throw new Error('Draft artifact is missing git_branch or file_path.')

    await writeJobStep(supabase, job.id, 'production_publish_prepare', {
      status: 'running',
      summary: 'Preparing production publish from approved draft',
      lp_project_id: job.lp_project_id,
      source_branch: sourceBranch,
      preview_path: previewPath,
      production_folder: context.overview.folder_path,
      source_commit_sha: artifact.commit_sha,
    })

    if (config.dryRun) {
      await writeJobStep(supabase, job.id, 'dry_run_complete', {
        summary: 'Dry run skipped production publish',
        lp_project_id: job.lp_project_id,
        preview_path: previewPath,
      })
      return
    }

    const previousLive = await (async () => {
      const { data, error } = await supabase
        .from('git_versions')
        .select('*')
        .eq('lp_project_id', job.lp_project_id)
        .eq('is_production', true)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    })()

    const published = await publishVersionToProduction({
      config,
      branchName: sourceBranch,
      previewPath,
      productionFolder: context.overview.folder_path,
    })

    const productionLabel = `live-${new Date().toISOString().slice(0, 10)}-${published.commitSha.slice(0, 7)}`
    const changeSummary = String(draftVersion?.change_summary || artifact.metadata?.draft_source || 'Published approved draft to production')

    const { error: clearLiveError } = await supabase
      .from('git_versions')
      .update({ is_production: false })
      .eq('lp_project_id', job.lp_project_id)
      .eq('is_production', true)
    if (clearLiveError) throw new Error(clearLiveError.message)

    const { data: productionVersion, error: productionVersionError } = await supabase
      .from('git_versions')
      .insert({
        lp_project_id: job.lp_project_id,
        version_label: productionLabel,
        branch: 'main',
        commit_sha: published.commitSha,
        parent_commit_sha: previousLive?.commit_sha || artifact.commit_sha,
        folder_path: context.overview.folder_path,
        change_summary: `[本番反映] ${changeSummary.replace(/^\[承認済みdraft\]\s*/, '')}`,
        is_production: true,
      })
      .select('id')
      .single()
    if (productionVersionError) throw new Error(productionVersionError.message)

    const publicUrl = context.overview.public_url || published.publicUrl
    const { error: deploymentError } = await supabase.from('production_deployments').insert({
      lp_project_id: job.lp_project_id,
      provider: 'netlify',
      deploy_url: published.publicUrl,
      public_url: publicUrl,
      commit_sha: published.commitSha,
      status: 'succeeded',
      deployed_at: new Date().toISOString(),
    })
    if (deploymentError) throw new Error(deploymentError.message)

    const { error: artifactError } = await supabase.from('lp_job_artifacts').insert({
      job_id: job.id,
      lp_project_id: job.lp_project_id,
      artifact_type: 'production_publish',
      file_path: context.overview.folder_path,
      git_branch: 'main',
      commit_sha: published.commitSha,
      preview_url: publicUrl,
      diff_summary: published.diffSummary,
      metadata: {
        source_artifact_id: artifact.id,
        source_draft_job_id: artifact.job_id,
        source_preview_path: previewPath,
        source_commit_sha: artifact.commit_sha,
        production_version_id: productionVersion.id,
        previous_live_commit_sha: previousLive?.commit_sha || null,
        public_path: published.publicPath,
        published_to_main: true,
      },
    })
    if (artifactError) throw new Error(artifactError.message)

    const { error: jobUpdateError } = await supabase.from('lp_jobs').update({
      result_summary: `Published approved draft ${previewPath} to production folder ${context.overview.folder_path}.`,
      git_branch: 'main',
      commit_sha: published.commitSha,
      preview_url: publicUrl,
      payload: {
        ...(job.payload ?? {}),
        source_artifact_id: artifact.id,
        source_draft_job_id: artifact.job_id,
        source_preview_path: previewPath,
        source_commit_sha: artifact.commit_sha,
        production_version_id: productionVersion.id,
        previous_live_commit_sha: previousLive?.commit_sha || null,
      },
    }).eq('id', job.id)
    if (jobUpdateError) throw new Error(jobUpdateError.message)

    await writeJobStep(supabase, job.id, 'production_published', {
      summary: 'Approved draft was published to the production LP folder',
      lp_project_id: job.lp_project_id,
      source_preview_path: previewPath,
      production_folder: context.overview.folder_path,
      commit_sha: published.commitSha,
      public_url: publicUrl,
      diff_summary: published.diffSummary,
      previous_live_commit_sha: previousLive?.commit_sha || null,
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

