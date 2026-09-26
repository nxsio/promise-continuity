export const MAX_NOTE_CHARS = 40_000;
export const MAX_DRAFT_CHARS = 20_000;

export function extractCommitments(note) {
  return [...new Set(note.split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*+]\s+|>\s*|\d+\.\s+)/, '').trim())
    .filter(line => /\b(?:I promised|I told|I agreed|I owe|I committed|I need to|I have to|I will|I'll|I’m going to|I'm going to)\b/i.test(line) || /我(?:答应|承诺|说好|保证)(?![\s，。]*$)/u.test(line)))];
}

export function sourceDetails(memory) {
  try {
    const details = JSON.parse(memory.next_action);
    return typeof details.sourceNote === 'string' && typeof details.sourceQuote === 'string' ? details : null;
  } catch { return null; }
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
