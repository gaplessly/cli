// Fails when the CLI and the live API disagree: an /api/v1 endpoint with no
// command, a command for an endpoint that is gone, or a list whose from/to
// filters changed. Runs in CI against https://gaplessly.com/openapi.json.
import assert from 'node:assert/strict';
import { RESOURCES } from '../src/resources.js';

const res = await fetch(process.env.GAPLESSLY_OPENAPI_URL ?? 'https://gaplessly.com/openapi.json');
assert.ok(res.ok, `could not fetch the OpenAPI document: ${res.status}`);
const spec = await res.json();

const live = Object.entries(spec.paths).filter(([path, item]) => path.startsWith('/api/v1/') && item.get);
const ours = new Map(Object.values(RESOURCES).map((r) => [r.path, r]));

for (const [path, item] of live) {
  const resource = ours.get(path);
  assert.ok(resource, `${path} is in the API but has no command in src/resources.js`);
  const params = new Set((item.get.parameters ?? []).map((p) => p.name));
  assert.equal(resource.list, params.has('cursor'), `${path}: list flag disagrees with the API`);
  assert.equal(Boolean(resource.range), params.has('from') && params.has('to'), `${path}: --from/--to disagree with the API`);
}
for (const path of ours.keys()) {
  assert.ok(live.some(([p]) => p === path), `${path} has a command but is no longer in the API`);
}
console.log(`spec check passed: ${live.length} endpoints, all covered`);
