import type { Env } from "../env";
import type { CategoryRef, Storefront } from "../lib/types";
import { UA } from "./detect";

/**
 * The category tree, once per storefront.
 *
 * VTEX ignores the depth argument on `/category/tree/{n}` and returns the whole
 * thing regardless — 1.2 MB and most of a second for americanas. Fetching that
 * on every category read to answer "what is underneath this one" would be
 * absurd, so it is fetched once, reduced to the few fields we render, and kept
 * in KV under the domain.
 *
 * The reduced index is small (americanas: ~780 nodes, ~60 KB) and it is what
 * makes a category page able to list its own subcategories, which is what makes
 * the truncated overview navigable rather than a dead end.
 */

const TIMEOUT = 8_000;
/** Refetched when older than this. Category structure changes rarely. */
const MAX_AGE_MS = 7 * 86_400_000;

export interface TreeNode {
  path: string;
  name: string;
  children: { path: string; name: string }[];
}

interface StoredTree {
  fetchedAt: string;
  /** Keyed by path, so a lookup is exact rather than a walk. */
  nodes: Record<string, TreeNode>;
  roots: string[];
}

const key = (domain: string) => `tree:${domain}`;

export async function getTree(env: Env, shop: Storefront): Promise<StoredTree | null> {
  const cached = (await env.CACHE.get(key(shop.domain), "json")) as StoredTree | null;
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < MAX_AGE_MS) return cached;

  const built = await fetchTree(shop);
  if (!built) return cached; // keep a stale index over none at all
  await env.CACHE.put(key(shop.domain), JSON.stringify(built)).catch(() => {});
  return built;
}

async function fetchTree(shop: Storefront): Promise<StoredTree | null> {
  const origin = shop.apiOrigin ?? shop.origin;
  try {
    const res = await fetch(`${origin}/api/catalog_system/pub/category/tree/3`, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
    const raw = (await res.json()) as VtexCategory[];
    if (!Array.isArray(raw) || !raw.length) return null;

    const nodes: Record<string, TreeNode> = {};
    /**
     * Merchants leave scaffolding in the public tree — americanas publishes four
     * "Integration Test Category 17796607..." nodes. They are real categories as
     * far as the API is concerned and useless to everyone, so they do not go in
     * the index an agent navigates by.
     */
    const isScaffolding = (name: string) =>
      /integration test|^test( |_|-)|^teste( |_|-)|categoria de teste|do not use|^zz+[ _-]/i.test(
        name.trim(),
      );
    const walk = (list: VtexCategory[]) => {
      for (const c of list) {
        if (isScaffolding(c.name)) continue;
        const path = pathOf(c.url);
        const children = (c.children ?? [])
          .filter((k) => !isScaffolding(k.name))
          .map((k) => ({ path: pathOf(k.url), name: k.name }));
        nodes[path] = { path, name: c.name, children };
        if (c.children?.length) walk(c.children);
      }
    };
    walk(raw);
    return {
      fetchedAt: new Date().toISOString(),
      nodes,
      roots: raw.filter((c) => !isScaffolding(c.name)).map((c) => pathOf(c.url)),
    };
  } catch {
    return null;
  }
}

/** Every top-level category plus its immediate children, for the overview. */
export function flatten(tree: StoredTree): CategoryRef[] {
  const out: CategoryRef[] = [];
  for (const rootPath of tree.roots) {
    const root = tree.nodes[rootPath];
    if (!root) continue;
    out.push({ path: root.path, name: root.name, depth: 0 });
    for (const child of root.children) {
      out.push({ path: child.path, name: child.name, depth: 1, parent: root.name });
    }
  }
  return out;
}

/** Direct children of one category path, if we know it. */
export function childrenOf(tree: StoredTree | null, path: string): CategoryRef[] {
  if (!tree) return [];
  const clean = path.replace(/\/+$/, "") || "/";
  const node = tree.nodes[clean] ?? tree.nodes[clean + "/"];
  return (node?.children ?? []).map((c) => ({ path: c.path, name: c.name, depth: 1 }));
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return (url.startsWith("/") ? url : `/${url}`).replace(/\/+$/, "") || "/";
  }
}

interface VtexCategory {
  name: string;
  url: string;
  children?: VtexCategory[];
}
