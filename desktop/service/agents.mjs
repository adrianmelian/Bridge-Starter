import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseEnv } from 'dotenv';

export const AGENTS = [
  { id: 'codex', label: 'Codex', color: '#88d8bf', command: 'codex', subscription: true },
  { id: 'claude', label: 'Claude Code', color: '#dba68c', command: 'claude', subscription: true },
  { id: 'kimi', label: 'Kimi', color: '#b3a3f7', command: 'kimi', subscription: true },
  { id: 'shell', label: 'PowerShell', color: '#89b7ed', command: 'powershell.exe', subscription: false },
];

export function commandPath(name, env = process.env) {
  if (path.isAbsolute(name) && existsSync(name)) return name;
  const extra = [path.join(env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'bin'), path.join(env.APPDATA || '', 'npm'), path.join(os.homedir(), '.kimi-code', 'bin'), path.join(os.homedir(), '.local', 'bin')];
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', ''] : [''];
  for (const folder of [...String(env.PATH || env.Path || '').split(path.delimiter), ...extra]) {
    for (const ext of extensions) {
      const candidate = path.join(folder, name.toLowerCase().endsWith(ext) && ext ? name : name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function inventory(env = process.env) {
  return AGENTS.map(agent => ({ ...agent, available: !!commandPath(agent.command, env) }));
}

// Resolve the real Codex binary when available so JSON-RPC does not pass through a shell.
export function codexBinary(env = process.env) {
  const active = commandPath('codex', env);
  if (active && !/\.(cmd|bat|ps1)$/i.test(active)) return { file: active, args: [] };
  const npmRoot = path.join(env.APPDATA || '', 'npm', 'node_modules', '@openai');
  const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const platformPackage = `codex-win32-${process.arch}`;
  for (const root of [path.join(npmRoot, 'codex', 'node_modules', '@openai', platformPackage), path.join(npmRoot, platformPackage), path.join(npmRoot, 'codex')]) {
    for (const directory of ['bin', 'codex']) {
      const candidate = path.join(root, 'vendor', triple, directory, 'codex.exe');
      if (existsSync(candidate)) return { file: candidate, args: [] };
    }
  }
  const js = path.join(npmRoot, 'codex', 'bin', 'codex.js');
  if (existsSync(js)) return { file: process.execPath, args: [js] };
  const executable = commandPath('codex', env);
  if (executable && !/\.(cmd|bat|ps1)$/i.test(executable)) return { file: executable, args: [] };
  throw new Error('Codex CLI is not installed. Install it and sign in once to use Data.');
}

export function terminalCommand(agent, { bypass = false, resumeId, nativeId, model, effort, permissionsExplicit = false } = {}) {
  if (!AGENTS.some(item => item.id === agent)) throw new Error('Unknown agent');
  const command = commandPath(AGENTS.find(item => item.id === agent).command);
  if (!command) throw new Error(`${agent} is not installed on this computer`);
  const args = [];
  if (agent === 'codex') {
    if (resumeId) args.push('resume', resumeId);
    // Inline mode retains xterm scrollback for new and resumed conversations.
    args.push('--no-alt-screen');
    if (bypass) args.push('--dangerously-bypass-approvals-and-sandbox');
    else if (permissionsExplicit) args.push('--sandbox', 'workspace-write', '--ask-for-approval', 'on-request');
    if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  } else if (agent === 'claude') {
    if (resumeId) args.push('--resume', resumeId);
    else if (nativeId) args.push('--session-id', nativeId);
    if (bypass) args.push('--dangerously-skip-permissions');
    if (effort) args.push('--effort', effort);
  } else if (agent === 'kimi') {
    if (resumeId) args.push('--session', resumeId);
    if (bypass) args.push('--yolo');
  } else {
    args.push('-NoLogo');
  }
  if (model && ['codex', 'claude'].includes(agent)) args.push('--model', model);
  if (process.platform !== 'win32' || agent === 'shell') return { file: command, args };
  // An encoded PowerShell script preserves spaces, Unicode and quotes. No -NoExit:
  // after the agent exits, stale coordinator input cannot become shell commands.
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const script = `[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); & ${[command, ...args].map(quote).join(' ')}; exit $LASTEXITCODE`;
  return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
}

export function childEnvironment(repo) {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  // Forward only explicitly named MCP credentials. Voice and unrelated API keys
  // stay private to the service; CLI subscription authentication is unchanged.
  if (repo) {
    const values = parseEnv(readDotEnv(path.join(repo, '.env')));
    for (const [name, value] of Object.entries(values)) if (/^DATA_MCP_[A-Z0-9_]+$/.test(name) && !env[name]) env[name] = value;
  }
  // Drop host-agent identity from the parent so every terminal is an independent CLI.
  for (const key of Object.keys(env)) {
    if (/^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|CODEX_THREAD_ID|CODEX_TURN_ID|CODEX_SHELL|DATA_TOKEN|DATA_PARENT_PID)$/.test(key)) delete env[key];
  }
  return env;
}

export function readDotEnv(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}
