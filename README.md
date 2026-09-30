<a href="https://gaplessly.com/docs"><img src="https://raw.githubusercontent.com/gaplessly/cli/main/.github/assets/banner.png" alt="Gaplessly CLI: command-line client for the Gaplessly booking API" width="100%"></a>

<p align="center">
  <a href="https://www.npmjs.com/package/@gaplessly/cli"><img alt="npm" src="https://img.shields.io/npm/v/%40gaplessly%2Fcli?style=flat-square&color=0d647f"></a>
  <a href="https://github.com/gaplessly/cli/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/gaplessly/cli/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-0d647f?style=flat-square">
  <a href="./LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-0d647f?style=flat-square"></a>
</p>

Read your Gaplessly data from a terminal or a script: clients, appointments, reservations, tables and the rest, as JSON. One command per API endpoint, every page fetched for you, and no dependencies.

## Install

```bash
npm install -g @gaplessly/cli
```

Or run it once without installing:

```bash
npx @gaplessly/cli organization
```

Node 20 or later.

## Authenticate

Create an API key in your Gaplessly dashboard, under the account menu, **Developer** ([app.gaplessly.com/developer](https://app.gaplessly.com/developer)). A key can read only the scopes it was issued with.

```bash
export GAPLESSLY_API_KEY=sk_live_...
```

In PowerShell: `$env:GAPLESSLY_API_KEY = "sk_live_..."`

## Commands

| Command | Returns | Scope |
|---|---|---|
| `gaplessly organization` | Your organization profile | `organization:read` |
| `gaplessly clients` | Client directory | `clients:read` |
| `gaplessly services` | Services you offer | `services:read` |
| `gaplessly providers` | Staff who take appointments | `providers:read` |
| `gaplessly appointments` | Appointments, filterable by start time | `appointments:read` |
| `gaplessly tables` | Tables | `tables:read` |
| `gaplessly service-periods` | Service periods, such as lunch and dinner | `service-periods:read` |
| `gaplessly reservations` | Table reservations, filterable by start time | `reservations:read` |

`services`, `providers` and `appointments` belong to appointment businesses; `tables`, `service-periods` and `reservations` to hospitality venues. Asking for the other kind exits with `403 wrong_vertical`.

## Options

| Option | What it does |
|---|---|
| `--all` | Fetch every page and print them as one list |
| `--limit <n>` | Rows per page, 1 to 200 (default 50) |
| `--cursor <token>` | Continue from a previous page's `nextCursor` |
| `--from <time>` | `appointments`, `reservations`: start time on or after |
| `--to <time>` | `appointments`, `reservations`: start time before |
| `--base-url <url>` | API origin, default `https://gaplessly.com` |

## Examples

```bash
# Every client, into a file
gaplessly clients --all > clients.json

# One day of appointments
gaplessly appointments --from 2026-10-01T00:00:00 --to 2026-10-02T00:00:00

# How many reservations are on the books
gaplessly reservations --all | jq '.data | length'
```

## Output

JSON in the API's own envelope. A list prints `{ "data": [...], "nextCursor": "..." }`, where `nextCursor` is `null` on the last page; with `--all` you get every row and `nextCursor: null`. `organization` prints `{ "data": { ... } }`.

Appointment and reservation times are the **venue's own wall-clock time**, and `--from`/`--to` are compared against that clock, not UTC. The CLI prints times exactly as the API sends them. See the [API reference](https://gaplessly.com/docs) for the details.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | The API or the network failed; the message says which |
| `2` | The command is wrong, or `GAPLESSLY_API_KEY` is not set |
| `3` | The key was refused: invalid, revoked, expired, or missing a scope |

## Rate limits

Each key gets 120 requests a minute by default. On a `429` the CLI waits for the `Retry-After` the API sends and tries again, up to three times.

## Security

- The key is read from `GAPLESSLY_API_KEY` only, never from a flag, so it stays out of your shell history. It is sent only in the `Authorization` header and never printed.
- The CLI refuses to send a key over plain HTTP to anything but your own machine.
- No dependencies and no telemetry.
- Releases are built from this repository by GitHub Actions, with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), and staged: a new version goes live only after a maintainer approves it with two-factor authentication.

Found a security issue? Email [hello@gaplessly.com](mailto:hello@gaplessly.com) rather than opening a public issue.

## Links

- [API reference](https://gaplessly.com/docs) and the [OpenAPI 3.1 document](https://gaplessly.com/openapi.json)
- [MCP server](https://gaplessly.com/docs/mcp) for AI assistants
- [gaplessly.com](https://gaplessly.com)

## Licence

[MIT](./LICENSE)
