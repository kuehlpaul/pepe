<div align="center">

<img src="assets/pepe.svg" alt="Pepe" width="96">

# Pepe

**Your second brain for every AI agent.**

Pepe remembers everything you do with an agent and helps every agent you use remember your decisions. It is a self-hostable, remote [MCP](https://modelcontextprotocol.io) server that gives Claude, Claude Code, Cursor, ChatGPT and any other agent the same durable memory about you. Vendor-independent. Your data, on your own Cloudflare account.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![MCP](https://img.shields.io/badge/protocol-MCP-000000)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[talktopepe.com](https://talktopepe.com) · [Setup guide](https://context.talktopepe.com/setup) · [Self-host](#self-hosting) · [MCP tools](#mcp-tools) · [Contributing](#contributing)

</div>

---

## Why

Every agent you use keeps its own notes about you, and none of them talk to each other. Switch from Claude to Cursor to ChatGPT and you start from zero each time. Pepe is the one place they all remember into: the decisions you made, what you prefer, what went wrong and what you are working on. A lesson learned in one tool applies in every other.

- **Vendor-independent.** Works with any MCP client via OAuth 2.1 or a personal token.
- **User-owned.** Runs on your Cloudflare account. Export or delete everything at any time.
- **Agent-driven setup.** Paste one line into any agent and it configures itself, modeled on [Notion's agent setup prompt](https://developers.notion.com/prompts/setup).
- **Durable, not just a scratchpad.** Memories with supersede history, versioned Markdown documents, reusable skills, and "lessons" (mistakes an agent made with you and what to do instead).
- **Multi-user and isolated.** Invite-only accounts, per-user vector namespaces, every query scoped by `user_id`.

## Quick start

### Use the hosted Pepe

The hosted instance is an invite-only beta. Join the waitlist at https://talktopepe.com. Once you have an account, paste this into any agent:

```
Set up Pepe by following https://context.talktopepe.com/setup
```

The agent connects over MCP, installs custom instructions for when to read and write, creates an Agent Operating Guide, and optionally imports what it already knows about you.

### Connect a client manually

| Client type | How |
|---|---|
| OAuth clients (Claude, Cursor, ChatGPT, …) | Add `https://<your-pepe>/mcp` as a remote MCP server, sign in, approve |
| Header-only clients | Create a token under **Settings → Tokens** and send `Authorization: Bearer pcl_…` |
| Claude Code | `claude mcp add --transport http pepe https://<your-pepe>/mcp` |

## Self-hosting

You need a Cloudflare account with Workers, D1, KV, Vectorize and Workers AI enabled (all available on the free tier).

```bash
git clone https://github.com/kuehlpaul/pepe.git
cd pepe
npm install

# 1. Create the resources and put their names and IDs into wrangler.jsonc
npx wrangler d1 create pepe
npx wrangler kv namespace create OAUTH_KV
npx wrangler vectorize create pepe --dimensions=1024 --metric=cosine

# 2. Set secrets
npx wrangler secret put SESSION_SECRET      # openssl rand -hex 32
npx wrangler secret put CONSENT_SECRET      # openssl rand -hex 32
npx wrangler secret put RESEND_API_KEY      # optional, enables email sending

# 3. Migrate and deploy
npm run db:migrate:remote
npx wrangler deploy
```

Then set `PUBLIC_URL` and `ADMIN_EMAIL` in `wrangler.jsonc`, open `https://<your-pepe>/join` and sign up with the admin email. The first signup with that address needs no invite code and becomes the admin account.

### Configuration

| Name | Where | Purpose |
|---|---|---|
| `PUBLIC_URL` | `wrangler.jsonc` vars | Public base URL of the app, no trailing slash |
| `LANDING_HOST` | `wrangler.jsonc` vars | Optional separate host for the landing page and waitlist. Empty = landing lives on `PUBLIC_URL` |
| `ADMIN_EMAIL` | `wrangler.jsonc` vars | May sign up once without an invite and becomes admin |
| `EMBEDDING_MODEL` | `wrangler.jsonc` vars | Workers AI model for embeddings, default `@cf/baai/bge-m3` |
| `EMAIL_FROM` | `wrangler.jsonc` vars | Optional sender for invite and reset emails |
| `SESSION_SECRET` | secret | Signs browser sessions |
| `CONSENT_SECRET` | secret | Signs the OAuth consent step |
| `RESEND_API_KEY` | secret | Optional. Without it, invite and reset links are shown in the admin panel to copy manually |

### Upgrading an existing deployment

```bash
git pull
npm install
npm run db:migrate:remote
npx wrangler deploy
```

Migrations are additive. `0003` introduces accounts and tags pre-existing single-owner data as `owner`; the `ADMIN_EMAIL` account inherits it on first signup, re-embeds it into its own namespace, and existing OAuth grants keep working. The old `OWNER_PASSWORD` secret is no longer used and can be deleted.

## How it works

```
┌───────────┐  ┌────────────┐  ┌────────┐  ┌─────────┐
│  Claude   │  │ Claude Code│  │ Cursor │  │ ChatGPT │   … any MCP client
└─────┬─────┘  └──────┬─────┘  └───┬────┘  └────┬────┘
      └───────────────┴────────────┴─────────────┘
                             │  OAuth 2.1 or pcl_… token
                             ▼
                  ┌───────────────────────┐
                  │   Cloudflare Worker   │  /mcp  · /setup · /ui · /admin
                  └──┬──────┬──────┬──────┘
                     │      │      │
                  ┌──▼─┐ ┌──▼──┐ ┌─▼────────┐
                  │ D1 │ │ KV  │ │Vectorize │ + Workers AI embeddings
                  └────┘ └─────┘ └──────────┘
```

| Concern | Implementation |
|---|---|
| MCP endpoint | Worker with `createMcpHandler` (stateless, MCP SDK v2), server name `pepe` |
| Auth | `@cloudflare/workers-oauth-provider` (OAuth 2.1, CIMD + DCR), personal `pcl_…` tokens, PBKDF2 passwords |
| Storage | D1 for accounts, waitlist, invites, memories, documents, skills, lessons, settings, activity |
| Semantic search | Vectorize (one namespace per user) + Workers AI `@cf/baai/bge-m3`, keyword fallback when unavailable |
| OAuth grants | KV `OAUTH_KV` |
| Daily loop | Cron `0 6 * * *` writes a per-user "Daily maintenance report" (duplicate detection, housekeeping) for accounts with activity |

### Routes

| Path | Who | What |
|---|---|---|
| `/` | public | Landing page and waitlist form (served on `LANDING_HOST` when set) |
| `/setup`, `/setup.md` | public | The setup guide agents follow end to end (contains no personal data) |
| `/join?code=…` | invited | Create an account with an invite code |
| `/login`, `/logout`, `/forgot`, `/reset` | users | Email + password sessions, password reset |
| `/ui/…` | users | Memories, documents, skills, lessons, settings (tokens, connected apps, export, delete account), activity |
| `/admin` | admins | Turn waitlist entries into invites, create or revoke invites, enable, disable or delete accounts |
| `/mcp` | agents | MCP endpoint. Every token is bound to exactly one account |

## MCP tools

**Read**

| Tool | Description |
|---|---|
| `get_context` | Profile, operating guide, exclusions, active lessons, recent memories and documents, available skills. Call once per session. |
| `search` | Semantic + keyword search across memories, documents, skills and lessons |
| `get_memory` | One memory by id, including source, dates and supersede history |
| `get_document` | Full Markdown of a document, optionally an older revision |
| `get_document_history` | Earlier versions of a document and who wrote them |
| `list_skills` / `get_skill` | Names of enabled skills, and the full instructions of one |

**Write** (every connected agent gets this; the web UI itself is read-only apart from deleting)

| Tool | Description |
|---|---|
| `remember` | Save one durable memory. Near-duplicates are detected and returned instead of saved |
| `update_memory` | Edit in place, supersede (keeps history) or archive a memory |
| `forget` | Permanently delete a memory and block the same content from coming back |
| `save_document` | Create or update a versioned Markdown document |
| `add_lesson` / `update_lesson` | Record what went wrong with this user and what every agent should do instead |
| `save_skill` | Create or update a reusable `SKILL.md`-style skill |
| `save_about` | Update the short "About me" profile |
| `save_guide` | Create or replace the Agent Operating Guide |
| `add_exclusion` / `remove_exclusion` | Rules for what must never be stored; shown to every agent on connect |

## Security and access control

- **Waitlist entries grant nothing.** An admin turns one into a single-use invite bound to that email (14 days). Free-form invites with N uses and an optional expiry exist too.
- **Accounts are isolated.** Every table carries `user_id`, every query in `src/store.ts` filters on it, and vectors live in a per-user Vectorize namespace.
- **Disabling** an account kills its sessions, tokens and OAuth grants immediately and is checked on every MCP request. **Deleting** removes all rows, vectors and grants. Changing a password signs out every other session.
- **Legacy grants** from before accounts existed are bound once, at claim time, to the account that adopted the single-owner data, and never re-resolved from roles.
- Independently audited for cross-account access on 2026-11-07. Findings were fixed in migration `0004` and the matching code.

Found a vulnerability? Please open a private security advisory on GitHub instead of a public issue.

## Development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in the secrets
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

Workers AI and Vectorize have no local emulation and need a remote connection (`account_id` in `wrangler.jsonc`). Without them, search falls back to keyword matching.

| Script | What it does |
|---|---|
| `npm run dev` | Local Worker with hot reload |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run types` | Regenerate `worker-configuration.d.ts` from the bindings |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations to the `DB` binding |
| `npm run deploy` | Deploy to Cloudflare |

### Project layout

```
src/
  index.ts        Router, OAuth provider wiring, cron entry
  mcp.ts          MCP server and tool definitions
  store.ts        All D1 + Vectorize access, bound to one user
  accounts.ts     Users, passwords, sessions, waitlist, invites, personal tokens
  auth.ts         OAuth 2.1 server, token auth, login / join / reset pages
  admin.ts        Admin panel
  ui.ts           User-facing web app
  setup.ts        /setup guide content served to agents
  setup-page.ts   Docs-style HTML shell for /setup
  landing.ts      Public landing page and waitlist
  daily.ts        Daily maintenance report (cron)
  html.ts         Shared HTML helpers and layout
  theme.ts        Design tokens, Pepe logo, repo URL
migrations/       D1 schema, applied in order
```

## Contributing

Issues and pull requests are welcome.

1. Fork the repo and create a branch from `main`.
2. Run `npm run typecheck` before opening a PR.
3. Schema changes go into a new numbered file in `migrations/`. Never edit an applied migration.
4. Anything that touches `src/store.ts` must keep filtering on `user_id`.

For larger changes, open an issue first so we can discuss the approach.

## License

[MIT](LICENSE) © 2026 Paul Kühl
