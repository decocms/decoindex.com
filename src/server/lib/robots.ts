/**
 * Bulk crawlers that read on no user's behalf. Disallowed in robots.txt AND
 * refused with 403 — robots.txt is a request, this is the enforcement. Amazonbot
 * crawled at a flat 30/min from 2026-09-07, ~91% cold misses, every one an
 * upstream call on a merchant: invariant 1's amplifier, by volume. The others
 * are training crawls of the same shape. Plain Applebot (Siri) is not here.
 */
export const BLOCKED_CRAWLERS = ["Amazonbot", "Bytespider", "CCBot", "meta-externalagent"];
const BLOCKED_RE = new RegExp(BLOCKED_CRAWLERS.join("|"), "i");
export const isBlockedCrawler = (ua?: string) => !!ua && BLOCKED_RE.test(ua);

/**
 * One source for robots.txt: served at /robots.txt and shown on the traffic
 * dashboard, so what the dashboard claims we allow is what crawlers actually read.
 */
export function robotsTxt(origin: string): string {
  return (
    [
      // Invariant 3: we are a channel, not a competitor. Search engines get our
      // own pages and nothing else — the day a decoindex mirror outranks a
      // merchant's own PDP is the day the commercial conversation ends.
      // Everything under /{domain}/ is a mirror; the handful of paths above it
      // are ours to be found by. AI agents are unrestricted; they are the point.
      "User-agent: Googlebot",
      "User-agent: bingbot",
      "User-agent: DuckDuckBot",
      "User-agent: Yandex",
      "User-agent: Baiduspider",
      "Allow: /$",
      "Allow: /about",
      "Allow: /benchmark",
      "Allow: /opt-out",
      "Allow: /llms.txt",
      "Allow: /og.png",
      "Disallow: /",
      "",
      // Named explicitly so there is no ambiguity for the clients that matter.
      "User-agent: GPTBot",
      "User-agent: ChatGPT-User",
      "User-agent: OAI-SearchBot",
      "User-agent: ClaudeBot",
      "User-agent: Claude-User",
      "User-agent: Claude-SearchBot",
      "User-agent: PerplexityBot",
      "User-agent: Perplexity-User",
      "User-agent: Google-Extended",
      "Allow: /",
      "",
      ...BLOCKED_CRAWLERS.map((b) => `User-agent: ${b}`),
      "Disallow: /",
      "",
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: none — this service is resolved on demand, not enumerable.`,
      `# Machine index: ${origin}/llms.txt`,
    ].join("\n")
  );
}
