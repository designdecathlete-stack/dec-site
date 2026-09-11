import OpenAI from 'openai'

export function createOpenAi(config) {
  return new OpenAI({
    apiKey: config.openAiApiKey,
  })
}

function jsonFromText(text) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

export async function createImprovementProposal({ config, context }) {
  const openai = createOpenAi(config)
  const messages = [
    {
      role: 'system',
      content: [
        'You are an LP growth analyst for AILP.',
        'Use only the provided LP-scoped context.',
        'Do not mention or infer other LPs, clients, secrets, tokens, or unrelated projects.',
        'Return strict JSON only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Create practical improvement proposals for this landing page based on GA4 metrics.',
        required_json_shape: {
          score: 'integer 0-100',
          summary: 'short Japanese summary',
          findings: [{ title: 'Japanese title', body: 'evidence from metrics' }],
          recommendations: [{ title: 'Japanese action', body: 'specific change proposal', priority: 'high|medium|low' }],
        },
        context,
      }),
    },
  ]

  const response = await openai.chat.completions.create({
    model: config.openAiModel,
    messages,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content ?? '{}'
  const parsed = jsonFromText(content)
  return {
    parsed,
    rawText: content,
    usage: response.usage ?? {},
    model: response.model ?? config.openAiModel,
  }
}

export function estimateCost(config, usage) {
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0)
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0)
  const cachedInputTokens = Number(usage.prompt_tokens_details?.cached_tokens ?? usage.cached_input_tokens ?? 0)
  const billableInputTokens = Math.max(inputTokens - cachedInputTokens, 0)

  const usd =
    (billableInputTokens / 1_000_000) * config.openAiInputUsdPerMillion +
    (cachedInputTokens / 1_000_000) * config.openAiCachedInputUsdPerMillion +
    (outputTokens / 1_000_000) * config.openAiOutputUsdPerMillion

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens: Number(usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? inputTokens + outputTokens),
    estimatedCostUsd: Number.isFinite(usd) ? usd : null,
    estimatedCostJpy: Number.isFinite(usd) ? usd * config.usdJpyRate : null,
  }
}
