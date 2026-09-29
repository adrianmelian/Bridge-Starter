import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { saveJson } from './util.mjs';

const cleanText = value => value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replaceAll('\r', '');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export class MessageDelivery {
  constructor(stateDir, sessions, timing = {}) {
    this.root = path.join(stateDir, 'sent-messages'); this.sessions = sessions; this.pending = new Map();
    this.timing = { settle: 1200, quiet: 250, retry: 2200, timeout: 12000, tick: 100, resumeTimeout: 30000, resumeSettle: 1500, ...timing };
  }
  folder(id) { if (!/^[\w-]+$/.test(id)) throw new Error('Invalid chat ID.'); return path.join(this.root, id); }
  async saveHistory(id, { requestId, text }) {
    this.sessions.get(id);
    if (!/^[a-f\d-]{36}$/i.test(requestId || '') || typeof text !== 'string' || !text.trim() || text.length > 64000) throw new Error('Choose a message of up to 64,000 characters.');
    const file = path.join(this.folder(id), 'history', `${requestId}.json`);
    const existing = await readFile(file, 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (existing) {
      const record = JSON.parse(existing);
      if (record.text !== text) throw new Error('This message ID belongs to different text.');
      return record;
    }
    const record = { requestId, text, at: new Date().toISOString() };
    await saveJson(file, record);
    return record;
  }
  async history(id) {
    this.sessions.get(id);
    const records = new Map();
    for (const folder of [this.folder(id), path.join(this.folder(id), 'history')]) {
      const files = await readdir(folder).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
      for (const name of files.filter(name => /^[a-f\d-]{36}\.json$/i.test(name))) {
        const record = JSON.parse(await readFile(path.join(folder, name), 'utf8'));
        records.set(record.requestId, { requestId: record.requestId, text: record.text, at: record.at });
      }
    }
    return [...records.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  }
  async last(id) { this.sessions.get(id); return JSON.parse(await readFile(path.join(this.folder(id), 'latest.json'), 'utf8').catch(e => { if(e.code==='ENOENT') return 'null'; throw e; })); }
  async send(id, { requestId, text }) {
    if (!/^[a-f\d-]{36}$/i.test(requestId || '') || typeof text !== 'string' || !text.trim() || text.length > 64000) throw new Error('Choose a message of up to 64,000 characters.');
    const session = this.sessions.get(id);
    if (session.agent === 'shell') throw new Error('Use the PowerShell terminal directly.');
    if (this.pending.has(id)) {
      const pending = this.pending.get(id);
      if (pending.requestId === requestId && pending.text === text) return pending.promise;
      throw new Error('Wait for the previous message delivery to finish.');
    }
    const promise = this.deliver(session, requestId, text);
    this.pending.set(id, { requestId, text, promise });
    try { return await promise; } finally { this.pending.delete(id); }
  }
  async deliver(session, requestId, text) {
    const file = path.join(this.folder(session.id), `${requestId}.json`);
    const existing = await readFile(file, 'utf8').catch(e => { if(e.code==='ENOENT') return null; throw e; });
    if (existing) {
      const record = JSON.parse(existing);
      if (record.text !== text) throw new Error('This delivery ID belongs to a different message.');
      return { ...record, note: record.accepted ? undefined : 'This message is saved, but acceptance was not confirmed. Check the terminal before resending; no duplicate was sent.' };
    }
    if (session.permissionsChanging) throw new Error('This chat is reconnecting.');
    if (!session.process) {
      const resumedAt = Date.now();
      await this.sessions.resume(session.id);
      // Wait for the resumed CLI's input prompt, not merely its process handle.
      // A retained screen alone is not evidence that the new CLI is ready.
      while (true) {
        if (!session.process || session.permissionsChanging) throw new Error('The chat could not resume.');
        const outputAt = Date.parse(session.lastOutputAt || 0);
        const screen = (await this.sessions.read(session.id)).screen;
        if (outputAt >= resumedAt && Date.now() - resumedAt >= this.timing.resumeSettle && Date.now() - outputAt >= this.timing.quiet && /(?:^|\n)\s*[›❯>]\s/mu.test(screen.slice(-1800))) break;
        if (Date.now() - resumedAt >= this.timing.resumeTimeout) throw new Error('The chat resumed but is not ready for a message. Complete any startup prompt, then send again.');
        await pause(this.timing.tick);
      }
    }
    const record = { requestId, sessionId: session.id, text, at: new Date().toISOString(), accepted: false, status: 'saved' };
    const persist = async () => { await saveJson(file, record); await saveJson(path.join(this.folder(session.id), 'latest.json'), record); };
    // A durable copy must exist before writing any bytes to the terminal.
    await persist();
    const process = session.process, started = Date.now(), clean = cleanText(text);
    let accepted = false, retrySent = false;
    const receive = event => {
      if (event.sessionId === session.id && event.text.trim() === clean.trim() && Date.parse(event.at) >= started - 100) accepted = true;
    };
    this.sessions.on('input-accepted', receive);
    const alive = () => { if (session.process !== process || session.permissionsChanging) throw new Error('The chat reconnected during delivery. Your message is saved.'); };
    try {
      const before = (await this.sessions.read(session.id)).screen;
      if (/›\s*\[Pasted Content \d+ chars\]/.test(before.slice(-1500))) throw new Error('An earlier paste is still waiting in the terminal. Submit or clear it there first; your new message is saved.');
      const slash = /^\/[\w:.-]+(?: [^\r\n\x00-\x1f\x7f]*)?$/.test(text.trim());
      this.sessions.input(session.id, slash ? text.trim() : text, { coordinator: !slash, submit: false });
      record.status = 'pasted';
      // Let the CLI finish rendering and leave its paste guard before Enter.
      while (Date.now() - started < this.timing.settle || Date.now() - Date.parse(session.lastOutputAt || 0) < this.timing.quiet) {
        alive(); if (Date.now() - started > 6000) break; await pause(this.timing.tick);
      }
      alive(); this.sessions.input(session.id, '\r');
      session.lastMessageAt = new Date().toISOString();
      this.sessions.changed?.(session);
      if (slash) {
        // Native commands open menus or update settings without a user-message
        // transcript event. Never wait for or retry an acknowledgement here.
        record.status = 'submitted'; await persist();
        return { ...record, note: 'Command submitted. Follow any native menu in the terminal.' };
      }
      const entered = Date.now();
      while (!accepted && Date.now() - entered < this.timing.timeout) {
        await pause(this.timing.tick); alive();
        if (!retrySent && Date.now() - entered >= this.timing.retry) {
          retrySent = true;
          const screen = (await this.sessions.read(session.id)).screen;
          // Retry only Enter, and only while this exact paste is visibly pending.
          // Never paste the message a second time or press Enter on a CLI dialog.
          const match = /›\s*\[Pasted Content (\d+) chars\]\s*\n/.exec(screen.slice(-1500));
          if (!accepted && session.activity !== 'working' && match && Number(match[1]) === [...clean].length) this.sessions.input(session.id, '\r');
        }
      }
      record.accepted = accepted; record.status = accepted ? 'accepted' : 'unconfirmed';
      await persist();
      return { ...record, note: accepted ? undefined : 'Your message is saved, but the agent has not confirmed acceptance. Check the terminal; recover the message from history if needed.' };
    } catch (error) {
      record.status = 'unconfirmed'; record.error = error.message; await persist(); throw error;
    } finally { this.sessions.off('input-accepted', receive); }
  }
}
