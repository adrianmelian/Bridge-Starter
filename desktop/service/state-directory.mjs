import path from 'node:path';
import { existsSync } from 'node:fs';

// Keep the existing workspace's chat history in place across the brand change.
export function stateDirectory(repo, explicit) {
  if (explicit) return path.resolve(explicit);
  const current = path.join(repo, '.data');
  const legacy = path.join(repo, '.mrmak');
  if (['sessions.json', 'settings.json'].some(name => existsSync(path.join(current, name)))) return current;
  if (['sessions.json', 'settings.json'].some(name => existsSync(path.join(legacy, name)))) return legacy;
  return current;
}
