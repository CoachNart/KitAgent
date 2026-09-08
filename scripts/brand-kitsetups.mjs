import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const replacements = [
  [/KitAgent/g, 'KitSetups'],
  [/KITAGENT/g, 'KITSETUPS'],
  [/kitagent-logo\.svg/g, 'kitsetups-logo.svg'],
  [/kitagent/g, 'kitsetups'],
];

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else {
      try {
        const source = await readFile(file, 'utf8');
        let output = source;
        for (const [pattern, replacement] of replacements) output = output.replace(pattern, replacement);
        if (output !== source) await writeFile(file, output, 'utf8');
      } catch {}
    }
  }
}

await walk(root);

const messagingWorker = path.join(root, 'firebase-messaging-sw.js');
try {
  let worker = await readFile(messagingWorker, 'utf8');
  const env = {
    '__VITE_FIREBASE_API_KEY__': process.env.VITE_FIREBASE_API_KEY || '',
    '__VITE_FIREBASE_AUTH_DOMAIN__': process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    '__VITE_FIREBASE_PROJECT_ID__': process.env.VITE_FIREBASE_PROJECT_ID || '',
    '__VITE_FIREBASE_STORAGE_BUCKET__': process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    '__VITE_FIREBASE_MESSAGING_SENDER_ID__': process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    '__VITE_FIREBASE_APP_ID__': process.env.VITE_FIREBASE_APP_ID || '',
  };
  for (const [placeholder, value] of Object.entries(env)) worker = worker.replaceAll(placeholder, value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  await writeFile(messagingWorker, worker, 'utf8');
} catch {}

console.log('KitSetups branding and push worker configuration applied to production build.');
