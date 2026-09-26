export async function searchTavily(query, key) {
  if (!key) throw new Error('TAVILY_API_KEY is required when web search is requested');
  const started = performance.now();
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 3,
      include_answer: false,
      include_raw_content: false,
      include_published_date: true,
      include_usage: true
    }),
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Tavily HTTP ${response.status}: ${body.slice(0, 1000)}`);
  const data = JSON.parse(body);
  if (!Array.isArray(data.results)) throw new Error('Tavily returned no results array');
  return {
    query: data.query ?? query,
    sources: data.results.filter(item => {
      try { return new URL(item.url).protocol === 'https:'; } catch { return false; }
    }).map(item => ({
      title: item.title ?? item.url,
      url: item.url,
      content: item.content ?? '',
      publishedDate: item.published_date ?? null
    })),
    requestId: data.request_id ?? null,
    credits: data.usage?.credits ?? null,
    elapsedMs: Math.round(performance.now() - started)
  };
}
