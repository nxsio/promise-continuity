import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export async function withCore(env, work) {
  if (!env.CONTINUITY_MCP_URL || !env.CORE_SHARED_SECRET) {
    throw new Error('Cloud memory is not configured. Set CONTINUITY_MCP_URL and CORE_SHARED_SECRET.');
  }
  const url = new URL(env.CONTINUITY_MCP_URL);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('CONTINUITY_MCP_URL must use HTTPS.');
  }
  const client = new Client({ name: 'promise-continuity-cloud', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${env.CORE_SHARED_SECRET}` } }
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map(tool => tool.name);
    for (const name of ['remember_commitment', 'recall_commitments', 'resume_commitment']) {
      if (!tools.includes(name)) throw new Error(`Continuity Core tool missing: ${name}`);
    }
    return await work({
      protocol: client.getNegotiatedProtocolVersion(),
      call: async (name, args) => {
        const response = await client.callTool({ name, arguments: args });
        if (response.isError) throw new Error(`${name}: ${response.content?.map(item => item.text ?? '').join(' ')}`);
        if (!response.structuredContent) throw new Error(`${name} returned no structured result`);
        return response.structuredContent;
      }
    });
  } finally {
    await client.close();
  }
}
