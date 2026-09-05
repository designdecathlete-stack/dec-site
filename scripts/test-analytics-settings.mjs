import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolveAnalyticsSettings as resolve } from '../AILP/supabase/functions/_shared/analytics-settings.ts';

const legacy = { clients: { ga4_property_id: '550041717' }, ga4_page_path: '/marr/' };
assert.deepEqual(resolve(legacy), {
  ga4_property_id: '550041717', ga4_page_path: '/marr/', ga4_measurement_id: null,
  gtm_container_id: null, is_active: true,
});
const a = resolve({ ...legacy, lp_analytics_settings: { ga4_property_id: '222', ga4_page_path: '/a/' } });
const b = resolve({ ...legacy, lp_analytics_settings: [{ ga4_property_id: '333', ga4_page_path: '/b/' }] });
assert.equal(a.ga4_property_id, '222');
assert.equal(a.ga4_page_path, '/a/');
assert.equal(b.ga4_property_id, '333');
assert.equal(b.ga4_page_path, '/b/');
assert.equal(resolve({ ...legacy, lp_analytics_settings: { ga4_property_id: '  ', ga4_page_path: '/other/' } }).ga4_property_id, '550041717');
assert.equal(resolve({ ...legacy, lp_analytics_settings: { is_active: false } }).is_active, false);
assert.equal(resolve({ clients: [], lp_analytics_settings: [] }).ga4_property_id, null);
assert.equal(resolve({ ga4_page_path: ' ' }).ga4_page_path, null);

for (const file of ['_shared/analytics-settings.ts', 'ga4-sync/index.ts', 'ga4-property-discovery/index.ts']) {
  const source = readFileSync(new URL('../AILP/supabase/functions/' + file, import.meta.url), 'utf8');
  const check = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: stripTypeScriptTypes(source), encoding: 'utf8',
  });
  assert.equal(check.status, 0, file + ': ' + check.stderr);
}

// Every local stylesheet referenced by the management entry point must be copied byte-for-byte.
const html = readFileSync(new URL('../AILP/front/index.html', import.meta.url), 'utf8');
const css = [...html.matchAll(/href="\.\/([^"?]+\.css)(?:\?[^" ]*)?"/g)].map(match => match[1]);
for (const file of css) {
  assert.deepEqual(readFileSync(new URL('../dist/ailp-management/' + file, import.meta.url)),
    readFileSync(new URL('../AILP/front/' + file, import.meta.url)), file);
}
console.log(`PASS: LP priority, legacy fallback, disabled/missing settings, ${css.length} published stylesheets`);
