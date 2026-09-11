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
        task: [
          'Act as a professional LP marketer.',
          'Create improvement proposals from GA4 metrics and the current HTML/CSS signals.',
          'Then review your own proposals and keep only realistic, testable draft changes.',
          'Avoid narrow cosmetic-only ideas unless the metrics strongly justify them.',
          'Avoid full redesigns unless the current HTML evidence makes them unavoidable.',
        ].join(' '),
        required_json_shape: {
          score: 'integer 0-100',
          summary: 'short Japanese summary',
          diagnosis: {
            primary_issue: 'traffic|interest|read|action|measurement',
            reason: 'Japanese reason based on GA4 and HTML/CSS',
          },
          findings: [{
            title: 'Japanese title',
            body: 'evidence from metrics and current LP source',
            evidence: ['GA4 evidence', 'HTML/CSS evidence'],
          }],
          recommendations: [{
            title: 'Japanese action',
            body: 'specific change proposal',
            priority: 'high|medium|low',
            target_area: 'hero|cta|offer|proof|faq|measurement|other',
            target_selector_or_text: 'section/class/text to change if known',
            expected_effect: 'what should improve',
            implementation_scope: 'small|medium|large',
            approved_for_draft: true,
            review_note: 'self-review result: not too narrow, realistic, testable',
          }],
          rejected_ideas: [{ title: 'Japanese rejected idea', reason: 'why it was rejected' }],
        },
        review_rules: [
          'Reject ideas that are too narrow, such as changing only color or one word without a metric reason.',
          'Reject ideas that are too broad for one draft, such as rebuilding the whole LP.',
          'If conversions are zero or suspicious, include measurement verification as a recommendation.',
          'Prefer changes that can be implemented in the current HTML/CSS within one draft.',
          'Tie each recommendation to a GA4 fact and a current LP source signal.',
        ],
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

export async function createDraftChangePlan({ config, context, analysis }) {
  const openai = createOpenAi(config)
  const messages = [
    {
      role: 'system',
      content: [
        'You are an LP editor for AILP.',
        'Use only the provided LP-scoped context and analysis.',
        'Do not mention or infer other LPs, clients, secrets, tokens, or unrelated projects.',
        'Return strict JSON only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: [
          'Create a concise draft update plan for a landing page preview.',
          'Use only recommendations that passed self-review.',
          'Prefer natural LP edits to hero, CTA, offer, proof, FAQ, or measurement notes.',
          'For now the worker may render this as a draft-only improvement section, but the plan must specify real target areas for future direct HTML edits.',
        ].join(' '),
        required_json_shape: {
          headline: 'Japanese headline for the draft improvement section',
          lead: 'short Japanese lead copy',
          changes: [{
            title: 'Japanese change title',
            body: 'specific LP copy or section direction',
            target_area: 'hero|cta|offer|proof|faq|measurement|other',
            target_selector_or_text: 'section/class/text to change if known',
            edit_intent: 'replace_copy|add_cta|add_section|reorder|measurement_check|other',
          }],
          cta_label: 'Japanese CTA label',
          self_review_summary: 'why these changes are realistic and not too narrow',
        },
        context,
        analysis: {
          summary: analysis?.summary,
          findings: analysis?.findings,
          recommendations: analysis?.recommendations,
          score: analysis?.score,
        },
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
