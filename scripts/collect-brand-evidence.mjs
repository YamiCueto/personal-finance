import { mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/branding/evidence');
await mkdir(output, { recursive: true });
const cases = await readdir(path.join(root, 'test-results'));
let count = 0;
for (const viewport of ['desktop-1440', 'tablet-768', 'mobile-360', 'mobile-390', 'mobile-430', 'webkit-mobile-390']) {
  const folder = cases.find(name => name.startsWith('redesign-') && name.endsWith(`-${viewport}`) && (viewport.startsWith('webkit') || !name.includes('webkit')));
  if (!folder) continue;
  const source = path.join(root, 'test-results', folder);
  for (const file of await readdir(source)) {
    if (!['dashboard-light.png', 'dashboard-dark.png', 'login-light.png', 'login-dark.png', 'sidebar-compact.png', 'cards.png', 'simulators.png'].includes(file)) continue;
    await copyFile(path.join(source, file), path.join(output, `${viewport}-${file}`));
    count++;
  }
}
process.stdout.write(`${count} BRAVISO screenshots copied to docs/branding/evidence.\n`);
