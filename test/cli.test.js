import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { main } from '../src/cli.js';
import { RESOURCES } from '../src/resources.js';

const KEY = 'sk_live_0123456789abcdef_testsecretthatmustneverbeprinted';

// A stand-in for the API: every request is recorded, and each test decides the
// response through `respond`.
let server;
let base;
let respond;
const seen = [];

before(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization, ua: req.headers['user-agent'] });
    const { status = 200, body = {}, headers = {} } = respond(new URL(req.url, 'http://x'));
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function run(args, { env = { GAPLESSLY_API_KEY: KEY }, sleeps = [] } = {}) {
  let out = '';
  let err = '';
  seen.length = 0;
  const code = await main([...args, '--base-url', base], {
    env,
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    sleep: async (ms) => sleeps.push(ms),
  });
  return { code, out, err };
}

test('reads a single record, sending the key as a Bearer header', async () => {
  respond = () => ({ body: { data: { name: 'Halcyon' } } });
  const { code, out } = await run(['organization']);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out), { data: { name: 'Halcyon' } });
  assert.equal(seen[0].url, '/api/v1/organization');
  assert.equal(seen[0].auth, `Bearer ${KEY}`);
  assert.match(seen[0].ua, /^gaplessly-cli\/\d+\.\d+\.\d+/);
});

test('--all follows nextCursor until it is null', async () => {
  respond = (url) =>
    url.searchParams.get('cursor') === 'page2'
      ? { body: { data: [{ id: 3 }], nextCursor: null } }
      : { body: { data: [{ id: 1 }, { id: 2 }], nextCursor: 'page2' } };
  const { code, out } = await run(['clients', '--all', '--limit', '2']);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out), { data: [{ id: 1 }, { id: 2 }, { id: 3 }], nextCursor: null });
  assert.deepEqual(
    seen.map((r) => r.url),
    ['/api/v1/clients?limit=2', '/api/v1/clients?limit=2&cursor=page2'],
  );
});

test('passes --from and --to through for a time-filtered list', async () => {
  respond = () => ({ body: { data: [], nextCursor: null } });
  const { code } = await run(['appointments', '--from', '2026-10-01T00:00:00', '--to', '2026-10-02T00:00:00']);
  assert.equal(code, 0);
  const url = new URL(seen[0].url, 'http://x');
  assert.equal(url.searchParams.get('from'), '2026-10-01T00:00:00');
  assert.equal(url.searchParams.get('to'), '2026-10-02T00:00:00');
});

test('a 429 waits for Retry-After, then retries', async () => {
  let calls = 0;
  respond = () =>
    ++calls === 1
      ? { status: 429, headers: { 'retry-after': '7' }, body: { error: 'Rate limit exceeded', code: 'rate_limited' } }
      : { body: { data: [], nextCursor: null } };
  const sleeps = [];
  const { code } = await run(['tables'], { sleeps });
  assert.equal(code, 0);
  assert.deepEqual(sleeps, [7000]);
  assert.equal(seen.length, 2);
});

test('gives up after three retries and says why', async () => {
  respond = () => ({ status: 429, headers: { 'retry-after': '1' }, body: { error: 'Rate limit exceeded', code: 'rate_limited' } });
  const { code, err } = await run(['tables']);
  assert.equal(code, 1);
  assert.equal(seen.length, 4);
  assert.match(err, /429 rate_limited/);
});

test('a 401 exits 3 with the API code, and never prints the key', async () => {
  respond = () => ({ status: 401, body: { error: 'That API key is not valid.', code: 'invalid_key' } });
  const { code, out, err } = await run(['clients']);
  assert.equal(code, 3);
  assert.match(err, /401 invalid_key: That API key is not valid\./);
  assert.ok(!out.includes(KEY) && !err.includes(KEY), 'the key leaked into output');
});

test('a 403 missing scope also exits 3', async () => {
  respond = () => ({ status: 403, body: { error: 'This API key is missing the "tables:read" scope.', code: 'insufficient_scope' } });
  const { code, err } = await run(['tables']);
  assert.equal(code, 3);
  assert.match(err, /insufficient_scope/);
});

test('refuses to send a key over plain HTTP to another machine', async () => {
  let out = '';
  let err = '';
  const code = await main(['clients', '--base-url', 'http://example.com'], {
    env: { GAPLESSLY_API_KEY: KEY },
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    fetch: () => assert.fail('must not make a request'),
  });
  assert.equal(code, 2);
  assert.match(err, /use https/);
});

test('usage errors exit 2 without calling the API', async () => {
  respond = () => assert.fail('must not make a request');
  assert.equal((await run(['clients'], { env: {} })).code, 2, 'no key');
  assert.equal((await run(['bookings'])).code, 2, 'unknown resource');
  assert.equal((await run(['clients', '--from', '2026-10-01'])).code, 2, '--from on an unfiltered list');
  assert.equal((await run(['organization', '--all'])).code, 2, '--all on a single record');
  assert.equal((await run(['clients', '--all', '--cursor', 'x'])).code, 2, '--all with --cursor');
  assert.equal((await run(['clients', '--nope'])).code, 2, 'unknown flag');
});

test('--help lists every resource', async () => {
  const { code, out } = await run(['--help']);
  assert.equal(code, 0);
  for (const name of Object.keys(RESOURCES)) assert.ok(out.includes(name), `help is missing ${name}`);
});
