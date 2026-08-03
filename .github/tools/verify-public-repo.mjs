import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(await fs.readFile(path.join(root, 'catalog.json'), 'utf8'));
const checksums = JSON.parse(await fs.readFile(path.join(root, 'checksums.json'), 'utf8'));
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const metadata = (text, key) => text.match(new RegExp(`^// @${key}\\s+(.+)$`, 'm'))?.[1]?.trim();

for (const [relative, expected] of Object.entries(checksums.files || checksums)) {
  const bytes = await fs.readFile(path.join(root, relative));
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`Checksum mismatch: ${relative}`);
}

for (const entry of catalog.scripts || []) {
  const base = path.join(root, 'scripts', entry.id);
  const user = await fs.readFile(path.join(base, `${entry.id}.user.js`), 'utf8');
  const meta = await fs.readFile(path.join(base, `${entry.id}.meta.js`), 'utf8');
  const manifest = JSON.parse(await fs.readFile(path.join(base, 'manifest.json'), 'utf8'));
  if (metadata(user, 'version') !== entry.version || metadata(meta, 'version') !== entry.version) throw new Error(`${entry.id}: version mismatch`);
  if (metadata(user, 'license') !== 'PolyForm-Noncommercial-1.0.0') throw new Error(`${entry.id}: license mismatch`);
  if (manifest.sha256 !== sha256(user) || entry.sha256 !== manifest.sha256) throw new Error(`${entry.id}: manifest/catalog hash mismatch`);
  const immutable = await fs.readFile(path.join(base, 'versions', entry.version, `${entry.id}.user.js`), 'utf8');
  if (immutable !== user) throw new Error(`${entry.id}: stable and immutable artifacts differ`);
}
console.log(`Verified ${catalog.scripts?.length || 0} published userscript(s).`);
