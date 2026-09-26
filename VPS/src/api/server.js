import http from 'node:http'
import { loadConfig, env } from '../config.js'
import { createSupabase } from '../worker/supabase.js'
import { executeJob, loadJobById, setJobStatus } from '../worker/job-executor.js'

const config = loadConfig()
const supabase = createSupabase(config)
const port = Number(env('VPS_API_PORT', '8787'))
const apiToken = env('VPS_API_TOKEN', '')
const allowedOrigins = env('VPS_API_ALLOWED_ORIGINS', '*')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const runningJobs = new Set()
let queuePollerRunning = false

function corsOrigin(origin) {
  if (!origin) return '*'
  if (allowedOrigins.includes('*')) return origin
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || origin
}

function sendJson(res, statusCode, body, origin = '') {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': corsOrigin(origin),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-ailp-vps-token',
    'access-control-max-age': '600',
  })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function requireApiToken(req) {
  if (!apiToken) return
  const headerToken = req.headers['x-ailp-vps-token']
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
  if (headerToken !== apiToken && bearer !== apiToken) {
    const error = new Error('Unauthorized VPS API request')
    error.statusCode = 401
    throw error
  }
}

function assertUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))) {
    const error = new Error(`${label} must be a UUID`)
    error.statusCode = 400
    throw error
  }
}

function defaultPayloadFor(jobType, payload = {}) {
  if (jobType === 'propose_improvements') {
    return {
      executor: 'codex',
      knowledge_files: [
        'docs/ai-proposal-prompt.md',
        'docs/ai-html-edit-prompt.md',
        'docs/ai-improvement-logic.md',
        'docs/ga4-scoring-logic.md',
      ],
      ...payload,
    }
  }
  if (jobType === 'apply_to_draft') {
    return { push: true, html_executor: 'codex', ...payload }
  }
  return payload
}

async function createJob({ lpProjectId, jobType, payload = {}, priority = 50 }) {
  assertUuid(lpProjectId, 'lp_project_id')
  const { data, error } = await supabase
    .from('lp_jobs')
    .insert({
      lp_project_id: lpProjectId,
      job_type: jobType,
      priority,
      status: 'queued',
      payload: defaultPayloadFor(jobType, payload),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function startJob(job) {
  if (runningJobs.has(job.id)) return
  runningJobs.add(job.id)
  setImmediate(async () => {
    try {
      await executeJob({ config, supabase, job })
    } finally {
      runningJobs.delete(job.id)
    }
  })
}

async function claimQueuedJobs(limit = 1) {
  const { data: candidates, error } = await supabase
    .from('lp_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit * 3)

  if (error) throw new Error(error.message)
  const claimed = []
  for (const job of candidates ?? []) {
    if (claimed.length >= limit) break
    if (runningJobs.has(job.id)) continue
    const { data, error: claimError } = await supabase
      .from('lp_jobs')
      .update({
        status: 'running',
        error_message: null,
        started_at: new Date().toISOString(),
        finished_at: null,
      })
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle()
    if (claimError) throw new Error(claimError.message)
    if (data) claimed.push(data)
  }
  return claimed
}

async function recoverStaleRunningJobs() {
  const cutoff = new Date(Date.now() - config.staleRunningJobMinutes * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('lp_jobs')
    .update({
      status: 'queued',
      error_message: `Recovered stale running job by API poller after ${config.staleRunningJobMinutes} minutes`,
      started_at: null,
      finished_at: null,
    })
    .eq('status', 'running')
    .lt('updated_at', cutoff)
  if (error) throw new Error(error.message)
}

async function pollQueueOnce() {
  if (queuePollerRunning) return
  queuePollerRunning = true
  try {
    await recoverStaleRunningJobs()
    const jobs = await claimQueuedJobs(1)
    for (const job of jobs) startJob(job)
  } catch (error) {
    console.error('AILP API queue poll failed:', error.message || error)
  } finally {
    queuePollerRunning = false
  }
}

async function handlePost(pathname, req, res, origin) {
  requireApiToken(req)
  const body = await readJson(req)

  if (pathname === '/api/jobs/propose') {
    const job = await createJob({
      lpProjectId: body.lp_project_id,
      jobType: 'propose_improvements',
      payload: body.payload || {},
      priority: Number(body.priority || 50),
    })
    await startJob(job)
    return sendJson(res, 202, { ok: true, job_id: job.id, status: 'running', lp_project_id: job.lp_project_id }, origin)
  }

  if (pathname === '/api/jobs/apply-draft') {
    const job = await createJob({
      lpProjectId: body.lp_project_id,
      jobType: 'apply_to_draft',
      payload: body.payload || {},
      priority: Number(body.priority || 50),
    })
    await startJob(job)
    return sendJson(res, 202, { ok: true, job_id: job.id, status: 'running', lp_project_id: job.lp_project_id }, origin)
  }

  if (pathname === '/api/jobs/publish') {
    const job = await createJob({
      lpProjectId: body.lp_project_id,
      jobType: 'publish_version',
      payload: body.payload || {},
      priority: Number(body.priority || 50),
    })
    await startJob(job)
    return sendJson(res, 202, { ok: true, job_id: job.id, status: 'running', lp_project_id: job.lp_project_id }, origin)
  }

  if (pathname === '/api/jobs/run') {
    assertUuid(body.job_id, 'job_id')
    const job = await loadJobById(supabase, body.job_id)
    if (!['queued', 'failed'].includes(job.status)) {
      return sendJson(res, 409, { ok: false, job_id: job.id, status: job.status, message: 'Job is not runnable' }, origin)
    }
    await setJobStatus(supabase, job.id, 'queued', null)
    await startJob({ ...job, status: 'queued' })
    return sendJson(res, 202, { ok: true, job_id: job.id, status: 'running', lp_project_id: job.lp_project_id }, origin)
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' }, origin)
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || ''
  try {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {}, origin)
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'ailp-vps-api', running_jobs: runningJobs.size }, origin)
    }
    if (req.method === 'POST') return handlePost(url.pathname, req, res, origin)
    return sendJson(res, 404, { ok: false, error: 'Not found' }, origin)
  } catch (error) {
    const statusCode = error.statusCode || 500
    return sendJson(res, statusCode, { ok: false, error: error.message || 'VPS API error' }, origin)
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`AILP VPS API listening on ${port}`)
  pollQueueOnce()
  setInterval(pollQueueOnce, Math.max(5000, config.pollIntervalMs))
})
