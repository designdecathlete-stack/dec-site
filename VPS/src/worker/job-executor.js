import { runJob } from './job-runner.js'

export function withTimeout(promise, timeoutMs, label) {
  let timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}

export async function setJobStatus(supabase, jobId, status, errorMessage = null, extraPatch = {}) {
  const patch = {
    status,
    error_message: errorMessage,
    ...extraPatch,
  }

  if (status === 'running') {
    patch.started_at = patch.started_at || new Date().toISOString()
    patch.finished_at = null
  }

  if (['succeeded', 'failed'].includes(status)) {
    patch.finished_at = patch.finished_at || new Date().toISOString()
  }

  const { error } = await supabase.from('lp_jobs').update(patch).eq('id', jobId)
  if (error) throw new Error(error.message)
}

export async function executeJob({ config, supabase, job }) {
  try {
    await setJobStatus(supabase, job.id, 'running')
    await withTimeout(runJob({ config, supabase, job }), config.jobTimeoutMs, `Job ${job.id}`)
    await setJobStatus(supabase, job.id, 'succeeded')
    return { status: 'succeeded' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error'
    await setJobStatus(supabase, job.id, 'failed', message)
    return { status: 'failed', error_message: message }
  }
}

export async function loadJobById(supabase, jobId) {
  const { data, error } = await supabase.from('lp_jobs').select('*').eq('id', jobId).single()
  if (error) throw new Error(error.message)
  return data
}
