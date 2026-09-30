import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { RESOURCES } from './resources.js';
import { ApiError, checkBaseUrl, get } from './client.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Exit codes a script can branch on.
const OK = 0;
const FAILED = 1; // the API or the network said no
const USAGE = 2; // the command itself is wrong
const DENIED = 3; // 401 or 403: fix the key or its scopes

const HELP = `Gaplessly CLI ${version}: read your Gaplessly data as JSON.

Usage
  gaplessly <resource> [options]

Resources
${Object.entries(RESOURCES)
  .map(([name, r]) => `  ${name.padEnd(17)}${r.summary}`)
  .join('\n')}

Options
  --limit <n>        Rows per page, 1 to 200 (default 50)
  --cursor <token>   Continue from a previous page's nextCursor
  --all              Fetch every page and print them as one list
  --from <time>      appointments, reservations: start time on or after
  --to <time>        appointments, reservations: start time before
  --base-url <url>   API origin (default https://gaplessly.com)
  -h, --help         Show this help
  -v, --version      Show the version

Authentication
  Set GAPLESSLY_API_KEY to a key from your dashboard's account menu,
  Developer (https://app.gaplessly.com/developer). A key reads only the
  scopes it was issued with.

Times
  Appointment and reservation times are the venue's own wall-clock time,
  and --from/--to are compared against that clock, not UTC. See
  https://gaplessly.com/docs for the details.

Examples
  gaplessly organization
  gaplessly clients --all > clients.json
  gaplessly appointments --from 2026-10-01T00:00:00 --to 2026-10-02T00:00:00

Docs: https://gaplessly.com/docs`;

/**
 * Run one command. Everything the outside world provides comes in through
 * `io`, so the tests can drive it without a network or a real clock.
 */
export async function main(argv, io = {}) {
  const {
    env = process.env,
    stdout = (s) => process.stdout.write(s),
    stderr = (s) => process.stderr.write(s),
    fetch = globalThis.fetch,
    sleep = (ms) => delay(ms),
  } = io;
  const fail = (code, message) => {
    stderr(`gaplessly: ${message}\n`);
    return code;
  };

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        limit: { type: 'string' },
        cursor: { type: 'string' },
        all: { type: 'boolean' },
        from: { type: 'string' },
        to: { type: 'string' },
        'base-url': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    return fail(USAGE, `${err.message}\nRun "gaplessly --help" for usage.`);
  }
  const { values: opts, positionals } = parsed;

  if (opts.version) {
    stdout(`${version}\n`);
    return OK;
  }
  if (opts.help || positionals.length === 0) {
    stdout(`${HELP}\n`);
    return opts.help ? OK : USAGE;
  }

  const [name, ...extra] = positionals;
  const resource = Object.hasOwn(RESOURCES, name) ? RESOURCES[name] : undefined;
  if (!resource) return fail(USAGE, `unknown resource "${name}". Run "gaplessly --help" for the list.`);
  if (extra.length) return fail(USAGE, `unexpected argument "${extra[0]}".`);
  if (!resource.list && (opts.limit || opts.cursor || opts.all)) {
    return fail(USAGE, `${name} is a single record: --limit, --cursor and --all do not apply.`);
  }
  if (!resource.range && (opts.from || opts.to)) {
    return fail(USAGE, `--from and --to apply only to appointments and reservations.`);
  }
  if (opts.all && opts.cursor) return fail(USAGE, `use --all or --cursor, not both.`);

  const key = env.GAPLESSLY_API_KEY?.trim();
  if (!key) {
    return fail(
      USAGE,
      'set GAPLESSLY_API_KEY to an API key from your dashboard (account menu, Developer: https://app.gaplessly.com/developer).',
    );
  }

  try {
    const origin = checkBaseUrl(opts['base-url'] ?? env.GAPLESSLY_BASE_URL ?? 'https://gaplessly.com');
    const request = { key, userAgent: `gaplessly-cli/${version} (+https://github.com/gaplessly/cli)`, fetch, sleep };
    const url = new URL(resource.path, origin);
    for (const param of ['limit', 'cursor', 'from', 'to']) {
      if (opts[param]) url.searchParams.set(param, opts[param]);
    }

    if (!opts.all) {
      stdout(`${JSON.stringify(await get(url, request), null, 2)}\n`);
      return OK;
    }

    // Keyset paging: nextCursor is null exactly when there is nothing left.
    const data = [];
    for (;;) {
      const page = await get(url, request);
      data.push(...page.data);
      if (!page.nextCursor) break;
      url.searchParams.set('cursor', page.nextCursor);
    }
    stdout(`${JSON.stringify({ data, nextCursor: null }, null, 2)}\n`);
    return OK;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'usage') return fail(USAGE, err.message);
      const denied = err.status === 401 || err.status === 403;
      return fail(denied ? DENIED : FAILED, `${err.status} ${err.code}: ${err.message}`);
    }
    return fail(FAILED, `could not reach the API (${err.cause?.code ?? err.message}).`);
  }
}
