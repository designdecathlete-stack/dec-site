import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400)
}

export function unauthorized(message = 'Unauthorized'): Response {
  return json({ error: message }, 401)
}

export function forbidden(message = 'Forbidden'): Response {
  return json({ error: message }, 403)
}

export function methodNotAllowed(): Response {
  return json({ error: 'Method not allowed' }, 405)
}

export function serverError(message: string): Response {
  return json({ error: message }, 500)
}
