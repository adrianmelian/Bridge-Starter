import { readFile, open, rename, unlink, readdir, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Windows PowerShell can wrap a JSON array in another array during a round trip.
// Recover that shape before constructing sessions, and never overwrite records
// that cannot be identified with a fabricated, empty conversation.
export function savedSessions(value) {
  if (!Array.isArray(value)) throw new Error('Saved chat history must be an array. Restore sessions.json from a backup.');
  const records = value.flat(Infinity);
  const ids = new Set();
  for (const item of records) {
    if (!item || typeof item.id !== 'string' || !/^[\w-]+$/.test(item.id) ||
        !['codex', 'claude', 'kimi', 'shell'].includes(item.agent) || ids.has(item.id)) {
      throw new Error('Saved chat history contains an invalid or duplicate session. Restore sessions.json from a backup; the original file has been left intact.');
    }
    ids.add(item.id);
  }
  return records;
}

async function readHistory(file) {
  try {
    return savedSessions(JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read saved chat history (${path.basename(file)}); the original file has been left intact. ${error.message}`, { cause: error });
  }
}

// Flush the complete replacement before renaming it over the old index.
async function writeHistory(file, records) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(records, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temp, file);
  } finally { await unlink(temp).catch(() => {}); }
}

export async function loadSessionHistory(stateDir) {
  const file = path.join(stateDir, 'sessions.json');
  let records, failure;
  try { records = await readHistory(file); } catch (error) { failure = error; }
  if (records) return records;
  const backup = await readHistory(`${file}.backup`);
  if (backup) {
    // Retain the damaged bytes for diagnosis before repairing the primary.
    if (failure) await copyFile(file, `${file}.damaged-${randomUUID()}`);
    await writeHistory(file, backup);
    return backup;
  }
  if (failure) throw failure;
  if ((await readdir(stateDir)).some(name => /^screen-.+\.json$/.test(name))) {
    throw new Error('Saved chat screens exist but the history index is missing. Restore sessions.json from a backup; existing files have been left intact.');
  }
  return [];
}

export async function saveSessionHistory(stateDir, value) {
  const records = savedSessions(value);
  const file = path.join(stateDir, 'sessions.json');
  const previous = await readHistory(file) ?? await readHistory(`${file}.backup`);
  const ids = new Set(records.map(item => item.id));
  // Closing a tab never deletes its history. A stale/empty writer must not
  // replace an index containing conversations it has not loaded.
  if (previous?.some(item => !ids.has(item.id))) {
    throw new Error('Refusing to overwrite saved conversations missing from this service. Reopen The Bridge to reload its history.');
  }
  await writeHistory(`${file}.backup`, previous ?? records);
  await writeHistory(file, records);
}
