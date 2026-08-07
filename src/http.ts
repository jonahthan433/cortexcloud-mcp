// CortexCloud MCP over Streamable HTTP for the remote lifecycle / MCP Registry.
// Stateful per-session transports keyed by mcp-session-id (canonical MCP pattern).
import { createServer } from './index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

const PORT = Number(process.env.PORT ?? 3000);
const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

const app = express();
app.use(express.json({ limit: '2mb' }));

async function ensure(sid: string | undefined): Promise<{ transport: StreamableHTTPServerTransport }> {
  const existing = sid ? sessions.get(sid) : undefined;
  if (existing) return existing;
  const sessionId = crypto.randomUUID(); // pin BEFORE construction: sessionId is set lazily by the SDK
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => sessionId });
  const entry = { transport };
  sessions.set(sessionId, entry);
  // Remove finished sessions so the Map doesn't leak across connections. ponytail:
  // a single unbound Map grows with every session; cap/expire if agent load spikes.
  transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId as string); };
  await createServer().connect(transport); // fresh McpServer per session — connect() is one-shot
  return entry;
}

app.get('/mcp', async (req, res) => {
  const { transport } = await ensure(undefined);
  await transport.handleRequest(req as never, res as never);
});

app.post('/mcp', async (req, res) => {
  const sid = req.headers['mcp-session-id']?.toString();
  const { transport } = await ensure(sid);
  await transport.handleRequest(req as never, res as never, req.body);
});

app.delete('/mcp', async (req, res) => {
  const sid = req.headers['mcp-session-id']?.toString();
  const entry = sid ? sessions.get(sid) : undefined;
  await entry?.transport.close();
  if (sid) sessions.delete(sid);
  res.status(204).end();
});

app.listen(PORT, () => console.log(`CortexCloud MCP -> http://0.0.0.0:${PORT}/mcp`));