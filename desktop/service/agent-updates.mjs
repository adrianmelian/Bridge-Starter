import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { commandPath } from './agents.mjs';

const quote = text => "'" + text.replaceAll("'", "''") + "'";
export const versionOf = text => String(text).replace(/^rust-v/, '').match(/\b\d+\.\d+\.\d+(?:-[\w.]+)?\b/)?.[0];
export function newer(a, b) {
  if (!a || !b || a.includes('-') || b.includes('-')) return false;
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}
function run(file, args, { cwd, output = () => {}, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '', expired = false;
    const timer = timeout ? setTimeout(() => { expired = true; child.kill(); }, timeout) : null;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { text = (text + data.toString()).slice(-16000); output(text); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); expired ? reject(new Error('Version check timed out.')) : code === 0 ? resolve(text) : reject(new Error(`Agent command exited (${code}). ${text.slice(-2000)}`)); });
  });
}
async function release(agent, cwd) {
  let channel = 'latest';
  if (agent === 'claude') {
    for (const file of [path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json'), path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json')]) {
      const settings = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
      if (['stable', 'latest'].includes(settings.autoUpdatesChannel)) channel = settings.autoUpdatesChannel;
    }
  }
  const url = agent === 'codex' ? 'https://releases.openai.com/codex/channels/latest' : `https://downloads.claude.ai/claude-code-releases/${channel}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Release check failed (${response.status}). Try again later.`);
  const value = agent === 'codex' ? (await response.json()).tag_name : await response.text();
  const latest = versionOf(value);
  if (!latest) throw new Error('The release service returned an unrecognized version.');
  return { latest, channel };
}
export function updateCommand(agent, executable) {
  if (process.platform !== 'win32') throw new Error('Bridge updates currently support native Windows installations.');
  if (agent === 'claude' && /[\\/]\.local[\\/]bin[\\/]claude\.exe$/i.test(executable)) return { file: executable, args: ['update'] };
  if (agent === 'codex' && /[\\/]Programs[\\/]OpenAI[\\/]Codex[\\/]bin[\\/]codex\.exe$/i.test(executable)) {
    const script = "$ErrorActionPreference='Stop'; $env:CODEX_NON_INTERACTIVE='1'; & ([scriptblock]::Create((Invoke-RestMethod 'https://chatgpt.com/codex/install.ps1'))); if ($LASTEXITCODE) { exit $LASTEXITCODE }";
    return { file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
  }
  throw new Error('This installation is managed elsewhere. Update it using its package manager, then reconnect the chat.');
}
async function inspect(session) {
  const executable = commandPath(session.agent);
  if (!executable) throw new Error('The agent is not installed.');
  let supported = true, note = '';
  try { updateCommand(session.agent, executable); } catch (error) { supported = false; note = error.message; }
  const command = /\.(cmd|bat|ps1)$/i.test(executable)
    ? { file: 'powershell.exe', args: ['-NoProfile', '-Command', `& ${quote(executable)} --version`] }
    : { file: executable, args: ['--version'] };
  const current = versionOf(await run(command.file, command.args, { cwd: session.cwd }));
  if (!current) throw new Error('Could not read the installed version.');
  return { agent: session.agent, current, ...await release(session.agent, session.cwd), supported, note };
}

export class AgentUpdates {
  constructor(sessions, messages, { restartApp, inspectAgent = inspect, install = async (session, output) => {
    const command = updateCommand(session.agent, commandPath(session.agent) || '');
    // The installer owns its download/retry lifecycle; never kill it on an HTTP timeout.
    return run(command.file, command.args, { cwd: session.cwd, output, timeout: 0 });
  } } = {}) { this.sessions = sessions; this.messages = messages; this.restartApp = restartApp; this.inspectAgent = inspectAgent; this.install = install; this.cache = new Map(); this.jobs = new Map(); this.busy = false; }
  async check(session, refresh = false) {
    if (!['codex', 'claude'].includes(session.agent)) throw new Error('Updates support Codex and Claude Code.');
    const key = `${session.agent}:${session.cwd}`;
    let cached = this.cache.get(key);
    if (!cached || (refresh && !cached.pending) || Date.now() - cached.at > 3600000) {
      cached = { at: Date.now(), pending: true };
      cached.promise = this.inspectAgent(session).then(value => ({ ...value, available: newer(value.latest, value.current) })).catch(error => { this.cache.delete(key); throw error; }).finally(() => { cached.pending = false; });
      this.cache.set(key, cached);
    }
    return { ...await cached.promise, job: this.jobs.get(session.agent) || null };
  }
  start(session, confirmed, restartAll = false) {
    if (confirmed !== true) throw new Error('Confirm updating the agent and reconnecting this chat.');
    if (!['codex', 'claude'].includes(session.agent) || !session.open) throw new Error('Open a Codex or Claude chat first.');
    if (this.busy) throw new Error('An agent update is already running.');
    if (restartAll && !this.restartApp) throw new Error('Bridge restart is unavailable.');
    if (session.permissionsChanging || this.messages.pending.has(session.id)) throw new Error('Wait for chat reconnection or message delivery to finish.');
    this.busy = true;
    const job = { sessionId: session.id, phase: 'checking', output: '', error: '', restartAll, startedAt: new Date().toISOString() };
    this.jobs.set(session.agent, job);
    session.permissionsChanging = true; this.sessions.changed(session);
    this.perform(session, job).catch(() => {});
    return { ...job };
  }
  async perform(session, job) {
    try {
      const info = await this.check(session, true);
      if (!info.supported) throw new Error(info.note);
      if (session.nativeId && !(await this.sessions.nativeBoundary(session, session.nativeId))) throw new Error('Saved conversation could not be located. Update cancelled.');
      if (!job.restartAll && session.hasConversation && !session.nativeId) throw new Error('Reconnect this chat first so its conversation can be located.');
      if (!job.restartAll && !session.nativeId && session.process) throw new Error('This new chat has no saved conversation yet. Send its first message before updating.');
      if (info.available) {
        job.phase = 'installing';
        await this.install(session, text => { job.output = text; });
        const after = await this.inspectAgent(session);
        if (newer(info.latest, after.current)) throw new Error('Installer finished but the expected version is not active. Check the details before retrying.');
      }
      if (job.restartAll) {
        if (this.messages.pending.size) throw new Error('Update installed. Wait for messages to finish sending, then choose Update to restart.');
        await this.sessions.persist();
        job.phase = 'restarting';
        await this.restartApp();
        const watchdog = setTimeout(() => {
          if (job.phase === 'restarting') { job.phase = 'failed'; job.error = 'Update installed, but the Bridge has not restarted. Restart the application manually.'; this.busy = false; }
        }, 60000);
        watchdog.unref();
        this.cache.clear();
        return;
      }
      job.phase = 'reconnecting';
      session.permissionsChanging = false;
      if (session.nativeId) await this.sessions.reload(session.id, true);
      else if (!session.process) await this.sessions.resume(session.id);
      else throw new Error('Update is installed. This new chat has no saved conversation yet; reconnect after its first message.');
      job.phase = 'complete'; this.cache.clear();
    } catch (error) { job.phase = 'failed'; job.error = error.message; }
    finally { this.busy = job.phase === 'restarting'; session.permissionsChanging = false; this.sessions.changed(session); }
  }
}
