import { open, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StringDecoder } from 'node:string_decoder';

export function completedTurn(record, agent) {
  if (agent === 'codex' && record.type === 'event_msg' && record.payload?.type === 'task_complete') return { kind: 'turn-completed', id: record.payload.turn_id, text: 'The agent finished its turn. Review the result.', preview: String(record.payload.last_agent_message || '').slice(-350) };
  // Claude writes thinking and text as separate records with the same message ID
  // and stop reason. Only the actual final answer creates a completion notice.
  if (agent === 'claude' && !record.isSidechain && record.type === 'assistant' && record.message?.stop_reason === 'end_turn' && record.message.content?.some(item => item.type === 'text')) return { kind: 'turn-completed', id: record.message.id, text: 'The agent finished its turn. Review the result.', preview: record.message.content.filter(item => item.type === 'text').map(item => item.text).join('\n').slice(-350) };
  if (agent === 'claude' && !record.isSidechain && record.type === 'system' && record.subtype === 'api_error') return { kind: 'attention', text: 'The agent reported an API error.' };
  return null;
}

export function nativeActivity(record, agent) {
  if (agent === 'codex' && record.type === 'response_item' && record.payload?.type === 'message' && record.payload.role === 'user') {
    const text = record.payload.content?.filter(item => item.type === 'input_text').map(item => item.text).join('\n');
    if (text) return { kind: 'input-accepted', text, at: record.timestamp };
  }
  if (agent === 'codex' && record.type === 'event_msg' && record.payload?.type === 'user_message' && typeof record.payload.message === 'string') return { kind: 'input-accepted', text: record.payload.message, at: record.timestamp };
  if (agent === 'claude' && record.type === 'user' && !record.isSidechain && !record.isMeta) {
    const content = record.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(item => item.type === 'text').map(item => item.text).join('\n') : '';
    if (text && !text.startsWith('[Request interrupted by user')) return { kind: 'input-accepted', text, at: record.timestamp };
  }
  // Text messages include commentary; tools, thinking and terminal animation do not.
  if (agent === 'codex' && record.type === 'event_msg' && record.payload?.type === 'agent_message' && record.payload.message?.trim()) return { kind: 'assistant-message', at: record.timestamp };
  if (agent === 'claude' && !record.isSidechain && record.type === 'assistant' && record.message?.stop_reason !== 'end_turn' && record.message?.content?.some(item => item.type === 'text' && item.text?.trim())) return { kind: 'assistant-message', at: record.timestamp };
  const completed = completedTurn(record, agent);
  if (completed) return { ...completed, at: record.timestamp };
  if (agent === 'codex' && record.type === 'event_msg') {
    if (record.payload?.type === 'task_started') return { kind: 'turn-started' };
    if (record.payload?.type === 'turn_aborted') return { kind: 'turn-interrupted' };
  }
  if (agent === 'claude' && !record.isSidechain) {
    if (record.type === 'user' && !record.isMeta) {
      const content = record.message?.content;
      const interrupted = value => typeof value === 'string' && value.startsWith('[Request interrupted by user');
      if (interrupted(content) || Array.isArray(content) && content.some(item => item.type === 'text' && interrupted(item.text))) return { kind: 'turn-interrupted' };
      // Tool results also confirm ongoing work; file snapshots and metadata do not.
      if (content) return { kind: 'turn-started' };
    }
    if (record.type === 'assistant' && record.message?.stop_reason !== 'end_turn') return { kind: 'turn-started' };
  }
  return null;
}

// Only read records appended after this managed session starts. These files belong
// to the native CLI; DATA never modifies them or replaces the user's hooks.
export function tailNativeFile(file, agent, onEvent, from = 0) {
  let offset = from, partial = '', closed = false, reading = false, decoder = new StringDecoder('utf8');
  const tick = async () => {
    if (closed || reading) return;
    reading = true;
    try {
      const info = await stat(file);
      if (info.size < offset) { offset = 0; partial = ''; decoder = new StringDecoder('utf8'); }
      if (info.size === offset) return;
      if (info.size - offset > 4 * 1024 * 1024) { offset = info.size - 4 * 1024 * 1024; partial = ''; decoder = new StringDecoder('utf8'); }
      const handle = await open(file, 'r');
      try {
        const buffer = Buffer.alloc(info.size - offset);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        offset += bytesRead;
        const lines = (partial + decoder.write(buffer.subarray(0, bytesRead))).split('\n');
        partial = lines.pop() || '';
        for (const line of lines) {
          try { const event = nativeActivity(JSON.parse(line), agent); if (event && !closed) onEvent(event); } catch { /* Partial records are ignored, never guessed. */ }
        }
      } finally { await handle.close(); }
    } catch { /* CLI may not have created its transcript yet. */ }
    finally { reading = false; }
  };
  const timer = setInterval(tick, 400); timer.unref(); tick();
  return () => { closed = true; clearInterval(timer); };
}

export async function claudeTranscript(cwd, nativeId) {
  const root = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
  const escaped = cwd.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const folders = await readdir(root).catch(() => []);
  const folder = folders.find(item => item.toLowerCase() === escaped) || cwd.replace(/[^a-zA-Z0-9]/g, '-');
  return path.join(root, folder, `${nativeId}.jsonl`);
}

export async function codexTranscript(nativeId) {
  if (!/^[a-f0-9-]{36}$/i.test(nativeId)) return null;
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const pending = [path.join(home, 'sessions')];
  const matches = [];
  while (pending.length) {
    const folder = pending.pop();
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(`-${nativeId.toLowerCase()}.jsonl`)) {
        const handle = await open(file, 'r');
        try {
          const buffer = Buffer.alloc(32768);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          const first = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8').split('\n')[0]);
          if (first.type === 'session_meta' && first.payload?.id === nativeId) matches.push(file);
        } catch { /* A matching name alone is not proof of the native session. */ }
        finally { await handle.close(); }
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
