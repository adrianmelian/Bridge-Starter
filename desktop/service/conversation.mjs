import { open, stat } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { codexTranscript, claudeTranscript } from './native-events.mjs';

const textOf = content => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(c => ['text', 'input_text', 'output_text'].includes(c.type)).map(c => c.text || '').join('\n') : '';
const printable = value => typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2);
const bounded = value => { const text = printable(value); return text.length > 50000 ? text.slice(0, 50000) + '\n[Display shortened; full content remains in the native transcript.]' : text; };
const missingTranscript = session => !session.hasConversation && !session.preview && !session.lastCompletedId
  ? { available: true, items: [], note: 'Start a conversation by sending a message below.' }
  : { available: false, items: [], note: 'The saved conversation could not be found. Open Terminal to check the agent.' };

export class Conversation {
  constructor() { this.items = []; this.calls = new Map(); this.group = null; this.sequence = 0; this.trimmed = false; }
  closeGroup() { if (this.group) this.group.settled = true; this.group = null; }
  message(role, text, phase, source, at) {
    if (!text) return;
    const last = this.items.at(-1);
    // Codex may save the same message in both event and response formats.
    if (last?.kind === 'message' && last.role === role && last.text === text && last.source !== source) { last.source = source; return; }
    this.closeGroup();
    this.items.push({ id: `message-${++this.sequence}`, kind: 'message', role, text: bounded(text), phase: phase || '', source, at });
  }
  tool(id, name, input, output, at) {
    let call = this.calls.get(id);
    if (!call) {
      if (!this.group) { this.group = { id: `commands-${++this.sequence}`, kind: 'commands', calls: [], settled: false, at }; this.items.push(this.group); }
      call = { id: id || `call-${this.sequence}-${this.group.calls.length}`, name: name || 'Tool output', input: '', output: '', complete: false };
      this.group.calls.push(call); this.calls.set(call.id, call);
    }
    if (input !== undefined) call.input = bounded(input);
    if (output !== undefined) { call.output = bounded(output); call.complete = true; }
  }
  accept(record, agent) {
    const p = record.payload; const at = record.timestamp;
    if (agent === 'codex') {
      if (record.type === 'response_item') {
        if (p?.type === 'message' && ['user', 'assistant'].includes(p.role) && !['analysis', 'summary'].includes(p.channel) && !['analysis', 'summary'].includes(p.phase)) this.message(p.role, textOf(p.content), p.phase || p.channel, 'response', at);
        if (['function_call', 'custom_tool_call'].includes(p?.type)) this.tool(p.call_id || p.id, p.name, p.arguments ?? p.input, undefined, at);
        if (['function_call_output', 'custom_tool_call_output'].includes(p?.type)) this.tool(p.call_id, null, undefined, p.output, at);
      }
      if (record.type === 'event_msg') {
        if (p?.type === 'user_message') this.message('user', p.message, '', 'event', at);
        if (p?.type === 'agent_message') this.message('assistant', p.message, p.phase, 'event', at);
        if (['task_complete', 'turn_aborted'].includes(p?.type)) this.closeGroup();
      }
    }
    if (agent === 'claude' && !record.isSidechain && !record.isMeta) {
      if (['user', 'assistant'].includes(record.type)) {
        const content = record.message?.content;
        if (typeof content === 'string') this.message(record.type, content, '', 'claude', at);
        else for (const part of content || []) {
          if (part.type === 'text') this.message(record.type, part.text, record.message.stop_reason === 'end_turn' ? 'final' : 'commentary', 'claude', at);
          if (part.type === 'tool_use') this.tool(part.id, part.name, part.input, undefined, at);
          if (part.type === 'tool_result') this.tool(part.tool_use_id, null, undefined, textOf(part.content) || printable(part.content), at);
        }
        if (record.type === 'assistant' && record.message?.stop_reason === 'end_turn') this.closeGroup();
      }
    }
    if (this.items.length > 2000) {
      const removed = this.items.splice(0, this.items.length - 2000); this.trimmed = true;
      for (const item of removed) for (const call of item.calls || []) this.calls.delete(call.id);
    }
  }
}

export class Conversations {
  constructor() { this.cache = new Map(); }
  async read(session, limit = 100) {
    if (!['codex', 'claude'].includes(session.agent)) return { available: false, items: [], note: 'Use Terminal for this agent.' };
    if (!session.nativeId) return missingTranscript(session);
    const key = `${session.id}:${session.nativeId}`;
    let entry = this.cache.get(key);
    if (!entry) {
      const file = session.agent === 'codex' ? await codexTranscript(session.nativeId) : await claudeTranscript(session.cwd, session.nativeId);
      if (!file) return missingTranscript(session);
      entry = { file, offset: 0, partial: '', decoder: new StringDecoder('utf8'), conversation: new Conversation(), reading: null };
      // Bound cached conversations. Native transcripts are never modified.
      if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, entry);
    }
    if (!entry.reading) entry.reading = this.update(entry, session.agent).finally(() => { entry.reading = null; });
    try { await entry.reading; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.cache.delete(key);
      return missingTranscript(session);
    }
    const count = Math.max(25, Math.min(2000, Number(limit) || 100));
    const items = entry.conversation.items;
    return { available: true, version: entry.offset, items: items.slice(-count), hasMore: items.length > count, trimmed: entry.conversation.trimmed };
  }
  async update(entry, agent) {
    const info = await stat(entry.file);
    if (info.size < entry.offset) { entry.offset = 0; entry.partial = ''; entry.decoder = new StringDecoder('utf8'); entry.conversation = new Conversation(); }
    if (info.size === entry.offset) return;
    const handle = await open(entry.file, 'r');
    try {
      while (entry.offset < info.size) {
        const buffer = Buffer.alloc(Math.min(256 * 1024, info.size - entry.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, entry.offset);
        if (!bytesRead) break;
        entry.offset += bytesRead;
        const lines = (entry.partial + entry.decoder.write(buffer.subarray(0, bytesRead))).split('\n');
        entry.partial = lines.pop() || '';
        for (const line of lines) { try { entry.conversation.accept(JSON.parse(line), agent); } catch { /* Incomplete or unsupported records are not inferred. */ } }
      }
    } finally { await handle.close(); }
  }
}
