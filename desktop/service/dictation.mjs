import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const MAX_AUDIO_BYTES = 44 + 16000 * 2 * 120;
export function validateAudio(wav) {
  if (wav.length < 44 || wav.length > MAX_AUDIO_BYTES ||
      wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
      wav.readUInt32LE(16) !== 16 || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 ||
      wav.readUInt32LE(24) !== 16000 || wav.readUInt32LE(28) !== 32000 || wav.readUInt16LE(32) !== 2 ||
      wav.readUInt16LE(34) !== 16 || wav.toString('ascii', 36, 40) !== 'data' ||
      wav.readUInt32LE(40) !== wav.length - 44 || wav.readUInt32LE(4) !== wav.length - 8 || wav.length % 2) {
    throw Object.assign(new Error('Use a mono 16 kHz PCM microphone recording of at most two minutes.'), { status: 400 });
  }
  let energy = 0;
  for (let offset = 44; offset < wav.length; offset += 2) energy += (wav.readInt16LE(offset) / 32768) ** 2;
  return wav.length >= 16044 && Math.sqrt(energy / ((wav.length - 44) / 2)) >= 0.001;
}

export class LocalDictation {
  constructor(stateDir) { this.stateDir = stateDir; this.child = null; this.starting = null; this.busy = false; this.closed = false; }
  async config() {
    let config;
    try { config = JSON.parse(await readFile(path.join(this.stateDir, 'dictation.json'), 'utf8')); }
    catch { throw Object.assign(new Error('Local dictation needs a Whisper engine and model installed.'), { status: 503 }); }
    if (!path.isAbsolute(config.executable || '') || !path.isAbsolute(config.model || '') ||
        !(await stat(config.executable)).isFile() || !(await stat(config.model)).isFile()) throw new Error('The local Whisper engine or model is missing.');
    return { ...config, language: /^[a-z]{2,3}$/.test(config.language || '') ? config.language : 'en' };
  }
  async ensure() {
    if (this.closed) throw new Error('Dictation is shutting down.');
    if (this.starting) return this.starting;
    if (this.child && this.origin) return;
    this.starting = this.start().finally(() => { this.starting = null; });
    return this.starting;
  }
  async start() {
    const config = await this.config();
    const port = await new Promise((resolve, reject) => {
      const probe = net.createServer(); probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(error => error ? reject(error) : resolve(port)); });
    });
    if (this.closed) throw new Error('Dictation is shutting down.');
    const prefix = `/private-${randomUUID()}`;
    const origin = `http://127.0.0.1:${port}${prefix}`;
    const child = spawn(config.executable, ['-m', config.model, '--host', '127.0.0.1', '--port', String(port), '--request-path', prefix, '-l', config.language, '-t', '8', '-sns'], { windowsHide: true, cwd: path.dirname(config.executable), stdio: ['ignore', 'ignore', 'pipe'] });
    this.child = child;
    let failure = '';
    child.stderr.on('data', bytes => { failure = (failure + bytes.toString()).slice(-2000); });
    let spawnFailed = false;
    child.on('error', () => { spawnFailed = true; failure = 'The Whisper engine could not be started.'; });
    child.once('exit', () => { if (this.child === child) { this.child = null; this.origin = null; } });
    try {
      for (let attempt = 0; attempt < 180; attempt++) {
        if (this.closed || spawnFailed || child.exitCode !== null || child.signalCode) throw new Error('The local Whisper engine stopped while loading.');
        try {
          const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) });
          if (response.ok) { this.origin = origin; this.language = config.language; return; }
        } catch { /* The model is still loading. */ }
        await delay(500);
      }
      throw new Error('Local Whisper took too long to load.');
    } catch (error) {
      child.kill(); if (this.child === child) this.child = null;
      // Do not expose engine logs or recorded words through the UI.
      this.lastFailure = failure;
      throw error;
    }
  }
  async transcribe(wav) {
    const speech = validateAudio(wav);
    if (!speech) return { text: '' };
    if (this.busy) throw Object.assign(new Error('Another local transcription is finishing. Try again in a moment.'), { status: 409 });
    this.busy = true;
    try {
      await this.ensure();
      const form = new FormData();
      form.set('file', new Blob([wav], { type: 'audio/wav' }), 'microphone.wav');
      form.set('response_format', 'json'); form.set('language', this.language); form.set('temperature', '0');
      const response = await fetch(`${this.origin}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error('Local Whisper could not transcribe this recording.');
      const result = await response.json();
      if (typeof result.text !== 'string') throw new Error('Local Whisper returned an invalid transcription.');
      return { text: result.text.trim() };
    } finally { this.busy = false; }
  }
  close() { this.closed = true; this.child?.kill(); this.child = null; this.origin = null; }
}
