# Context Layer

One remote MCP server on Cloudflare that gives every agent a person uses (Claude, Claude Code, Cursor, ChatGPT, …) the same durable memory about them. Vendor-independent, user-owned data. Invite-only product: a public waitlist, an admin panel that hands out invites, isolated accounts.

Open source under the MIT license. Use the hosted version at https://context-layer.winter-limit-1658.workers.dev (invite-only beta, join the waitlist) or self-host it on your own Cloudflare account, see [Deploy](#deploy--upgrade).

Modeled on [Notion’s agent setup prompt](https://developers.notion.com/prompts/setup): a user shares `/setup` with an agent; it connects MCP, installs **custom instructions** (when to read/write), creates an Agent Operating Guide, and optionally imports context + a daily loop.

## Product surface

| Path | Who | What |
|---|---|---|
| `/` | public | Landing page + waitlist form (`POST /waitlist`) |
| `/join?code=…` | invited | Create an account. Only valid invite codes work; the `ADMIN_EMAIL` account may bootstrap once without a code |
| `/login`, `/logout`, `/forgot`, `/reset` | users | Email + password sessions, password reset links |
| `/ui/…` | users | Memories, documents, skills, lessons, settings (tokens, connected apps, export, delete account), activity |
| `/admin` | admins | Waitlist → invite, create/revoke invites, enable/disable/delete accounts, reset links |
| `/setup`, `/setup.md` | public | Setup guide agents follow end-to-end (no personal data) |
| `/mcp` | agents | MCP endpoint, OAuth 2.1 or personal token; every token is bound to one account |

## Access control

- **Waitlist** entries grant nothing. In `/admin` the owner turns one into a single-use invite bound to that email (14 days). Free-form invites (any email, N uses, optional expiry) are possible too.
- **Accounts** are isolated: every table carries `user_id`, every query in `src/store.ts` filters on it, and vectors live in a per-user Vectorize namespace.
- **Disabling** an account kills its sessions, tokens and OAuth grants immediately (checked on every MCP request). **Deleting** removes all rows, vectors and OAuth grants. Changing or resetting a password signs out every other session.
- **Legacy grants** (OAuth connections approved before accounts existed) are bound once, at claim time, to the account that adopted the single-owner data (`instance.legacy_owner_user_id`), never re-resolved from roles.
- Independently audited for cross-account access (2026-11-07); findings fixed in migration 0004 and the matching code.
- **Email sending** is optional (`RESEND_API_KEY` secret + `EMAIL_FROM` var). Without it, invite and reset links are shown in the admin panel to copy and send manually.

## Stack

| Concern | Cloudflare |
|---|---|
| MCP endpoint `/mcp` | Worker, `createMcpHandler` (stateless, MCP SDK v2) |
| Auth | `@cloudflare/workers-oauth-provider` (OAuth 2.1, CIMD + DCR) + personal `pcl_…` tokens + PBKDF2 passwords |
| Accounts, waitlist, invites, memories, documents, skills, settings, activity | D1 |
| Semantic search | Vectorize (one namespace per user) + Workers AI `@cf/baai/bge-m3`, keyword fallback |
| OAuth grants | KV `OAUTH_KV` |
| Daily loop | Cron `0 6 * * *` → per-user "Daily maintenance report" (only for accounts with activity) |

## MCP tools

Read: `get_context`, `search`, `get_memory`, `get_document`, `get_document_history`, `list_skills`, `get_skill`
Write (scope `mcp:write`): `remember`, `update_memory`, `forget`, `save_document`, `add_lesson`, `update_lesson`, `save_skill`, `save_about`, `save_guide`

## Configuration

`wrangler.jsonc` vars: `PUBLIC_URL`, `EMBEDDING_MODEL`, `ADMIN_EMAIL` (bootstrap admin), `EMAIL_FROM` (optional).
Secrets (`wrangler secret put` / `.dev.vars`): `SESSION_SECRET`, `CONSENT_SECRET`, optional `RESEND_API_KEY`.

## Deploy / upgrade

```bash
npm install
npm run db:migrate:remote      # 0003 adds accounts (existing data tagged 'owner'), 0004 hardening
npx wrangler deploy
```

Then open `/join`, sign up with `ADMIN_EMAIL` (no code needed the first time). That account becomes admin, inherits all pre-existing data, re-embeds it into its namespace, and existing OAuth grants keep working. The old `OWNER_PASSWORD` secret is no longer used and can be deleted.

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in secrets
npm run db:migrate:local
npx wrangler dev
```

AI + Vectorize need a remote connection (`account_id` in `wrangler.jsonc`). Without them search falls back to keyword matching.

## Connect a client

Preferred: paste `Set up my Personal Context Layer by following https://<worker>/setup` into any agent and let it drive.

Manual:

- OAuth clients: add `https://<worker>/mcp` as a remote MCP server, sign in, approve.
- Header-only clients: create a token under Settings → `Authorization: Bearer pcl_…`.
- Claude Code: `claude mcp add --transport http context https://<worker>/mcp`

## License

MIT, see [LICENSE](LICENSE).
