import fs from 'node:fs';
import path from 'node:path';

export const loadDotEnv = (rootDir = process.cwd()) => {
  const envPath = path.resolve(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split('=');
    if (!key) continue;
    const value = rest.join('=').trim();
    if (value === '') continue;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};
