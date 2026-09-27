export async function complete(modelConfig, messages, maxTokens = 900) {
  const started = performance.now();
  const response = await fetch(`${modelConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${modelConfig.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: modelConfig.model, messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(90_000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Model HTTP ${response.status}: ${body.slice(0, 1000)}`);
  const data = JSON.parse(body);
  const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Model returned no answer text');
  return {
    text: answer.trim(),
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
