const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]+/g,
  /gh[pousr]_[A-Za-z0-9_]+/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
]

export function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[REDACTED]')
  }
  return text
}

export async function writeJobStep(supabase, jobId, step, payload = {}) {
  const safePayload = JSON.parse(redact(payload))
  const { error } = await supabase.from('lp_job_steps').insert({
    job_id: jobId,
    step,
    status: payload.status ?? 'succeeded',
    summary: payload.summary ?? null,
    metadata: safePayload,
  })

  if (error) {
    console.error('Failed to write lp_job_steps', error.message)
  }
}

