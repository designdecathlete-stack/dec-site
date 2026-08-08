import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputArgIndex = process.argv.indexOf('--output');
const dist = outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
  ? join(root, process.argv[outputArgIndex + 1])
  : join(root, 'dist');

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
await mkdir(dist, { recursive: true });

for (const dir of legacyPublicDirs) {
  const source = join(root, dir);
  if (existsSync(source)) {
    await cp(source, join(dist, dir), { recursive: true, force: true });
  }
}

const maintenanceDir = join(dist, 'ailp-management');
await mkdir(maintenanceDir, { recursive: true });
await writeFile(
  join(maintenanceDir, 'index.html'),
  `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>AILP Management | メンテナンス中</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f5f7fb;
      color: #172033;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif;
    }
    main {
      width: min(560px, calc(100% - 40px));
      padding: 40px;
      background: #fff;
      border: 1px solid #dce3ef;
      border-radius: 8px;
      box-shadow: 0 16px 40px rgba(23, 32, 51, 0.08);
      text-align: center;
    }
    h1 {
      margin: 0 0 16px;
      font-size: 28px;
      line-height: 1.3;
    }
    p {
      margin: 0;
      color: #5f6b7a;
      font-size: 16px;
      line-height: 1.8;
    }
  </style>
</head>
<body>
  <main>
    <h1>AILP Management</h1>
    <p>メンテナンス中です。</p>
  </main>
</body>
</html>
`,
  'utf8',
);
