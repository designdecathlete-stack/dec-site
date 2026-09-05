import { cp, mkdir, rm } from 'node:fs/promises';
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
  'chacha-shinkoiwa',
  'eyebee-morioka-recruit-lp',
  'lifutage-shintokorozawa-lp',
  'marr',
  'resole',
  'site-map',
  'splender',
];

const appFrontRoot = join(root, 'AILP', 'front');
const appFrontFiles = [
  'index.html',
  'styles.css',
  'overrides.css',
  'production.css',
  'client-admin.css',
  'client-portal.css',
  'headquarters.css',
  'lp-categories.css',
  'lp-metrics.css',
  'detail-interactions.css',
  'detail-tabs-override.css',
  'ga-analysis-dashboard.css',
  'improvement-demo.css',
  'summary-dashboard.css',
  'detail-spec.css',
  'analysis-mock.css',
  'compare-preview.css',
  'foc-improvement.css',
  'foc-current.css',
  'improvement-axes.css',
  'section-parts.css',
  'version-management.css',
  'ai-improvement-plan.css',
  'common-gtm-settings.css',
  'appeal-lp-creation.css',
  'general-improvement.css',
  'initial-lp-setup.css',
  'initial-lp-workflow.css',
  'initial-phase-production.css',
  'customer-publish-workflow.css',
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

for (const file of appFrontFiles) {
  await cp(join(appFrontRoot, file), join(maintenanceDir, file), { force: true });
}

await cp(join(appFrontRoot, 'public'), join(maintenanceDir, 'public'), { recursive: true, force: true });
