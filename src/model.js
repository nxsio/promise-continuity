export class ModelRateLimitError extends Error {
  constructor() { super('The model is busy. No draft was saved. Please try again.'); }
}

function retryDelay(header) {
  if (!header) return 750;
  const seconds = Number(header);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(milliseconds) ? Math.min(2_000, Math.max(500, milliseconds)) : 750;
}

export async function complete(modelConfig, messages, maxTokens = 900) {
  const started = performance.now();
  const requestBody = JSON.stringify({ model: modelConfig.model, messages, max_tokens: maxTokens, ...modelConfig.requestOptions });
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = 90_000 - (performance.now() - started);
    if (remaining <= 0) throw new Error('The model took too long. No draft was saved. Please try again.');
    response = await fetch(`${modelConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${modelConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: requestBody,
      signal: AbortSignal.timeout(Math.ceil(remaining))
    });
    if (response.status !== 429) break;
    await response.body?.cancel();
    if (attempt === 1) throw new ModelRateLimitError();
    const delay = retryDelay(response.headers.get('Retry-After'));
    if (90_000 - (performance.now() - started) <= delay) throw new ModelRateLimitError();
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Model HTTP ${response.status}. No draft was saved.`);
  }
  let data;
  try { data = JSON.parse(await response.text()); }
  catch { throw new Error('The model returned an unreadable reply. No draft was saved. Please try again.'); }
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
