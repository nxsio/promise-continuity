const $ = id => document.getElementById(id);
let promises = [];
let selectedId = null;
let currentDraft = null;
let renderedPromises = '';

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
  const signature = JSON.stringify(promises.map(item => [item.id, item.quote]));
  if (signature !== renderedPromises) {
    renderedPromises = signature;
    $('promises').replaceChildren();
    for (const item of promises) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = String(item.id);
      button.className = 'promise';
      const quote = document.createElement('span');
      quote.className = 'quote';
      quote.textContent = item.quote;
      button.append(quote);
      button.addEventListener('click', () => {
        selectedId = item.id;
        $('selected').textContent = item.quote;
        $('prepare').disabled = false;
        renderPromises();
      });
      $('promises').append(button);
    }
  }
  for (const button of $('promises').children) {
    const active = Number(button.dataset.id) === selectedId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

async function refreshPromises() {
  const data = await jsonResponse(await fetch('/api/promises'));
  promises = data.promises;
  if (selectedId && !promises.some(item => item.id === selectedId)) {
    selectedId = null;
    $('selected').textContent = 'Choose a promise from your saved list.';
    $('prepare').disabled = true;
  }
  if (!selectedId && promises.length === 1) {
    selectedId = promises[0].id;
    $('selected').textContent = promises[0].quote;
    $('prepare').disabled = false;
  }
  renderPromises();
}

async function refreshDrafts() {
  const data = await jsonResponse(await fetch('/api/drafts'));
  $('draft-count').textContent = String(data.drafts.length);
  $('drafts-empty').hidden = data.drafts.length > 0;
  $('drafts').replaceChildren();
  for (const draft of data.drafts) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'promise';
    const preview = document.createElement('span');
    preview.className = 'quote';
    preview.textContent = draft.text.slice(0, 130);
    button.append(preview);
    button.addEventListener('click', async () => {
      try {
        const saved = await jsonResponse(await fetch(`/api/drafts/${encodeURIComponent(draft.name)}`));
        showDraft(saved, true);
      } catch (error) { status('draft-status', error.message, true); }
    });
    $('drafts').append(button);
  }
}

$('note').addEventListener('input', () => {
  $('note-count').textContent = `${$('note').value.length.toLocaleString()} / 40,000`;
});
$('note-file').addEventListener('change', async () => {
  const file = $('note-file').files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.md')) return status('capture-status', 'Choose a Markdown .md file.', true);
  if (file.size > 160000) return status('capture-status', 'Choose a note under 40,000 characters.', true);
  $('note').value = await file.text();
  $('note').dispatchEvent(new Event('input'));
  status('capture-status', `Loaded ${file.name}. Save it when ready.`);
});
$('capture').addEventListener('click', async () => {
  $('capture').disabled = true;
  status('capture-status', 'Saving your note…');
  try {
    const data = await jsonResponse(await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('note').value })
    }));
    await refreshPromises();
    if (data.saved.length === 1) {
      const saved = promises.find(item => item.id === data.saved[0].id);
      if (saved) {
        selectedId = saved.id;
        $('selected').textContent = saved.quote;
        $('prepare').disabled = false;
        renderPromises();
        if (window.matchMedia('(max-width: 800px)').matches) {
          $('draft-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
    status('capture-status', `${data.saved.length} promise${data.saved.length === 1 ? '' : 's'} saved.`);
  } catch (error) { status('capture-status', error.message, true); }
  finally { $('capture').disabled = false; }
});
$('search').addEventListener('change', () => { $('search-fields').hidden = !$('search').checked; });
$('prepare').addEventListener('click', async () => {
  if (!selectedId) return status('draft-status', 'Choose a promise first.', true);
  $('prepare').disabled = true;
  $('draft-result').hidden = true;
  currentDraft = null;
  status('draft-status', 'Starting…');
  try {
    const response = await fetch('/api/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedId, request: $('request').value, searchQuery: $('search').checked ? $('search-query').value : null })
    });
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
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'stage') status('draft-status', `${event.message}…`);
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'result') { showDraft(event.result); complete = true; }
      }
      if (done) break;
    }
    if (!complete) throw new Error('Draft request ended without a result.');
    await refreshDrafts();
  } catch (error) { status('draft-status', error.message, true); $('draft-result').hidden = true; }
  finally { $('prepare').disabled = false; }
});

function showDraft(result, reopened = false) {
  currentDraft = result;
  $('draft-text').value = result.text;
  $('model-meta').textContent = result.model?.provider ?? '';
  $('sources').replaceChildren();
  $('sources-wrap').hidden = !result.web;
  if (result.web) for (const source of result.web.sources) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.title;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link);
    $('sources').append(item);
  }
  $('draft-result').hidden = false;
  status('draft-status', reopened ? 'Saved draft reopened.' : 'Draft saved. Edit it below.');
  status('save-status', 'Your changes stay here when you save. No reply is sent.');
}

$('save').addEventListener('click', async () => {
  if (!currentDraft) return;
  $('save').disabled = true;
  status('save-status', 'Saving your changes…');
  try {
    await jsonResponse(await fetch(`/api/drafts/${encodeURIComponent(currentDraft.name)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('draft-text').value })
    }));
    status('save-status', 'Saved. Reopen it from Saved drafts after a refresh.');
    await refreshDrafts();
  } catch (error) { status('save-status', error.message, true); }
  finally { $('save').disabled = false; }
});

$('copy-reply').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('draft-text').value);
    status('save-status', 'Reply copied. Review it in your message app before sending.');
  } catch {
    status('save-status', 'Copy unavailable. Select the reply above instead.', true);
  }
});

refreshPromises().catch(error => status('capture-status', error.message, true));
refreshDrafts().catch(error => status('draft-status', error.message, true));
