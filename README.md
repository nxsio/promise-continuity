# Yesterday's promise. Today's reply to edit.

Paste or import your own Markdown note. Promise Continuity finds the promises you wrote, remembers them across sessions, and prepares an editable reply for the one you select. You can save changes to a local file. It never sends the reply. Drafting sends your request and a relevant note excerpt to your configured model provider; optional Tavily search sends your query only when selected.

## Run the local page

Use Node.js 24+ and pnpm. Start [Continuity Core](https://github.com/nxsio/continuity-core) separately with `pnpm start`; keep its SQLite database when you restart it. In this repository, install dependencies once with `pnpm install`, set your model key in the server environment, and run:

```bash
NEBIUS_API_KEY=your-token-factory-key pnpm web
```

Open `http://127.0.0.1:43188`. Add a note such as `我答应 Maya 周一前给她一份项目更新。` or `I promised Alex a summary by Friday.` Select the saved promise, ask for a reply, then edit and save it. Restart both servers and reopen the page to recall the same promises. A missing memory service or model key produces an error, not a completed draft.

The page listens only on loopback. Set `PROMISE_PORT` to change its port, `CONTINUITY_URL` to point to another local MCP endpoint, and `PROMISE_HOME` to choose where notes and drafts are saved. The default MCP endpoint is `http://127.0.0.1:43187/mcp`; drafts and imported notes live under `~/Documents/Promise Continuity/`. Notes are limited to 40,000 characters, and edited drafts to 20,000. Your provider keys remain in server environment variables.

## Model and web sources

The default model endpoint is NVIDIA Nemotron 3 Super on [Nebius Token Factory](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-super-120B.md). For an explicit development run on DeepInfra's deployment of the same NVIDIA model:

```bash
PROMISE_MODEL_PROVIDER=deepinfra DEEPINFRA_API_KEY=your-development-key pnpm web
```

`NEMOTRON_BASE_URL` and `NEMOTRON_MODEL` can override an OpenAI-compatible endpoint and model. The provider defaults and key names are in `src/config.js`. Selecting web search on the page sends only your chosen query to Tavily and requires `TAVILY_API_KEY`. Search is off by default. When it runs, the page shows returned source links; when it fails, no draft is marked complete.

The original note and saved draft stay in local files. Continuity Core stores the promise in local SQLite through its Streamable HTTP MCP server and the official MCP client SDK. The selected note excerpt goes to the configured model provider when you prepare a draft. You review and send the final message yourself.

## Command line

The CLI shares the same capture and draft workflow with the page:

```bash
pnpm start capture /path/to/note.md personal
pnpm start prepare "I promised Alex a summary; prepare my reply" personal --id 1
```

Add `--search "your query"` to explicitly use Tavily. Without a saved matching promise, the CLI stops and asks you to choose an ID. Draft files include the original note, optional web sources, and the model and MCP steps used.

## License

MIT. See [LICENSE](LICENSE).
