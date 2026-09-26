const $ = id => document.getElementById(id);
let promises = [];
let selectedId = null;
let currentDraft = null;

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
  $('promises').replaceChildren();
  $('promise-count').textContent = String(promises.length);
  $('list-empty').hidden = promises.length > 0;
  for (const item of promises) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `promise${selectedId === item.id ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(selectedId === item.id));
    const quote = document.createElement('span'); quote.className = 'quote'; quote.textContent = item.quote;
    const source = document.createElement('span'); source.className = 'source'; source.textContent = `From ${item.sourceFile} · Memory #${item.id}`;
    button.append(quote, source);
    button.addEventListener('click', () => { selectedId = item.id; $('selected').textContent = item.quote; $('prepare').disabled = false; renderPromises(); });
    $('promises').append(button);
  }
}
async function refresh() {
  status('capture-status', 'Loading saved promises…');
  try {
    const data = await jsonResponse(await fetch('/api/promises'));
    promises = data.promises;
    if (selectedId && !promises.some(item => item.id === selectedId)) selectedId = null;
    renderPromises();
    status('capture-status', `Connected to local memory · MCP ${data.protocol}`);
  } catch (error) { status('capture-status', error.message, true); }
}
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
  status('save-status', 'Edit the text above, then save your changes. Nothing is sent.');
}
$('save').addEventListener('click', async () => {
  if (!currentDraft) return;
  $('save').disabled = true;
  status('save-status', 'Saving your changes…');
  try {
    const data = await jsonResponse(await fetch(`/api/drafts/${encodeURIComponent(currentDraft.name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('draft-text').value }) }));
    status('save-status', `Saved to ${data.filePath}. Nothing was sent.`);
  } catch (error) { status('save-status', error.message, true); }
  finally { $('save').disabled = false; }
});
refresh();
