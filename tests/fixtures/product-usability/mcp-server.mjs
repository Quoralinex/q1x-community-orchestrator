import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const server = new McpServer({ name: 'q1x-phase12-product-mcp', version: '1.0.0' });
server.registerTool(
  'echo',
  {
    description: 'Echo deterministic Phase 12 product text',
    inputSchema: z.object({ text: z.string() }),
  },
  async ({ text }) => ({
    content: [{ type: 'text', text }],
    structuredContent: { text },
  }),
);

await server.connect(new StdioServerTransport());
