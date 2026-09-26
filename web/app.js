const $ = id => document.getElementById(id);
let promises = [];
let selectedId = null;
let currentDraft = null;
let renderedPromises = '';
let refreshNumber = 0;
let watchDirectory = null;

function status(id, message, error = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('error', error);
}
async function jsonResponse(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
function renderPromises() {
  $('promise-count').textContent = String(promises.length);
  $('list-empty').hidden = promises.length > 0;
  const signature = JSON.stringify(promises.map(item => [item.id, item.quote, item.sourceFile]));
  if (signature !== renderedPromises) {
    $('promises').replaceChildren();
    renderedPromises = signature;
    for (const item of promises) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = String(item.id);
      button.className = 'promise';
      const quote = document.createElement('span'); quote.className = 'quote'; quote.textContent = item.quote;
      const source = document.createElement('span'); source.className = 'source'; source.textContent = `From ${item.sourceFile} · Memory #${item.id}`;
      button.append(quote, source);
      button.addEventListener('click', () => { selectedId = item.id; $('selected').textContent = item.quote; $('prepare').disabled = false; renderPromises(); });
      $('promises').append(button);
    }
  }
  for (const button of $('promises').children) {
    const active = Number(button.dataset.id) === selectedId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}
async function refresh(quiet = false) {
  const requestNumber = ++refreshNumber;
  if (!quiet) status('capture-status', 'Loading saved promises…');
  try {
    const data = await jsonResponse(await fetch('/api/promises'));
    if (requestNumber !== refreshNumber) return;
    promises = data.promises;
    renderPromises();
    if (!quiet) status('capture-status', `Connected to local memory · MCP ${data.protocol}`);
  } catch (error) {
    status(quiet ? 'watch-status' : 'capture-status', quiet ? `Watching ${watchDirectory} · ${error.message}` : error.message, true);
  }
}
function watchStatus(message, error = false) {
  status('watch-status', message, error);
}
const events = new EventSource('/api/events');
let watching = false;
events.addEventListener('mode', event => {
  const mode = JSON.parse(event.data);
  watchDirectory = mode.directory;
  if (mode.mode === 'manual') {
    watchStatus('Manual mode. Paste or import notes here.');
    events.close();
  } else if (mode.mode === 'error') {
    watchStatus(`${mode.directory}: ${mode.error}`, true);
    events.close();
  } else {
    watching = true;
    watchStatus(mode.error
      ? `Watching ${mode.directory} · ${mode.error}`
      : `Watching ${mode.directory}. New .md files are remembered; edits and deletions do not sync.`, Boolean(mode.error));
  }
});
events.addEventListener('captured', async event => {
  const result = JSON.parse(event.data);
  watchStatus(`Watching ${watchDirectory} · Remembered ${result.saved.length} promise${result.saved.length === 1 ? '' : 's'} from ${result.file}.`);
  await refresh(true);
});
events.addEventListener('watch_error', event => watchStatus(`Watching ${watchDirectory} · ${JSON.parse(event.data).message}`, true));
events.onerror = () => watchStatus(watching
  ? `Watching ${watchDirectory} · Live updates disconnected. Reconnecting…`
  : 'Could not read note source. Reconnecting…', true);
$('note').addEventListener('input', () => { $('note-count').textContent = `${$('note').value.length.toLocaleString()} / 40,000`; });
$('note-file').addEventListener('change', async () => {
  const file = $('note-file').files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.md')) return status('capture-status', 'Choose a Markdown .md file.', true);
  if (file.size > 160000) return status('capture-status', 'Choose a note under 40,000 characters.', true);
  $('note').value = await file.text();
  $('note').dispatchEvent(new Event('input'));
  status('capture-status', `Imported ${file.name}. Save it to memory when ready.`);
});
$('capture').addEventListener('click', async () => {
  $('capture').disabled = true;
  status('capture-status', 'Saving note and finding promises…');
  try {
    const data = await jsonResponse(await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('note').value }) }));
    await refresh();
    status('capture-status', `${data.saved.length} promise${data.saved.length === 1 ? '' : 's'} found · saved through MCP ${data.protocol}.`);
  } catch (error) { status('capture-status', error.message, true); }
  finally { $('capture').disabled = false; }
});
$('search').addEventListener('change', () => { $('search-fields').hidden = !$('search').checked; });
$('prepare').addEventListener('click', async () => {
  if (!selectedId) return status('draft-status', 'Select a promise first.', true);
  $('prepare').disabled = true;
  $('draft-result').hidden = true;
  currentDraft = null;
  status('draft-status', 'Starting…');
  try {
    const response = await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedId, request: $('request').value, searchQuery: $('search').checked ? $('search-query').value : null }) });
    if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let complete = false;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let lineEnd;
      while ((lineEnd = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, lineEnd); buffer = buffer.slice(lineEnd + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'stage') status('draft-status', `${event.message}…`);
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'result') { showDraft(event.result); complete = true; }
      }
      if (done) break;
    }
    if (!complete) throw new Error('Draft request ended without a result.');
  } catch (error) { status('draft-status', error.message, true); $('draft-result').hidden = true; }
  finally { $('prepare').disabled = false; }
});
function showDraft(result) {
  currentDraft = result;
  $('draft-text').value = result.text;
  $('draft-path').textContent = result.filePath;
  $('source-path').textContent = result.sourceNote;
  $('model-meta').textContent = `${result.model.provider} · HTTP ${result.model.status} · ${result.model.elapsedMs} ms`;
  $('sources').replaceChildren();
  $('sources-wrap').hidden = !result.web;
  if (result.web) for (const source of result.web.sources) {
    const item = document.createElement('li'); const link = document.createElement('a');
    link.href = source.url; link.textContent = source.title; link.target = '_blank'; link.rel = 'noopener noreferrer';
    item.append(link); $('sources').append(item);
  }
  $('draft-result').hidden = false;
  status('draft-status', `Draft saved locally · ${result.model.tokens.input ?? '?'} input / ${result.model.tokens.output ?? '?'} output tokens${result.web ? ` · ${result.web.sources.length} Tavily sources` : ' · web search off'}.`);
  status('save-status', 'Edit the text above, then save your changes. No reply is sent for you.');
}
$('save').addEventListener('click', async () => {
  if (!currentDraft) return;
  $('save').disabled = true;
  status('save-status', 'Saving your changes…');
  try {
    const data = await jsonResponse(await fetch(`/api/drafts/${encodeURIComponent(currentDraft.name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('draft-text').value }) }));
    status('save-status', `Saved to ${data.filePath}. No reply was sent.`);
  } catch (error) { status('save-status', error.message, true); }
  finally { $('save').disabled = false; }
});
refresh();
