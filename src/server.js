import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mcpConfig } from './config.js';
import { captureNote, extractCommitments, listPromises, prepareDraft, saveEditedDraft, MAX_NOTE_CHARS } from './workflow.js';
import { startNoteWatch } from './watch.js';

const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/alexa.html', ['alexa.html', 'text/html; charset=utf-8']], ['/styles.css', ['styles.css', 'text/css; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/alexa.js', ['alexa.js', 'text/javascript; charset=utf-8']]]);
const port = Number(process.env.PROMISE_PORT ?? 43188);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PROMISE_PORT must be a valid port.');
const subscribers = new Set();
const watchEvent = (type, data) => {
  const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const response of subscribers) response.write(message);
};
const noteWatch = startNoteWatch(process.env.PROMISE_WATCH_DIR, watchEvent);

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function errorMessage(error) {
  let message = error instanceof Error ? error.message : 'Unexpected error.';
  for (const key of [process.env.NEBIUS_API_KEY, process.env.DEEPINFRA_API_KEY, process.env.TAVILY_API_KEY]) {
    if (key) message = message.replaceAll(key, '[redacted]');
  }
  return message;
}

async function bodyJson(req, limit = 200_000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Send application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON.'); }
}

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? '';
  const origin = req.headers.origin;
  if (!new RegExp(`^(?:127\\.0\\.0\\.1|localhost):${port}$`).test(host) || (origin && !new RegExp(`^http://(?:127\\.0\\.0\\.1|localhost):${port}$`).test(origin))) {
    return send(res, 403, { error: 'Local page requests only.' });
  }
  const path = new URL(req.url, `http://${host}`).pathname;
  try {
    if (req.method === 'GET' && path === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      subscribers.add(res);
      res.write(`event: mode\ndata: ${JSON.stringify(noteWatch.snapshot())}\n\n`);
      res.on('close', () => subscribers.delete(res));
      return;
    }
    if (req.method === 'GET' && assets.has(path)) {
      const [file, type] = assets.get(path);
      const content = await readFile(join(webDir, file));
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'" });
      return res.end(content);
    }
    if (req.method === 'GET' && path === '/api/promises') return send(res, 200, await listPromises());
    if (req.method === 'POST' && path === '/api/notes') {
      const data = await bodyJson(req);
      if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > MAX_NOTE_CHARS) throw new Error('Note must be between 1 and 40,000 characters.');
      if (!extractCommitments(data.text).length) throw new Error('No promise sentence found. Try “I promised…” or “我答应…”.');
      const { outputDir } = mcpConfig();
      const notesDir = join(outputDir, 'notes');
      await mkdir(notesDir, { recursive: true });
      const digest = createHash('sha256').update(data.text).digest('hex').slice(0, 24);
      const sourceNote = join(notesDir, `note-${digest}.md`);
      try { await writeFile(sourceNote, data.text, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      return send(res, 200, await captureNote(sourceNote));
    }
    if (req.method === 'POST' && (path === '/api/drafts' || path === '/api/alexa/drafts')) {
      const data = await bodyJson(req, 16_384);
      if (path === '/api/drafts' && (!Number.isInteger(data.id) || data.id < 1)) throw new Error('Select a saved promise.');
      if (typeof data.request !== 'string' || !data.request.trim() || data.request.length > 2_000) throw new Error('Request must be between 1 and 2,000 characters.');
      if (data.searchQuery != null && (typeof data.searchQuery !== 'string' || !data.searchQuery.trim() || data.searchQuery.length > 500)) throw new Error('Search query must be between 1 and 500 characters.');
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      const event = payload => res.write(`${JSON.stringify(payload)}\n`);
      try {
        const result = await prepareDraft({ id: path === '/api/alexa/drafts' ? null : data.id, request: data.request, searchQuery: data.searchQuery ?? null, onStage: message => event({ type: 'stage', message }) });
        event({ type: 'result', result });
      } catch (error) { event({ type: 'error', message: errorMessage(error) }); }
      return res.end();
    }
    if (req.method === 'PUT' && path.startsWith('/api/drafts/')) {
      const name = decodeURIComponent(path.slice('/api/drafts/'.length));
      const data = await bodyJson(req, 65_536);
      return send(res, 200, await saveEditedDraft(name, data.text));
    }
    send(res, 404, { error: 'Not found.' });
  } catch (error) {
    send(res, /too large|over 40,000|between|No promise|Invalid|Select|Choose|Send application/.test(errorMessage(error)) ? 400 : 502, { error: errorMessage(error) });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Promise Continuity: http://127.0.0.1:${port}`));
server.on('close', () => noteWatch.close());
