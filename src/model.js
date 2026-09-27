export async function complete(modelConfig, messages, maxTokens = 900) {
  const started = performance.now();
  const response = await fetch(`${modelConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${modelConfig.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: modelConfig.model, messages, max_tokens: maxTokens, ...modelConfig.requestOptions }),
    signal: AbortSignal.timeout(90_000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Model HTTP ${response.status}. No draft was saved.`);
  const data = JSON.parse(body);
  const choice = data.choices?.[0];
  const answer = choice?.message?.content;
  if (choice?.finish_reason !== 'stop') throw new Error('The reply was incomplete. No draft was saved. Please try again.');
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('The model returned no reply. No draft was saved. Please try again.');
  const text = answer.trim();
  if (/<\/?think\b|\b(?:the user wants|the user asked|first,? i need to|possible reply:|final draft should|check for placeholders|let'?s break this down)\b/i.test(text)) {
    throw new Error('The model returned notes instead of a reply. No draft was saved. Please try again.');
  }
  return {
    text,
    status: response.status,
    model: data.model ?? modelConfig.model,
    tokens: {
      input: data.usage?.prompt_tokens ?? null,
      output: data.usage?.completion_tokens ?? null,
      total: data.usage?.total_tokens ?? null
    },
    estimatedCostUsd: data.usage?.estimated_cost ?? null,
    elapsedMs: Math.round(performance.now() - started)
  };
}
