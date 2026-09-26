# Turn yesterday's promise into a reply you can edit today.

Write a promise in a Markdown note. Promise Continuity remembers it across sessions, finds it when you ask later, and saves a reply draft beside the original note and any web sources you chose to use. You review and send the reply yourself.

## Try it on your own note

Requires Node.js 24+, pnpm, and a running [Continuity Core](https://github.com/nxsio/continuity-core) server. Start that server with `pnpm start` and keep its local SQLite database. This app connects to its Streamable HTTP MCP endpoint at `http://127.0.0.1:43187/mcp` using the official MCP client SDK.

```bash
pnpm install
pnpm start capture /path/to/your-friday-note.md personal
```

A note can contain a line such as `I promised Maya a brief Token Factory update by Monday.` The capture command prints the saved promise ID. Stop and restart Continuity Core, then run a new process:

```bash
NEBIUS_API_KEY=your-token-factory-key pnpm start prepare "I promised Maya an update; prepare my reply" personal
```

The command shows the note it found, whether web search ran, the model response time and token usage, and the path to an editable Markdown draft. Drafts go to `~/Documents/Promise Continuity/` by default. Set `PROMISE_HOME` to choose another local directory. Nothing sends a message.

## Choose current web information

Web search runs only when you request it:

```bash
NEBIUS_API_KEY=your-token-factory-key TAVILY_API_KEY=your-tavily-key \
  pnpm start prepare "I promised Maya an update; prepare my reply" personal \
  --search "Nebius Token Factory latest model updates"
```

Tavily source links appear in a separate section of the saved draft. Without `--search`, the draft says web search was off. If you request search without `TAVILY_API_KEY`, the command stops with an error.

## Model endpoints

The default is Nemotron 3 Super on Nebius Token Factory, using the [Nebius cookbook endpoint and model ID](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-super-120B.md). For development with DeepInfra's deployment of the same NVIDIA model, set `PROMISE_MODEL_PROVIDER=deepinfra` and `DEEPINFRA_API_KEY`. Endpoint, model ID, and environment key names live together in `src/config.js`; `NEMOTRON_BASE_URL` and `NEMOTRON_MODEL` allow an OpenAI-compatible endpoint override.

The note and saved draft stay in local files; Continuity Core stores the promise in local SQLite. The selected note excerpt is sent to the chosen model provider to write the draft. A Tavily search sends your chosen query only when you pass `--search`. The draft remains yours to edit and send.

## License

MIT. See [LICENSE](LICENSE).
