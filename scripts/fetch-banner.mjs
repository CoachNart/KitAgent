import { mkdir, access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';

const url = 'https://res.cloudinary.com/qsxm0dge/video/upload/v1790073733/grok_video_2026-09-22-10-45-29.mp4';
const output = resolve('public/banner/kitsetups-banner.mp4');

try {
  await access(output, constants.F_OK);
  console.log('[banner] local asset already present');
  process.exit(0);
} catch {}

console.log('[banner] fetching remote MP4 for this build');
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok) throw new Error(`Banner fetch failed: HTTP ${response.status}`);
const contentType = response.headers.get('content-type') || '';
if (!contentType.includes('video') && !contentType.includes('octet-stream')) {
  throw new Error(`Banner fetch returned unexpected content-type: ${contentType || 'unknown'}`);
}
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length < 100000) throw new Error(`Banner file is unexpectedly small: ${bytes.length} bytes`);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
console.log(`[banner] saved ${bytes.length} bytes to ${output}`);
