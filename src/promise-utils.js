export const MAX_NOTE_CHARS = 40_000;
export const MAX_DRAFT_CHARS = 20_000;

export function extractCommitments(note) {
  const marker = /\b(?:I promised|I told|I agreed|I owe|I committed|I need to|I have to|I will|I'll|I’m going to|I'm going to)\b|我(?:答应|承诺|说好|保证)(?![\s，。]*$)/iu;
  const splitMarker = /\b(?:I promised|I told|I agreed|I owe|I committed)\b|我(?:答应|承诺|说好|保证)(?![\s，。]*$)/giu;
  const quotes = [];
  for (const raw of note.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*+]\s+|>\s*|\d+\.\s+)/, '').trim();
    if (!marker.test(line)) continue;
    const matches = [...line.matchAll(splitMarker)];
    if (matches.length < 2) quotes.push(line);
    else {
      for (let index = 0; index < matches.length; index++) {
        const start = index === 0 ? 0 : matches[index].index;
        const end = matches[index + 1]?.index ?? line.length;
        const quote = line.slice(start, end).replace(/[\s,;，；]+$/, '').trim();
        if (quote) quotes.push(quote);
      }
    }
  }
  return [...new Set(quotes)];
}

export function sourceDetails(memory) {
  try {
    const details = JSON.parse(memory.next_action);
    return typeof details.sourceNote === 'string' && typeof details.sourceQuote === 'string' ? details : null;
  } catch { return null; }
}

export function choosePromise(promises, request) {
  if (!promises.length) throw new Error('No promises found in this workspace. Add a note first.');
  if (promises.length === 1) return promises[0];
  const words = text => new Set(text.toLowerCase().match(/[a-z0-9]{3,}|[\p{Script=Han}]{2,}/gu) ?? []);
  const query = words(request);
  const ranked = promises.map(promise => ({ promise, score: [...words(promise.quote)].filter(word => query.has(word)).length }))
    .sort((a, b) => b.score - a.score);
  if (!ranked[0].score || ranked[0].score === ranked[1].score) {
    throw new Error(`Promise is ambiguous. Choose one in the main page: ${ranked.map(item => `${item.promise.id}: ${item.promise.quote}`).join(' | ')}`);
  }
  return ranked[0].promise;
}

export async function recallAll(memory, context) {
  const commitments = [];
  let beforeId = null;
  while (true) {
    const page = await memory.call('recall_commitments', beforeId === null ? { context } : { context, before_id: beforeId });
    if (!page || page.context !== context || !Array.isArray(page.commitments) || page.commitments.length > 20 || !Object.hasOwn(page, 'next_before_id')) {
      throw new Error('Continuity Core returned an invalid commitment page. Check that it supports pagination.');
    }
    let previousId = beforeId;
    for (const item of page.commitments) {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || (previousId !== null && item.id >= previousId) || typeof item.commitment !== 'string' || typeof item.next_action !== 'string') {
        throw new Error('Continuity Core returned an invalid commitment page.');
      }
      previousId = item.id;
    }
    const cursor = page.next_before_id;
    if (cursor !== null && (!page.commitments.length || !Number.isSafeInteger(cursor) || cursor < 1 || cursor !== previousId)) {
      throw new Error('Continuity Core returned an invalid or stalled page cursor.');
    }
    commitments.push(...page.commitments);
    if (cursor === null) return commitments;
    beforeId = cursor;
  }
}
