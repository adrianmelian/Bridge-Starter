import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { saveJson } from './util.mjs';

export function browserUrl(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 4096) throw new Error('Enter a web address or localhost URL.');
  const supplied = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : /^(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(text) ? `http://${text}` : `https://${text}`;
  let url; try { url = new URL(supplied); } catch { throw new Error('Enter a valid web address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /^\w+:/i.test(text) && !text.includes('://') && !/^(localhost|127\.0\.0\.1):\d/i.test(text)) throw new Error('Use an http or https page without embedded login credentials.');
  return url.href;
}
export class BrowserTabs {
  constructor(stateDir, send, changed) { this.file = path.join(stateDir, 'browser-tabs.json'); this.send = send; this.changed = changed; this.tabs = []; this.activeId = 'workspace'; this.available = false; this.saves = Promise.resolve(); this.bounds = null; }
  async init() {
    let saved;
    try { saved = JSON.parse(await readFile(this.file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Workspace browser tabs could not be read; the saved file has been left intact.'); }
    if (saved) {
      if (!Array.isArray(saved.tabs) || saved.tabs.length > 16 || new Set(saved.tabs.map(t => t.id)).size !== saved.tabs.length || saved.tabs.some(t => !/^[a-f\d-]{36}$/i.test(t.id) || typeof t.url !== 'string')) throw new Error('Invalid saved Workspace tabs; the file has been left intact.');
      this.tabs = saved.tabs.map(t => ({ id: t.id, url: t.url ? browserUrl(t.url) : '', title: String(t.title || 'New tab').slice(0, 120), loading: false }));
      this.activeId = this.tabs.some(t => t.id === saved.activeId) ? saved.activeId : 'workspace';
    }
    return this;
  }
  value() { return { tabs: this.tabs, activeId: this.activeId, available: this.available, error: this.loadError || this.saveError }; }
  publish(persist = true) {
    this.changed(this.value());
    if (persist && !this.loadError) { const saved = { tabs: this.tabs.map(({ id, url, title }) => ({ id, url, title })), activeId: this.activeId }; this.saves = this.saves.then(async () => { await saveJson(this.file, saved); this.saveError = undefined; }).catch(error => { this.saveError = `Browser tabs could not be saved: ${error.message}`; this.changed(this.value()); }); }
  }
  sync() { if (this.available && this.bounds) this.send({ type: 'browser', action: 'sync', tabs: this.tabs, activeId: this.activeId, bounds: this.bounds }); }
  receive(event) {
    if (event.type === 'browser-ready') { this.available = !this.loadError; this.publish(false); this.sync(); return; }
    if (event.type === 'browser-popup') { try { this.action({ action: 'new', url: event.url }); } catch {} return; }
    if (event.type !== 'browser-update') return;
    const tab = this.tabs.find(t => t.id === event.id); if (!tab) return;
    if (event.url) { try { tab.url = browserUrl(event.url); } catch { return; } }
    if (typeof event.title === 'string') tab.title = event.title.slice(0, 120) || new URL(tab.url).hostname;
    if (typeof event.loading === 'boolean') tab.loading = event.loading;
    tab.error = event.error ? String(event.error).slice(0, 250) : undefined;
    this.publish();
  }
  action(data) {
    if (data.action === 'layout') {
      const { x, y, width, height } = data;
      if (![x,y,width,height].every(Number.isFinite) || x < 0 || y < 60 || width < 1 || height < 1 || [x,y,width,height].some(n => n > 30000)) throw new Error('Invalid browser layout.');
      this.bounds = { x, y, width, height }; this.sync(); return this.value();
    }
    if (!this.available) throw new Error('Workspace browser tabs need the updated desktop application.');
    let tab = this.tabs.find(t => t.id === data.id);
    switch (data.action) {
      case 'new':
        if (this.tabs.length >= 16) throw new Error('Close a browser tab before opening another (16 tab limit).');
        tab = { id: randomUUID(), url: data.url ? browserUrl(data.url) : '', title: 'New tab', loading: false };
        if (tab.url) tab.title = new URL(tab.url).hostname;
        this.tabs.push(tab); this.activeId = tab.id; break;
      case 'select':
        if (data.id !== 'workspace' && !tab) throw new Error('Browser tab no longer exists.');
        this.activeId = data.id; break;
      case 'close': {
        if (!tab) throw new Error('Browser tab no longer exists.');
        const index = this.tabs.indexOf(tab); this.tabs.splice(index, 1);
        if (this.activeId === data.id) this.activeId = this.tabs[Math.max(0,index-1)]?.id || 'workspace';
        break;
      }
      case 'navigate':
        if (!tab) throw new Error('Choose a browser tab first.');
        tab.url = browserUrl(data.url); tab.title = new URL(tab.url).hostname; tab.loading = true; tab.error = undefined;
        this.send({ type: 'browser', action: 'navigate', id: tab.id, url: tab.url }); break;
      case 'back': case 'forward': case 'reload':
        if (!tab?.url) throw new Error('Open a page first.');
        this.send({ type: 'browser', action: data.action, id: tab.id }); return this.value();
      default: throw new Error('Unknown browser action.');
    }
    this.publish(); this.sync(); return this.value();
  }
}
