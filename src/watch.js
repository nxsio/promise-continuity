import { watch, lstatSync } from 'node:fs';
import { readdir, lstat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { captureNote, MAX_NOTE_CHARS } from './workflow.js';

const RETRY_MS = 5_000;
const SETTLE_MS = 180;
const MAX_NOTE_BYTES = MAX_NOTE_CHARS * 4 + 4_096;

export function startNoteWatch(rawDirectory, notify) {
  const directory = rawDirectory ? resolve(rawDirectory) : null;
  const state = { mode: directory ? 'watching' : 'manual', directory, error: null };
  const known = new Set();
  const failures = new Map();
  let watcher;
  let timer;
  let scanning = false;
  let rescan = false;
  let closed = false;

  const snapshot = () => ({ ...state });
  const announceError = (file, error) => {
    const message = `${file}: ${error.message}`;
    state.error = message;
    if (failures.get(file) !== message) {
      failures.set(file, message);
      notify('watch_error', { message });
    }
  };
  const syncError = () => {
    const next = [...failures.values()].at(-1) ?? null;
    if (state.error !== next) {
      state.error = next;
      if (!next) notify('mode', snapshot());
    }
  };

  async function scan() {
    if (closed || state.mode !== 'watching') return;
    if (scanning) { rescan = true; return; }
    scanning = true;
    let retry = false;
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const present = new Set(entries.map(entry => entry.name));
      for (const name of known) if (!present.has(name)) known.delete(name);
      for (const name of failures.keys()) if (!present.has(name)) failures.delete(name);
      syncError();
      for (const entry of entries) {
        const name = entry.name;
        if (!name.toLowerCase().endsWith('.md') || !entry.isFile() || known.has(name)) continue;
        const path = join(directory, name);
        try {
          const info = await lstat(path);
          if (!info.isFile() || info.isSymbolicLink()) continue;
          if (info.size > MAX_NOTE_BYTES) throw new Error('Note is over 40,000 characters; choose a shorter file.');
          const result = await captureNote(path);
          known.add(name);
          failures.delete(name);
          syncError();
          const added = result.saved.filter(item => !item.alreadySaved);
          if (added.length) notify('captured', { file: name, saved: added, protocol: result.protocol });
        } catch (error) {
          if (error.message.startsWith('No promise sentence found')) {
            known.add(name);
            failures.delete(name);
            syncError();
            continue;
          }
          announceError(name, error);
          if (error.message.startsWith('Note is over 40,000 characters') || error.message.startsWith('The note is over 40,000 characters')) known.add(name);
          else retry = true;
        }
      }
    } catch (error) {
      announceError(basename(directory), error);
      retry = true;
    } finally {
      scanning = false;
      if (rescan) { rescan = false; schedule(SETTLE_MS); }
      else if (retry) schedule(RETRY_MS);
    }
  }

  function schedule(delay = SETTLE_MS) {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void scan(); }, delay);
  }

  if (directory) {
    try {
      if (!isAbsolute(rawDirectory)) throw new Error('PROMISE_WATCH_DIR must be an absolute path.');
      const info = lstatSync(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PROMISE_WATCH_DIR must be a regular local directory.');
      watcher = watch(directory, () => schedule());
      watcher.on('error', error => {
        state.mode = 'error';
        state.error = `Cannot watch notes: ${error.message}`;
        notify('mode', snapshot());
      });
      schedule(0);
    } catch (error) {
      state.mode = 'error';
      state.error = `Cannot watch notes: ${error.message}`;
    }
  }
  return {
    snapshot,
    close() { closed = true; clearTimeout(timer); watcher?.close(); }
  };
}
