import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createServiceClient } from './supabase.ts'

type LoggerContext = {
  requestId: string
  functionName: string
  actorUserId?: string | null
  clientId?: string | null
  lpProjectId?: string | null
  appJobId?: string | null
  httpMethod?: string | null
}

type LogEntry = {
  stage: string
  message: string
  level?: 'debug' | 'info' | 'warn' | 'error'
  statusCode?: number | null
  durationMs?: number | null
  metadata?: Record<string, unknown>
}

export function createApiLogger(initialContext: LoggerContext) {
  const context: LoggerContext = { ...initialContext }

  function setContext(partial: Partial<LoggerContext>) {
    Object.assign(context, partial)
  }

  async function log(entry: LogEntry) {
    try {
      const service = createServiceClient()
      const { error } = await service.from('api_logs').insert({
        request_id: context.requestId,
        function_name: context.functionName,
        stage: entry.stage,
        level: entry.level ?? 'info',
        message: entry.message,
        actor_user_id: context.actorUserId ?? null,
        client_id: context.clientId ?? null,
        lp_project_id: context.lpProjectId ?? null,
        app_job_id: context.appJobId ?? null,
        http_method: context.httpMethod ?? null,
        status_code: entry.statusCode ?? null,
        duration_ms: entry.durationMs ?? null,
        metadata: entry.metadata ?? {},
      })

      if (error) {
        console.error('api_logs insert failed', error)
      }
    } catch (error) {
      console.error('api_logs insert failed', error)
    }
  }

  return { setContext, log }
}
