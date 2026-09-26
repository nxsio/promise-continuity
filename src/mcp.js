import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export async function withMemory(url, work) {
  const client = new Client({ name: 'promise-continuity', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url));
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
        if (response.isError) {
          throw new Error(`${name}: ${response.content?.map(item => item.text ?? '').join(' ')}`);
        }
        if (!response.structuredContent) throw new Error(`${name} returned no structured result`);
        return response.structuredContent;
      }
    });
  } finally {
    await client.close();
  }
}
