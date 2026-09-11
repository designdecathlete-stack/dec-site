import { setTimeout as wait } from 'node:timers/promises'
import { loadConfig } from '../config.js'
import { createSupabase } from './supabase.js'
import { runJob } from './job-runner.js'

const once = process.argv.includes('--once')

async function claimJobs(supabase, limit) {
  const { data, error } = await supabase
    .from('lp_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data ?? []
}

async function setJobStatus(supabase, jobId, status, errorMessage = null) {
  const patch = {
    status,
    error_message: errorMessage,
    finished_at: ['succeeded', 'failed'].includes(status) ? new Date().toISOString() : null,
  }
  if (status === 'running') {
    patch.started_at = new Date().toISOString()
    patch.finished_at = null
  }

  const { error } = await supabase.from('lp_jobs').update(patch).eq('id', jobId)
  if (error) throw new Error(error.message)
}

async function tick(config, supabase) {
  const jobs = await claimJobs(supabase, config.maxJobsPerTick)
  for (const job of jobs) {
    try {
      await setJobStatus(supabase, job.id, 'running')
      await runJob({ config, supabase, job })
      await setJobStatus(supabase, job.id, 'succeeded')
    } catch (error) {
      await setJobStatus(
        supabase,
        job.id,
        'failed',
        error instanceof Error ? error.message : 'Unknown worker error'
      )
    }
  }
}

async function main() {
  const config = loadConfig()
  const supabase = createSupabase(config)

  do {
    await tick(config, supabase)
    if (!once) {
      await wait(config.pollIntervalMs)
    }
  } while (!once)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

