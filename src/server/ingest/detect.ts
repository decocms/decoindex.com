import type { Platform } from "../lib/types";
import { candidateOrigins } from "../lib/url";

/**
 * Platform detection is the single highest-leverage step in the pipeline.
 * It is the difference between "render 10.000 pages with a headless browser"
 * and "download the whole catalog in 40 JSON requests".
 */

const MARKERS: [Platform, RegExp][] = [
  ["vtex", /vtexassets\.com|vteximg\.com\.br|__RUNTIME__|vtex\.store/i],
  ["shopify", /cdn\.shopify\.com|Shopify\.theme|shopifycloud/i],
  ["nuvemshop", /tiendanube|nuvemshop|d26lpennugtm8s\.cloudfront/i],
  ["tray", /tray\.com\.br|traycdn|tcdn\.com\.br/i],
];

export interface Detection {
  platform: Platform;
  origin: string;
  evidence: string;
}

export async function detectPlatform(domain: string): Promise<Detection> {
  for (const origin of candidateOrigins(domain)) {
    let html: string;
    try {
      const res = await fetch(origin, {
        redirect: "follow",
        headers: { "user-agent": UA, accept: "text/html" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      html = (await res.text()).slice(0, 200_000);
    } catch {
      continue;
    }

    for (const [platform, re] of MARKERS) {
      const m = html.match(re);
      if (m) return { platform, origin, evidence: `homepage matched ${m[0]}` };
    }

    // No marker in the HTML: probe the two APIs that would settle it.
    if (await probe(`${origin}/api/catalog_system/pub/products/search?_from=0&_to=0`)) {
      return { platform: "vtex", origin, evidence: "catalog_system responded" };
    }
    if (await probe(`${origin}/products.json?limit=1`)) {
      return { platform: "shopify", origin, evidence: "products.json responded" };
    }
    return { platform: "unknown", origin, evidence: "no platform markers found" };
  }
  throw new Error(`unreachable: ${domain}`);
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    return ct.includes("json");
  } catch {
    return false;
  }
}

/** Identify ourselves honestly, with a link explaining what we are and how to opt out. */
export const UA =
  "decoindex/0.1 (+https://decoindex.com/about; agent-readable mirror; opt-out at /opt-out)";

/** Respect robots.txt for the crawl fallback. Structured APIs are public product feeds. */
export async function robotsAllows(origin: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return true;
    const txt = await res.text();
    // Minimal parse: only the wildcard group, only Disallow prefixes.
    const lines = txt.split("\n").map((l) => l.trim());
    let inStar = false;
    const disallow: string[] = [];
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(":");
      const key = (rawKey ?? "").toLowerCase().trim();
      const value = rest.join(":").trim();
      if (key === "user-agent") inStar = value === "*";
      else if (inStar && key === "disallow" && value) disallow.push(value);
    }
    return !disallow.some((d) => path.startsWith(d));
  } catch {
    return true;
  }
}
