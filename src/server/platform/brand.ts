import { UA } from "./detect";

/**
 * How the merchant describes itself, taken from the tags they already publish
 * for Google and for link previews.
 *
 * A catalog without a brand is a spreadsheet. An agent choosing between four
 * storefronts needs to know that one is a Rio fashion label and another sells
 * luggage, and the merchant has already written that sentence — it is sitting in
 * `og:description`. We read it rather than invent one.
 *
 * This is the merchant's own marketing copy, so it is attributed and never
 * rewritten. Once a merchant signs up, these become CMS fields they control
 * directly and this scrape stops being the source.
 *
 * Bounded like everything else on the read path: one request, 6s, and we stop
 * reading at the end of <head> instead of pulling a megabyte of body.
 */

const TIMEOUT = 6_000;
/** Heads run large on storefronts — farmrio's is ~140KB. Read enough, then stop. */
const MAX_HEAD_BYTES = 256 * 1024;

export interface Brand {
  name?: string;
  description?: string;
  /** The merchant's own og:image. Linked, never rehosted. */
  image?: string;
  /** Their declared browser chrome colour — the closest thing to a brand colour. */
  themeColor?: string;
  locale?: string;
}

export async function fetchBrand(origin: string): Promise<Brand | null> {
  const head = await fetchHead(origin);
  if (!head) return null;

  const brand: Brand = {
    name: meta(head, "og:site_name") ?? meta(head, "application-name"),
    description:
      clean(meta(head, "og:description")) ??
      clean(meta(head, "description")) ??
      clean(meta(head, "twitter:description")),
    image: absolute(meta(head, "og:image") ?? meta(head, "twitter:image"), origin),
    themeColor: colour(meta(head, "theme-color") ?? meta(head, "msapplication-TileColor")),
    locale: meta(head, "og:locale")?.replace("_", "-"),
  };
  // A brand with nothing but a colour is not worth a row.
  return brand.description || brand.name ? brand : null;
}

async function fetchHead(origin: string): Promise<string | null> {
  try {
    const res = await fetch(origin, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok || !res.body) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;

    // Stream and stop at </head>. A storefront homepage is often over a megabyte
    // and none of it after the head is any use to us.
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    try {
      while (buf.length < MAX_HEAD_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        const end = buf.indexOf("</head>");
        if (end !== -1) return buf.slice(0, end);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return buf;
  } catch {
    return null;
  }
}

/** Matches either attribute order: content-first and name-first both occur. */
function meta(head: string, key: string): string | undefined {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"),
  ];
  for (const re of patterns) {
    const value = head.match(re)?.[1];
    if (value?.trim()) return decode(value.trim());
  }
  return undefined;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  // One-word or boilerplate descriptions are noise, not identity.
  return text.length >= 20 ? text.slice(0, 300) : undefined;
}

/** Only accept something that is actually a colour, so we never emit junk. */
function colour(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v.toLowerCase() : undefined;
}

function absolute(url: string | undefined, origin: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, origin).toString();
  } catch {
    return undefined;
  }
}
