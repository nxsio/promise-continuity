export const providers = {
  nebius: {
    baseUrl: 'https://api.tokenfactory.us-central1.nebius.com/v1',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    keyName: 'NEBIUS_API_KEY'
  },
  deepinfra: {
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    model: 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B',
    keyName: 'DEEPINFRA_API_KEY',
    requestOptions: { chat_template_kwargs: { enable_thinking: false } }
  }
};

export function modelConfig(env) {
  const provider = env.PROMISE_MODEL_PROVIDER ?? 'nebius';
  const selected = providers[provider];
  if (!selected) throw new Error(`Unknown model provider: ${provider}`);
  const apiKey = env[selected.keyName];
  if (!apiKey) throw new Error(`${selected.keyName} is required for ${provider}`);
  return {
    provider,
    apiKey,
    baseUrl: (env.NEMOTRON_BASE_URL ?? selected.baseUrl).replace(/\/+$/, ''),
    model: env.NEMOTRON_MODEL ?? selected.model,
    requestOptions: selected.requestOptions ?? {},
    tavilyKey: env.TAVILY_API_KEY ?? null
  };
}
