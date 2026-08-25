/**
 * Seed the registry from the brands already tracked in Vitrine.
 *
 * This is the head start: a few hundred BR storefronts whose platform is
 * already known, indexed before anyone pastes a URL. Run once, then let the
 * hourly cron keep them fresh.
 *
 *   bun run scripts/seed-registry.ts brands.json \
 *     | wrangler d1 execute decoindex --remote --file=-
 *
 * brands.json: [{ "domain": "farmrio.com.br", "name": "FARM Rio", "platform": "vtex" }]
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: seed-registry.ts <brands.json>");
  process.exit(1);
}

interface Brand {
  domain: string;
  name?: string;
  platform?: string;
}

const brands = JSON.parse(readFileSync(file, "utf8")) as Brand[];
const seen = new Set<string>();
const lines: string[] = [];

for (const b of brands) {
  const domain = b.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!domain || seen.has(domain)) continue;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    console.error(`skipping malformed domain: ${b.domain}`);
    continue;
  }
  seen.add(domain);
  const platform = (b.platform ?? "unknown").toLowerCase().replace(/[^a-z]/g, "") || "unknown";
  lines.push(
    `INSERT INTO domains (domain, status, platform, priority) ` +
      `VALUES ('${domain}', 'queued', '${platform}', 100) ` +
      `ON CONFLICT(domain) DO UPDATE SET priority = 100, platform = excluded.platform;`,
  );
}

console.log(lines.join("\n"));
console.error(`${lines.length} domains ready to seed.`);
