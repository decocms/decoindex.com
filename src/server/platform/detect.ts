import type { Platform } from "../lib/types";
import { candidateOrigins } from "../lib/url";

/**
 * Detection decides everything downstream, and it has to be cheap enough to run
 * inside a request. So: probe the two APIs directly, never download the homepage,
 * and fire both probes concurrently so a dead domain costs one timeout, not four.
 *
 * The probe must check the content-type, not just the status. A VTEX storefront
 * answers `/products.json` with `200 text/html` (its own 404 page), so a status
 * check alone classifies half of Brazilian ecommerce as Shopify.
 *
 * This runs once per domain, ever. The result is written to the registry and the
 * read path never pays for it again.
 */

/** Identify ourselves honestly, with a link explaining what we are and how to opt out. */
export const UA =
  "decoindex/1.0 (+https://decoindex.com/about; agent-readable mirror; opt-out at https://decoindex.com/opt-out)";

const TIMEOUT = 5_000;

export interface Detection {
  platform: Platform;
  origin: string;
  /** Platform tenant id — the "account name" behind the domain. */
  account?: string;
  merchantName?: string;
  currency?: string;
  country?: string;
  /** The origin answered, but refused us. */
  blocked?: boolean;
}

export async function detectPlatform(domain: string): Promise<Detection> {
  let blocked = false;

  for (const origin of candidateOrigins(domain)) {
    const [vtex, shopify] = await Promise.all([
      probe(`${origin}/api/catalog_system/pub/products/search?_from=0&_to=0`),
      probe(`${origin}/products.json?limit=1`),
    ]);
    if (vtex.refused || shopify.refused) blocked = true;

    if (Array.isArray(vtex.json)) {
      // VTEX never states its account name, but every image is served from
      // `https://{account}.vteximg.com.br/...` or `{account}.vtexassets.com`.
      const first = (vtex.json as { items?: { images?: { imageUrl?: string }[] }[] }[])[0];
      const img = first?.items?.[0]?.images?.[0]?.imageUrl ?? "";
      const account = img.match(/^https?:\/\/([^.]+)\.(?:vteximg\.com\.br|vtexassets\.com)/)?.[1];
      return { platform: "vtex", origin, account, currency: "BRL" };
    }

    if (Array.isArray((shopify.json as { products?: unknown } | null)?.products)) {
      // Shopify publishes shop identity — name, currency, country, myshopify
      // account — at /meta.json. Worth one extra call, once per domain ever.
      const meta = (await probe(`${origin}/meta.json`)).json as {
        name?: string;
        currency?: string;
        country?: string;
        myshopify_domain?: string;
      } | null;
      return {
        platform: "shopify",
        origin,
        account: meta?.myshopify_domain,
        merchantName: meta?.name,
        currency: meta?.currency ?? "USD",
        country: meta?.country,
      };
    }

    // A headless storefront (its own Next.js front over VTEX — Azzas' Maria Filó, Cris Barros, Foxton)
    // answers the catalog path with its HTML, so the probe above sees no JSON. That HTML names the
    // account on every image (`{account}.vtexassets.com`); the catalog still answers on the
    // account's canonical host, which is where reads go anyway (vtexApiOrigin). One more probe,
    // detection only, once per domain ever.
    const account = vtexAccountIn(vtex.html);
    if (account) {
      const direct = await probe(`https://${account}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?_from=0&_to=0`);
      if (Array.isArray(direct.json)) return { platform: "vtex", origin, account, currency: "BRL" };
    }

    // Something answered on this origin and it is not a platform we read. Trying
    // the other host would only buy another pair of timeouts.
    if (vtex.reached || shopify.reached) {
      return { platform: "unknown", origin, blocked };
    }
  }

  return { platform: "unknown", origin: candidateOrigins(domain)[0]!, blocked };
}

interface Probe {
  json: unknown;
  /** The origin answered at all — so the *domain* is alive. */
  reached: boolean;
  /**
   * The origin answered but would not serve us. 401/403/429 is an explicit
   * refusal; a 5xx on a public catalog endpoint is a WAF in practice — bot
   * managers routinely disguise a block as a server error, and calling that
   * "unsupported platform" would tell a merchant the wrong thing.
   */
  refused: boolean;
  /** The start of a non-JSON body (a headless storefront's HTML), for vtexAccountIn. */
  html?: string;
}

/**
 * The VTEX account a page's images come from, by count: the store's own account dominates, while
 * another account can appear once (a shared banner from a sister store).
 */
export function vtexAccountIn(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/\/\/([a-z0-9-]+)\.(?:vtexassets\.com|vteximg\.com\.br)\//g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const [top] = [...counts].sort((a, b) => b[1] - a[1]);
  return top && top[1] >= 3 ? top[0] : undefined;
}

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const refused = res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500;
    // 206 is VTEX's normal answer to a ranged catalog query.
    const ok = res.ok || res.status === 206;
    const type = res.headers.get("content-type") ?? "";
    if (ok && type.includes("html")) {
      // Kept for vtexAccountIn; a page's <head> and first images fit well inside this.
      return { json: null, reached: true, refused, html: (await res.text().catch(() => "")).slice(0, 300_000) };
    }
    if (!ok || !type.includes("json")) {
      return { json: null, reached: true, refused };
    }
    return { json: await res.json().catch(() => null), reached: true, refused: false };
  } catch {
    return { json: null, reached: false, refused: false };
  }
}
