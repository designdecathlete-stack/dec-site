import { setTimeout as wait } from 'node:timers/promises'
import { loadConfig } from '../config.js'
import { createSupabase } from './supabase.js'
import { executeJob } from './job-executor.js'

const once = process.argv.includes('--once')

async function recoverStaleRunningJobs(supabase, staleMinutes) {
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('lp_jobs')
    .update({
      status: 'queued',
      error_message: `Recovered stale running job after ${staleMinutes} minutes`,
      started_at: null,
      finished_at: null,
    })
    .eq('status', 'running')
    .lt('updated_at', cutoff)

  if (error) throw new Error(error.message)
}

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

async function tick(config, supabase) {
  await recoverStaleRunningJobs(supabase, config.staleRunningJobMinutes)
  const jobs = await claimJobs(supabase, config.maxJobsPerTick)
  for (const job of jobs) {
    await executeJob({ config, supabase, job })
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
