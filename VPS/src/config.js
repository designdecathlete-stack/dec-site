export function env(name, fallback = undefined) {
  const value = process.env[name]
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

export function loadConfig() {
  return {
    supabaseUrl: env('SUPABASE_URL'),
    supabaseServiceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    openAiApiKey: env('OPENAI_API_KEY'),
    openAiModel: env('OPENAI_MODEL', 'gpt-5.1'),
    githubToken: env('GITHUB_TOKEN', ''),
    githubRepository: env('GITHUB_REPOSITORY', 'designdecathlete-stack/dec-site'),
    gitRepoUrl: env('GIT_REPO_URL', ''),
    workspaceRoot: env('WORKSPACE_ROOT', '/srv/ailp/workspaces'),
    pollIntervalMs: Number(env('JOB_POLL_INTERVAL_MS', '10000')),
    maxJobsPerTick: Number(env('MAX_JOBS_PER_TICK', '1')),
    dryRun: env('DRY_RUN', 'true') === 'true',
    usdJpyRate: Number(env('USD_JPY_RATE', '150')),
    openAiInputUsdPerMillion: Number(env('OPENAI_INPUT_USD_PER_MILLION', '0')),
    openAiOutputUsdPerMillion: Number(env('OPENAI_OUTPUT_USD_PER_MILLION', '0')),
    openAiCachedInputUsdPerMillion: Number(env('OPENAI_CACHED_INPUT_USD_PER_MILLION', '0')),
  }
}

