import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { codexBinary, commandPath, childEnvironment } from './agents.mjs';

const commands = entries => entries.map(([name, description]) => ({ name, description }));
const common = commands([['model','Choose a model'],['compact','Compact conversation context'],['mcp','View MCP connections'],['help','Show native help']]);
export const builtinCommands = {
  codex: [...common.filter(c => c.name !== 'help'), ...commands([['apps','Browse connected apps'],['plugins','Browse plugins'],['hooks','Manage hooks'],['usage','View account usage'],['statusline','Customize status line'],['theme','Choose terminal colors'],['rename','Rename native conversation'],['mention','Mention a file'],['fast','Toggle fast service tier'],['status','Show session status'],['permissions','Change permissions'],['plan','Use plan mode'],['review','Review changes'],['diff','Show changes'],['resume','Resume a conversation'],['fork','Fork this conversation'],['new','Start a new conversation'],['init','Create project instructions'],['skills','Browse skills'],['feedback','Send feedback'],['quit','Exit the agent']])],
  claude: [...common, ...commands([['effort','Choose reasoning effort'],['status','Show session status'],['cost','Show usage'],['context','Show context usage'],['clear','Clear the conversation'],['resume','Resume a conversation'],['permissions','View permissions'],['config','Open settings'],['doctor','Check installation'],['init','Create project instructions'],['exit','Exit the agent']])],
};

// Catalog discovery starts no user turn and sends no inference request.
export async function discoverOptions(agent, cwd) {
  if (!['codex', 'claude'].includes(agent)) return Promise.resolve({ models: [], commands: [], note: 'This agent does not expose a supported model catalog here.' });
  const prompts = agent === 'codex' ? (await readdir(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'prompts')).catch(() => [])).filter(name => /^[\w.-]+\.md$/.test(name)).map(name => ({ name: `prompts:${name.slice(0, -3)}`, description: 'Custom prompt' })) : [];
  return new Promise((resolve, reject) => {
    const command = agent === 'codex' ? codexBinary() : { file: commandPath('claude'), args: [] };
    if (!command.file) return reject(new Error('The agent is not installed.'));
    const args = agent === 'codex' ? ['app-server', '--stdio'] : ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
    const child = spawn(command.file, [...command.args, ...args], { cwd, env: childEnvironment(cwd), stdio: ['pipe','pipe','pipe'], windowsHide: true });
    let done = false; const models = []; let nextId = 2;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); lines.close(); child.stdin.end(); child.kill(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('The agent model catalog timed out. Try Refresh.')), 20000);
    const lines = createInterface({ input: child.stdout });
    const send = value => child.stdin.write(JSON.stringify(value) + '\n');
    child.stdin.on('error', () => {}); child.stderr.on('data', () => {});
    child.on('error', () => finish(new Error('Could not start the agent catalog.')));
    child.on('exit', () => { if (!done) finish(new Error('The agent closed before returning its model catalog.')); });
    lines.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if (agent === 'claude' && message.type === 'control_response') {
        const result = message.response?.response;
        if (!Array.isArray(result?.models)) return finish(new Error('Claude did not return a model catalog.'));
        const custom = (result.commands || []).map(c => ({ name: c.name.replace(/^\//, ''), description: c.description || '' })).filter(c => /^[\w:.-]+$/.test(c.name));
        finish(null, { models: result.models.map(m => ({ id: m.value, name: m.displayName, description: m.description, efforts: m.supportedEffortLevels || [], defaultEffort: '', isDefault: m.value === 'default' })), commands: [...new Map([...builtinCommands.claude, ...custom].map(c => [c.name,c])).values()] });
      }
      if (agent === 'codex' && message.id != null && !message.method) {
        if (message.error) return finish(new Error('Codex could not provide its model catalog.'));
        if (message.id === 1) { send({ method: 'initialized', params: {} }); send({ id: nextId++, method: 'model/list', params: { includeHidden: false } }); }
        else {
          models.push(...(message.result?.data || []));
          if (message.result?.nextCursor) return send({ id: nextId++, method: 'model/list', params: { includeHidden: false, cursor: message.result.nextCursor } });
          finish(null, { models: models.map(m => ({ id: m.model, name: m.displayName, description: m.description, efforts: (m.supportedReasoningEfforts || []).map(e => e.reasoningEffort), defaultEffort: m.defaultReasoningEffort, isDefault: m.isDefault })), commands: [...builtinCommands.codex, ...prompts] });
        }
      }
    });
    send(agent === 'codex' ? { id: 1, method: 'initialize', params: { clientInfo: { name: 'bridge_catalog', version: '1.0' } } } : { type: 'control_request', request_id: 'catalog', request: { subtype: 'initialize' } });
  });
}

export class AgentOptions {
  constructor(discover = discoverOptions) { this.discover = discover; this.cache = new Map(); }
  async get(session, refresh = false) {
    const key = `${session.agent}:${session.cwd}`;
    const cached = this.cache.get(key);
    if (cached && (!refresh && Date.now() - cached.at < 60000 || cached.pending)) return cached.promise;
    const entry = { at: Date.now(), pending: true };
    entry.promise = this.discover(session.agent, session.cwd).finally(() => { entry.pending = false; }).catch(error => { this.cache.delete(key); throw error; });
    this.cache.set(key, entry); return entry.promise;
  }
  async validate(session, model, effort) {
    const catalog = await this.get(session);
    const selected = catalog.models.find(m => m.id === model);
    if (!selected) throw new Error('Choose a model from this agent’s available models.');
    if (typeof effort !== 'string' || effort && !selected.efforts.includes(effort)) throw new Error('Choose a supported effort for this model.');
    return { model, effort: effort || selected.defaultEffort || undefined };
  }
}
