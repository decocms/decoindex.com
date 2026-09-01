# Publishing decoindex: deploy + directory submission

Handoff for whoever has Cloudflare access (Gui, as of this writing — nobody
else on this had it during the PR that added `/mcp`). Two independent jobs:
get this code live, then (optionally, separately) list it publicly.

## 0. Read this first: production has already drifted from git

`decoindex.com` today runs code that **does not match `main`**. Confirmed by
probing the live endpoints (no Cloudflare access was available to diff the
actual deployed script):

| | `main` (this repo, incl. PR #1) | Live `decoindex.com` right now |
|---|---|---|
| `/mcp` | public, no auth | **requires auth** — 401 with `{"error":{"code":-32001,"message":"Unauthorized. Send Authorization: Bearer <token>, an x-mcp-auth header, or ?token=<token>."}}` |
| `/llms.txt` | only per-domain (`/{domain}/llms.txt`) | **exists at the root** too — `/` 302s there |
| catalog query params | `?limit=`/`?offset=` on `/products.json` | **`?page=`, `?sort=price_asc\|price_desc\|name_asc\|name_desc\|discount\|new`** on any path |

None of this is in any commit, any branch, or any other `decoindex`-named repo
in any org we can see (checked). No GitHub Deployment / check-run / commit
status exists on this repo either — there is **no CI/CD** wired up despite
what the README's "connect the repo to Workers Builds" line implies; every
prior deploy was a direct `wrangler deploy` (or a dashboard Quick Edit) that
was never committed back. That matches this repo's own `CLAUDE.md` loop
("implement → deploy → record a memory") — deploy was never gated on a
commit.

**Before running `npm run deploy` from this branch:**

1. Pull the actual live source so nothing gets silently deleted:
   ```bash
   npx wrangler login
   npx wrangler deployments list          # who deployed what, when
   # Cloudflare dashboard → Workers & Pages → decoindex → Quick Edit
   # (or "Download" if offered) to get the live src/ tree
   ```
2. Port the three drifted pieces (auth on `/mcp`, root `/llms.txt`, `sort`/
   `page`) into this branch as their own commit(s) — or explicitly decide
   they were experiments and can be dropped. **Either way, this is a decision
   for a human, not something to deploy over silently.**
3. **The auth decision matters for this PR specifically:** `src/server/mcp.ts`
   in this PR is deliberately public/no-auth (matches the original written
   invariants: read-only, public data, no login). If production's existing
   `/mcp` auth is staying, `mcp.ts` needs a `MCP_AUTH_TOKEN` secret check
   added before merge-forward, and the ChatGPT/Claude install instructions in
   the README need a token step. If the auth was a one-off experiment,
   dropping it and shipping this PR's public version is the simpler and
   already-tested path — pick one, don't ship half of each.

## 1. Deploy (once reconciled)

```bash
cp .dev.vars.example .dev.vars   # only if not already deployed once
npm run db:remote                # idempotent — applies any new migrations
npm run deploy
```

Confirm the resource IDs in `wrangler.jsonc` are real, not `REPLACE_ME`
(`d1_databases[0].database_id`, `kv_namespaces[0].id`) — `wrangler deploy`
will fail loudly if not, so this isn't a silent-failure risk, just a
first-deploy checklist item.

Then smoke-test against the real domain (same script this PR added):

```bash
npm run smoke -- https://decoindex.com
```

## 2. ChatGPT — works immediately, no submission needed

Developer mode doesn't require any review. Once deployed:

1. ChatGPT → Settings → Apps & Connectors → Advanced → enable **Developer
   mode**.
2. Create app → MCP server URL `https://decoindex.com/mcp` → Create.
3. Confirm the model calls `search_storefront` and the widget renders.

This alone satisfies "usable in ChatGPT" — everything past here is about
**public discoverability** (showing up in ChatGPT's app picker for users who
haven't manually added the connector), which is a separate, reviewed step:

### Submitting to the public Plugin directory (optional, later)

- Portal: developer account → Plugin directory submission (see
  `developers.openai.com/plugins`, "Publishing requirements" — an MCP server
  passing "MCP server review requirements" plus optional-UI review).
- Blocking items this repo is missing for that review specifically (not for
  developer-mode use):
  - **90-day event pruning cron** — `CLAUDE.md` already lists this as "not
    built yet." `/privacy` (added in PR #1) currently *describes* a retention
    policy the code doesn't enforce yet. Build the cron before submitting,
    not before deploying.
  - An app icon/logo (none exists yet in this repo).
- Not blocking: auth. The server is intentionally public/read-only; Apps SDK
  review only requires auth when a tool reads private data or acts on a
  user's behalf, neither of which applies here — *unless* the reconciliation
  in §0 keeps the token-gated `/mcp` production had, in which case document
  the auth flow for reviewers too.

## 3. Claude Code — already installable, no submission needed

Anyone can install today, from any machine, no review:

```
/plugin marketplace add decocms/decoindex.com
/plugin install decoindex@decoindex
```

This works because the repo *is* its own marketplace
(`.claude-plugin/marketplace.json`, `source: "./"` — same pattern as
`decocms/parity`). As with ChatGPT, everything past here is about **public
discoverability** in Anthropic's directories, not functionality.

### Submitting to Anthropic's plugin directories (optional, later)

Two separate catalogs exist:

- **`anthropics/claude-plugins-official`** — curated, ships enabled by
  default in every Claude Code install. Higher bar, invite/curation-driven.
- **`anthropics/claude-plugins-community`** — third-party, submission-gated.

For either: submit via **clau.de/plugin-directory-submission** — do **not**
open a PR against `anthropics/claude-plugins-community` directly, it's a
read-only mirror and PRs there are auto-closed. The form asks for the plugin
repo (`decocms/decoindex.com`, already has `.claude-plugin/plugin.json` +
`marketplace.json` in place) and runs it through Anthropic's automated
security scan + manual review before it's synced into the community catalog.

No extra code work needed on our side for this one — the repo already has
everything the submission form asks for (`plugin.json` metadata, MIT
license, a working `.mcp.json`, a skill). This can be submitted independently
of the ChatGPT directory decision above.
