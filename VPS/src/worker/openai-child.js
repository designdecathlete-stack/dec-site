import OpenAI from 'openai'

function jsonFromText(text) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

function proposalMessages(context) {
  return [
    { role: 'system', content: ['You are an LP growth analyst for AILP.', 'Use only the provided LP-scoped context.', 'Do not mention or infer other LPs, clients, secrets, tokens, or unrelated projects.', 'Return strict JSON only.'].join(' ') },
    { role: 'user', content: JSON.stringify({
      task: ['Act as a professional LP marketer.', 'Create improvement proposals from GA4 metrics and the current HTML/CSS signals.', 'Then review your own proposals and keep only realistic, testable draft changes.', 'Avoid narrow cosmetic-only ideas unless the metrics strongly justify them.', 'Avoid full redesigns unless the current HTML evidence makes them unavoidable.'].join(' '),
      required_json_shape: { score: 'integer 0-100', summary: 'short Japanese summary', diagnosis: { primary_issue: 'traffic|interest|read|action|measurement', reason: 'Japanese reason based on GA4 and HTML/CSS' }, findings: [{ title: 'Japanese title', body: 'evidence from metrics and current LP source', evidence: ['GA4 evidence', 'HTML/CSS evidence'] }], recommendations: [{ title: 'Japanese action', body: 'specific change proposal', priority: 'high|medium|low', target_area: 'hero|cta|offer|proof|faq|measurement|other', target_selector_or_text: 'section/class/text to change if known', expected_effect: 'what should improve', implementation_scope: 'small|medium|large', approved_for_draft: true, review_note: 'self-review result: not too narrow, realistic, testable' }], rejected_ideas: [{ title: 'Japanese rejected idea', reason: 'why it was rejected' }] },
      review_rules: ['Reject ideas that are too narrow, such as changing only color or one word without a metric reason.', 'Reject ideas that are too broad for one draft, such as rebuilding the whole LP.', 'If conversions are zero or suspicious, include measurement verification as a recommendation.', 'Prefer changes that can be implemented in the current HTML/CSS within one draft.', 'Tie each recommendation to a GA4 fact and a current LP source signal.'],
      context,
    }) },
  ]
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', async () => {
  try {
    const request = JSON.parse(input)
    const openai = new OpenAI({ apiKey: request.config.openAiApiKey, timeout: request.config.openAiRequestTimeoutMs })
    if (request.kind !== 'proposal') throw new Error(`Unsupported child kind: ${request.kind}`)
    const response = await openai.chat.completions.create({ model: request.config.openAiModel, messages: proposalMessages(request.payload.context), temperature: 0.2, response_format: { type: 'json_object' } }, { timeout: request.config.openAiRequestTimeoutMs })
    const content = response.choices[0]?.message?.content ?? '{}'
    process.stdout.write(JSON.stringify({ parsed: jsonFromText(content), rawText: content, usage: response.usage ?? {}, model: response.model ?? request.config.openAiModel }))
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.stack || error.message : String(error))
    process.exitCode = 1
  }
})