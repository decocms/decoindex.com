# Publishing decoindex: deploy + directory submission

Handoff for whoever has Cloudflare access (Gui, as of this writing — nobody
else on this had it during the PR that added `/mcp`). Two independent jobs:
get this code live, then (optionally, separately) list it publicly.

## 0. The drift described here has been resolved — read this for the history

This section used to say `decoindex.com` ran code that matched no commit on any
branch. That was correct at the time and the diagnosis was right, but the cause
was not missing code: it was a **local branch that had never been pushed**
(`vibegui/agent-first-vtex-shopify-proxy`, 28 commits). The live Worker was
running that branch the whole time.

It has since been merged. The three "drifted" behaviours were never experiments:

| Behaviour | Status |
|---|---|
| `/mcp` requires auth | **Was intended** — it was the operator control plane. Since superseded: `/mcp` is now two tiers, public read tools with no token plus the control plane with one. |
| root `/llms.txt` exists, `/` 302s to it for agents | **Intended.** `/{domain}/llms.txt` now 308s to `/{domain}` — one index per storefront. |
| `?page=` / `?sort=price_asc\|…` on any path | **Intended**, and the replacement for `?limit=`/`?offset=` on `/products.json`, which no longer exists. |

The larger finding stands: the whole DO-plus-ingest-pipeline architecture that
`main` documented was never deployed. What ships is the bounded read-through
resolver. `README.md` and `CLAUDE.md` now describe that, and `git log` is the
source of truth again.

**Still true and still worth fixing: there is no CI/CD.** No GitHub Deployment,
check-run or commit status exists on this repo. Every deploy has been a direct
`wrangler deploy`. The `CLAUDE.md` loop ("implement → deploy → record a memory")
never gated deploy on a commit, which is exactly how a local branch ended up
being production. Wiring Workers Builds to `main` is the durable fix.

**Before running `npm run deploy`:** confirm `git log` matches what is live
(`npx wrangler deployments list`), and deploy from `main`, not from a workspace
branch.

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
3. Confirm the model calls `search_storefront` and gets a product back. No
   widget yet — `render/widget.ts` exists but is not registered as a `ui://`
   resource, so results render as text. Wiring it is a separate task.

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
- Not blocking: auth. Resolved — the public tier of `/mcp` is unauthenticated
  and read-only, which is what Apps SDK review asks for. It only requires auth
  when a tool reads private data or acts for a user, and no public tool does
  either. The operator tier is token-gated but is never advertised to an
  anonymous caller, so a reviewer never sees it.

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
everything the submission form asks for (`plugin.json` metadata, an
AGPL-3.0-only license, a working `.mcp.json`, a skill). This can be
submitted independently of the ChatGPT directory decision above.
