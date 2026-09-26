# Yesterday's promise. Today's reply to edit.

Paste a note, choose the promise you meant, and save an editable reply. The local page can watch a notes folder; the Cloudflare page accepts pasted notes and stores each visitor's notes and drafts in a separate workspace. Drafting sends your request and a relevant note excerpt to your configured model provider. Tavily receives your query only when you select web search. You send the final reply yourself.

[Try the live demo](https://promise-continuity.nxsio.com/). It currently uses DeepInfra for the development run. Once a Nebius Token Factory key is issued, its Worker secret and one provider setting switch the same flow to Nebius.

## Run the local page

Use Node.js 24+ and pnpm. Start [Continuity Core](https://github.com/nxsio/continuity-core) separately with `pnpm start`; keep its SQLite database when you restart it. In this repository, install dependencies once with `pnpm install`, set your model key in the server environment, and run:

```bash
PROMISE_WATCH_DIR=/absolute/path/to/notes NEBIUS_API_KEY=your-token-factory-key pnpm web
```

Open `http://127.0.0.1:43188`. Add a note such as `我答应 Maya 周一前给她一份项目更新。` or `I promised Alex a summary by Friday.` A watched folder is scanned once at startup; newly created Markdown files in that folder appear on the open page without pasting or refreshing. Select a saved promise, ask for a reply, then edit and save it. Restart both servers and reopen the page to recall the same promises.

`PROMISE_WATCH_DIR` is optional and must be an absolute path. Leave it unset for manual paste and import. Watching reads only regular `.md` files directly inside the chosen folder; it does not follow symlinks or scan subfolders. Edits and deletions of existing files do not sync to memory. Watching saves promises through the local MCP service and never calls the model or Tavily on its own. The page shows capture errors, including when the memory service is unavailable, and retries when it returns.

The page listens only on loopback. Set `PROMISE_PORT` to change its port, `CONTINUITY_URL` to point to another local MCP endpoint, and `PROMISE_HOME` to choose where notes and drafts are saved. The default MCP endpoint is `http://127.0.0.1:43187/mcp`; drafts and imported notes live under `~/Documents/Promise Continuity/`. Notes are limited to 40,000 characters, and edited drafts to 20,000. Your provider keys remain in server environment variables.

## Model and web sources

The default model endpoint is NVIDIA Nemotron 3 Super on [Nebius Token Factory](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-super-120B.md). For an explicit development run on DeepInfra's deployment of the same NVIDIA model:

```bash
PROMISE_MODEL_PROVIDER=deepinfra DEEPINFRA_API_KEY=your-development-key pnpm web
```

`NEMOTRON_BASE_URL` and `NEMOTRON_MODEL` can override an OpenAI-compatible endpoint and model. The provider defaults and key names are in `src/providers.js`. Selecting web search on the page sends only your chosen query to Tavily and requires `TAVILY_API_KEY`. Search is off by default. When it runs, the page shows returned source links; when it fails, no draft is marked complete.

The original note and saved draft stay in local files. Continuity Core stores the promise in local SQLite through its Streamable HTTP MCP server and the official MCP client SDK. The selected note excerpt goes to the configured model provider when you prepare a draft. You review and send the final message yourself.

## Run the Cloudflare page

The independent `cloudflare/` Worker serves `/` and the same note, promise, and draft `/api` flow. It uses Cloudflare D1 for visitor notes, promise ownership, drafts, and daily model-call reservations. An HttpOnly, SameSite cookie holds a random visitor ID. The browser's cookie is the only way back to that workspace; use **Download your data** before clearing it. The online page does not watch files on a visitor's computer.

The Worker calls a separate [Continuity Core](https://github.com/nxsio/continuity-core) Streamable HTTP MCP service at `CONTINUITY_MCP_URL`. That service must require the same `CORE_SHARED_SECRET` bearer token. A missing or failing MCP service, model, or requested Tavily search returns an error; it never produces a completed draft from a substitute response.

Use Node.js 24+ and pnpm. Install with `pnpm install`. The company D1 database and custom domain are already configured in `cloudflare/wrangler.jsonc`. Apply future migrations before publishing:

```bash
pnpm exec wrangler d1 migrations apply DB --remote --config cloudflare/wrangler.jsonc
```

Set `CONTINUITY_MCP_URL`, `CORE_SHARED_SECRET`, and `DEEPINFRA_API_KEY` as Worker secrets using `pnpm exec wrangler secret put NAME --config cloudflare/wrangler.jsonc`. `CONTINUITY_MCP_URL` must point to the HTTPS `/mcp` endpoint of the deployed Core Worker. The checked-in `PROMISE_MODEL_PROVIDER` value is `deepinfra`; its key stays in a Worker secret. For Nebius Token Factory, set `NEBIUS_API_KEY` as a secret and change only `PROMISE_MODEL_PROVIDER` to `nebius` in `cloudflare/wrangler.jsonc`. The endpoint, model ID, and key selection then come from `src/providers.js`; no source edit is needed. Set `TAVILY_API_KEY` as a secret to enable the optional web search checkbox.

Run `pnpm exec wrangler dev --config cloudflare/wrangler.jsonc` for local development. Apply the same migration with `--local` for its local D1 database. When the Core endpoint and secrets are configured, publish with `pnpm exec wrangler deploy --config cloudflare/wrangler.jsonc`. The Worker reserves every drafting attempt in D1 before calling Tavily or the model. `DAILY_MODEL_LIMIT` and `VISITOR_DAILY_MODEL_LIMIT` in `cloudflare/wrangler.jsonc` default to 100 total and 3 per visitor per UTC day; the global cap still applies if someone clears cookies. The Worker returns a limit error after either cap is reached.

## Command line

The CLI shares the same capture and draft workflow with the page:

```bash
pnpm start capture /path/to/note.md personal
pnpm start prepare "I promised Alex a summary; prepare my reply" personal --id 1
```

Add `--search "your query"` to explicitly use Tavily. Without a saved matching promise, the CLI stops and asks you to choose an ID. Draft files include the original note, optional web sources, and the model and MCP steps used.

## License

MIT. See [LICENSE](LICENSE).
