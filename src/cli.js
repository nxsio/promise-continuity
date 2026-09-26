import { captureNote, prepareDraft } from './workflow.js';

const usage = `Usage:
  pnpm start capture <note.md> [context]
  pnpm start prepare <what you promised> [context] [--id N] [--search "query"]`;

function options(args) {
  const positionals = [];
  let id = null;
  let search = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id') {
      id = Number(args[++i]);
      if (!Number.isInteger(id) || id <= 0) throw new Error('--id needs a positive integer');
    } else if (args[i] === '--search') {
      search = args[++i]?.trim();
      if (!search) throw new Error('--search needs a query');
    } else if (args[i].startsWith('--')) throw new Error(`Unknown option: ${args[i]}`);
    else positionals.push(args[i]);
  }
  return { positionals, id, search };
}

try {
  const [command, ...args] = process.argv.slice(2);
  const { positionals, id, search } = options(args);
  if (command === 'capture') {
    if (id || search || !positionals[0] || positionals.length > 2) throw new Error(usage);
    const result = await captureNote(positionals[0], positionals[1] ?? 'personal');
    for (const item of result.saved) console.log(`${item.alreadySaved ? 'Already saved' : 'Saved'} promise ${item.id}: ${item.quote}`);
    console.log(`Memory: MCP ${result.protocol} over HTTP.`);
  } else if (command === 'prepare') {
    if (!positionals[0] || positionals.length > 2) throw new Error(usage);
    const result = await prepareDraft({ request: positionals[0], context: positionals[1] ?? 'personal', id, searchQuery: search, onStage: message => console.log(`${message}...`) });
    console.log(`Original note: ${result.sourceNote}`);
    console.log(`Promise: ${result.quote}`);
    console.log(result.web ? `Web: ${result.web.sources.length} Tavily source(s).` : 'Web: off.');
    console.log(`Saved draft: ${result.filePath}`);
    console.log(`Model: ${result.model.name}; HTTP ${result.model.status}; ${result.model.elapsedMs} ms; tokens ${result.model.tokens.input ?? '?'} in / ${result.model.tokens.output ?? '?'} out.`);
  } else throw new Error(usage);
} catch (error) {
  console.error(`Stopped: ${error.message}`);
  process.exitCode = 1;
}
