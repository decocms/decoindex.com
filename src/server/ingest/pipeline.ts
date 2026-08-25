import type { Env, IngestJob } from "../env";
import type { Product } from "../lib/types";
import { upsertDomain } from "../lib/registry";
import { embed } from "../lib/embed";
import { candidateOrigins } from "../lib/url";
import { detectPlatform, robotsAllows } from "./detect";
import { fetchVtexBySlug, fetchVtexPage } from "./vtex";
import { fetchJsonLdProduct, fetchShopifyBySlug, fetchShopifyPage } from "./shopify";

const EMBED_BATCH = 32;

export async function runIngestJob(env: Env, job: IngestJob): Promise<void> {
  switch (job.kind) {
    case "discover":
      return discover(env, job.domain);
    case "catalog":
      return catalog(env, job.domain, job.cursor ?? 0);
    case "embed":
      return embedBatch(env, job.domain, job.skuIds);
    case "page":
      return page(env, job.domain, job.path);
  }
}

function doFor(env: Env, domain: string) {
  return env.STOREFRONT.get(env.STOREFRONT.idFromName(domain));
}

/** One ingest per domain at a time. Cheap lock, TTL so a crash can't wedge it. */
async function withLock(env: Env, domain: string, fn: () => Promise<void>): Promise<void> {
  const key = `lock:${domain}`;
  if (await env.LOCKS.get(key)) return;
  await env.LOCKS.put(key, "1", { expirationTtl: 900 });
  try {
    await fn();
  } finally {
    await env.LOCKS.delete(key);
  }
}

async function discover(env: Env, domain: string): Promise<void> {
  const detection = await detectPlatform(domain);
  await doFor(env, domain).setMeta({
    domain,
    platform: detection.platform,
    status: "discovered",
  });
  await upsertDomain(env, domain, {
    platform: detection.platform,
    status: "discovered",
    last_error: null,
  });
  if (detection.platform !== "unknown") {
    await env.INGEST.send({ kind: "catalog", domain, cursor: 0 });
  }
}

/**
 * Walk the catalog one page at a time, re-enqueueing the next cursor. Keeps
 * every invocation well inside CPU limits and makes the job resumable: a
 * failure loses one page, not the catalog.
 */
async function catalog(env: Env, domain: string, cursor: number): Promise<void> {
  await withLock(env, domain, async () => {
    const stub = doFor(env, domain);
    const meta = await stub.getMeta();
    const platform = meta?.platform ?? (await detectPlatform(domain)).platform;
    const origin = candidateOrigins(domain)[0]!;

    let products: Product[] = [];
    let done = true;

    if (platform === "vtex") {
      ({ products, done } = await fetchVtexPage(origin, cursor));
    } else if (platform === "shopify") {
      ({ products, done } = await fetchShopifyPage(origin, Math.floor(cursor) + 1));
    } else {
      await upsertDomain(env, domain, {
        last_error: `no structured catalog for platform=${platform}`,
        last_refresh: new Date().toISOString(),
      });
      return;
    }

    if (products.length) {
      const { needEmbedding } = await stub.upsertProducts(products);
      for (let i = 0; i < needEmbedding.length; i += EMBED_BATCH) {
        await env.INGEST.send({
          kind: "embed",
          domain,
          skuIds: needEmbedding.slice(i, i + EMBED_BATCH),
        });
      }
    }

    const nextCursor = platform === "vtex" ? cursor + products.length : cursor + 1;
    if (!done && products.length) {
      await env.INGEST.send({ kind: "catalog", domain, cursor: nextCursor });
    } else {
      const now = new Date().toISOString();
      await stub.setMeta({ domain, catalogFreshness: now });
      const fresh = await stub.getMeta();
      await upsertDomain(env, domain, {
        last_refresh: now,
        product_count: fresh?.productCount ?? 0,
        last_error: null,
      });
    }
  });
}

async function embedBatch(env: Env, domain: string, productIds: string[]): Promise<void> {
  const stub = doFor(env, domain);
  const inputs = await stub.embeddingInputs(productIds);
  if (!inputs.length) return;
  const vectors = await embed(env, inputs.map((i) => i.text));
  if (!vectors) return; // search stays lexical-only until the next pass
  await stub.putVectors(
    vectors.map((vec, i) => ({ productId: inputs[i]!.productId, vec })),
  );
}

/** On-demand single page, for a URL an agent asked for before the crawl reached it. */
async function page(env: Env, domain: string, path: string): Promise<void> {
  const stub = doFor(env, domain);
  const meta = await stub.getMeta();
  const platform = meta?.platform ?? "unknown";
  const origin = candidateOrigins(domain)[0]!;

  let product: Product | null = null;
  if (platform === "vtex") product = await fetchVtexBySlug(origin, path);
  else if (platform === "shopify") product = await fetchShopifyBySlug(origin, path);

  if (!product) {
    // HTML fallback is the only path that touches a rendered page, so it is the
    // only one that has to check robots.txt.
    if (!(await robotsAllows(origin, path))) return;
    product = await fetchJsonLdProduct(`${origin}${path}`);
  }
  if (!product) return;

  const { needEmbedding } = await stub.upsertProducts([product]);
  if (needEmbedding.length) {
    await env.INGEST.send({ kind: "embed", domain, skuIds: needEmbedding });
  }
}
