/**
 * Smoke test for the /mcp JSON-RPC surface. Not a framework, not a fixture —
 * the dispatcher and its safeUrl/DOM-building logic in mcp.ts and
 * render/widget.ts are the only non-trivial code this plan adds, and the
 * repo's only other check is `tsc --noEmit`, which wouldn't catch a wrong
 * status code or a malformed envelope.
 *
 *   wrangler dev &
 *   bun run scripts/mcp-smoke.ts [http://localhost:8787]
 */
const base = process.argv[2] ?? "http://localhost:8787";
let nextId = 1;

async function rpc(method: string, params?: Record<string, unknown>) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
  assert(init.status === 200, "initialize: 200");
  assert(init.body.result?.serverInfo?.name === "decoindex", "initialize: serverInfo.name");

  const list = await rpc("tools/list");
  const names = (list.body.result?.tools ?? []).map((t: { name: string }) => t.name);
  assert(names.includes("search_storefront"), "tools/list: search_storefront present");
  assert(names.includes("get_product"), "tools/list: get_product present");
  assert(names.includes("list_storefronts"), "tools/list: list_storefronts present");

  const resList = await rpc("resources/list");
  const uri = resList.body.result?.resources?.[0]?.uri;
  assert(!!uri, "resources/list: at least one resource");

  const resRead = await rpc("resources/read", { uri });
  const html = resRead.body.result?.contents?.[0]?.text ?? "";
  assert(resRead.body.result?.contents?.[0]?.mimeType === "text/html;profile=mcp-app", "resources/read: mcp-app mimeType");
  assert(html.includes("window.openai"), "resources/read: widget reads window.openai");

  const bogus = await rpc("tools/call", { name: "search_storefront", arguments: { domain: "not a domain", query: "x" } });
  assert(bogus.body.result?.isError === true, "tools/call: invalid domain reported as tool error, not transport error");

  const listStores = await rpc("tools/call", { name: "list_storefronts", arguments: { limit: 5 } });
  assert(Array.isArray(listStores.body.result?.structuredContent?.storefronts), "tools/call: list_storefronts returns an array");

  console.log("OK — all mcp-smoke checks passed");
}

function assert(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`ok  - ${label}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
