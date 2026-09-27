const $ = id => document.getElementById(id);

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

async function refreshPromises() {
  const data = await jsonResponse(await fetch('/api/promises'));
  $('promise-count').textContent = String(data.promises.length);
  $('list-empty').hidden = data.promises.length > 0;
  $('promises').replaceChildren();
  for (const promise of data.promises) {
    const quote = document.createElement('p');
    quote.className = 'promise';
    quote.textContent = promise.quote;
    $('promises').append(quote);
  }
}

$('capture').addEventListener('click', async () => {
  $('capture').disabled = true;
  status('capture-status', 'Saving your note…');
  try {
    const data = await jsonResponse(await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('note').value })
    }));
    await refreshPromises();
    status('capture-status', `${data.saved.length} promise${data.saved.length === 1 ? '' : 's'} saved through MCP ${data.protocol}. Return later and ask to continue.`);
  } catch (error) { status('capture-status', error.message, true); }
  finally { $('capture').disabled = false; }
});

$('prepare').addEventListener('click', async () => {
  $('prepare').disabled = true;
  $('draft-result').hidden = true;
  status('draft-status', 'Finding your promise…');
  try {
    const response = await fetch('/api/alexa/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: $('request').value })
    });
    if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'stage') status('draft-status', `${event.message}…`);
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'result') result = event.result;
      }
      if (done) break;
    }
    if (!result) throw new Error('Draft request ended without a result.');
    $('recovered').textContent = result.quote;
    $('draft-text').value = result.text;
    $('model-meta').textContent = `${result.model.provider} · MCP ${result.protocol}`;
    $('save').dataset.name = result.name;
    $('draft-result').hidden = false;
    status('draft-status', 'Your promise was recovered and an editable reply was saved.');
    status('save-status', 'Review the reply, then save your changes. Nothing was sent.');
  } catch (error) { status('draft-status', error.message, true); }
  finally { $('prepare').disabled = false; }
});

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  status('save-status', 'Saving your changes…');
  try {
    await jsonResponse(await fetch(`/api/drafts/${encodeURIComponent($('save').dataset.name)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('draft-text').value })
    }));
    status('save-status', 'Saved. No reply was sent.');
  } catch (error) { status('save-status', error.message, true); }
  finally { $('save').disabled = false; }
});

refreshPromises().catch(error => status('capture-status', error.message, true));
