const endpoints = {
  propose_improvements: '/api/jobs/propose',
  apply_to_draft: '/api/jobs/apply-draft',
  publish_version: '/api/jobs/publish',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return response(204, {})
  }
  if (event.httpMethod !== 'POST') {
    return response(405, { ok: false, error: 'Method not allowed' })
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const jobType = body.job_type
    const endpoint = endpoints[jobType]
    if (!endpoint) {
      return response(400, { ok: false, error: `Unsupported job_type: ${jobType || ''}` })
    }

    const baseUrl = String(process.env.AILP_VPS_API_URL || process.env.VPS_API_URL || '').replace(/\/$/, '')
    const token = String(process.env.AILP_VPS_API_TOKEN || process.env.VPS_API_TOKEN || '')
    if (!baseUrl) {
      return response(500, { ok: false, error: 'AILP_VPS_API_URL is not configured' })
    }

    const upstream = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-ailp-vps-token': token } : {}),
      },
      body: JSON.stringify({
        lp_project_id: body.lp_project_id,
        payload: body.payload || {},
        priority: body.priority,
      }),
    })
    const text = await upstream.text()
    let json
    try { json = text ? JSON.parse(text) : {} } catch { json = { ok: false, error: text || 'Invalid VPS response' } }
    return response(upstream.status, json)
  } catch (error) {
    return response(500, { ok: false, error: error.message || 'AILP job proxy failed' })
  }
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: statusCode === 204 ? '' : JSON.stringify(body),
  }
}
