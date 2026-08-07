import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const front = join(root, 'AILP', 'front');

function runNpm(args, cwd) {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], {
      cwd,
      stdio: 'inherit',
    });
    return;
  }

  execFileSync('npm', args, { cwd, stdio: 'inherit' });
}

const legacyPublicDirs = [
  'biyoshitsu-owner-hokago-lp',
  'chacha',
  'lifutage-shintokorozawa-lp',
  'marr',
  'resole',
  'site-map',
  'splender',
];

await rm(dist, { recursive: true, force: true });

if (!existsSync(join(front, 'node_modules'))) {
  runNpm(['ci'], front);
}

runNpm(['run', 'build'], front);

await mkdir(dist, { recursive: true });
await cp(join(front, 'dist'), dist, { recursive: true, force: true });

for (const dir of legacyPublicDirs) {
  const source = join(root, dir);
  if (existsSync(source)) {
    await cp(source, join(dist, dir), { recursive: true, force: true });
  }
}
