import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import type { Product, SearchHit, StorefrontMeta, Variant } from "../lib/types";
import {
  dequantizeDot,
  l2normalize,
  quantize,
  rrf,
  termFrequencies,
  tokenize,
} from "../lib/text";

/**
 * One Durable Object per storefront domain: idFromName(domain).
 *
 * It owns the whole catalog for that one merchant, which at BR-brand scale
 * (1k-50k SKUs) fits comfortably in DO SQLite. Per-brand isolation comes free:
 * no tenant column, no way to leak one merchant's data into another's results.
 *
 * Why a hand-rolled inverted index instead of FTS5: virtual tables are not
 * dependable across Cloudflare's SQLite surfaces, and we need the scoring
 * internals anyway to explain *why* a product matched (agents need reasons,
 * not just a ranking). Postings live in a plain table; BM25 runs in TS.
 */

const K1 = 1.2;
const B = 0.75;

export class StorefrontDO extends DurableObject<Env> {
  private sql: SqlStorage;
  /** Vectors are hot on every query; keep them resident while the DO is warm. */
  private vecCache: Map<string, Uint8Array> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        brand TEXT,
        description TEXT,
        categories TEXT NOT NULL DEFAULT '[]',
        images TEXT NOT NULL DEFAULT '[]',
        claims TEXT NOT NULL DEFAULT '[]',
        observed_at TEXT NOT NULL,
        doc_len INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS products_slug ON products(slug);

      CREATE TABLE IF NOT EXISTS variants (
        sku_id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price_minor INTEGER,
        list_price_minor INTEGER,
        currency TEXT NOT NULL DEFAULT 'BRL',
        available INTEGER,
        attrs TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS variants_product ON variants(product_id);

      CREATE TABLE IF NOT EXISTS terms (
        term TEXT NOT NULL,
        product_id TEXT NOT NULL,
        tf INTEGER NOT NULL,
        PRIMARY KEY (term, product_id)
      );
      CREATE INDEX IF NOT EXISTS terms_product ON terms(product_id);

      CREATE TABLE IF NOT EXISTS vectors (
        product_id TEXT PRIMARY KEY,
        vec BLOB NOT NULL
      );
    `);
  }

  // ---------------------------------------------------------------- metadata

  async getMeta(): Promise<StorefrontMeta | null> {
    const row = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k='meta'").toArray()[0];
    if (!row) return null;
    const meta = JSON.parse(row.v) as StorefrontMeta;
    meta.productCount = this.count();
    return meta;
  }

  async setMeta(patch: Partial<StorefrontMeta> & { domain: string }): Promise<StorefrontMeta> {
    const current = (await this.getMeta()) ?? {
      domain: patch.domain,
      platform: "unknown" as const,
      status: "queued" as const,
      locale: "pt-BR",
      currency: "BRL",
      productCount: 0,
    };
    const next: StorefrontMeta = { ...current, ...patch };
    this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('meta', ?)", JSON.stringify(next));
    return next;
  }

  private count(): number {
    return (
      this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM products").one().n ?? 0
    );
  }

  // ----------------------------------------------------------------- writing

  /** Idempotent upsert of a batch. Re-running an ingest never duplicates. */
  async upsertProducts(products: Product[]): Promise<{ upserted: number; needEmbedding: string[] }> {
    const needEmbedding: string[] = [];
    for (const p of products) {
      const text = this.indexableText(p);
      const tokens = tokenize(text);

      this.sql.exec(
        `INSERT INTO products (id, slug, title, brand, description, categories, images, claims, observed_at, doc_len)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug, title=excluded.title, brand=excluded.brand,
           description=excluded.description, categories=excluded.categories,
           images=excluded.images, claims=excluded.claims,
           observed_at=excluded.observed_at, doc_len=excluded.doc_len`,
        p.id,
        p.slug,
        p.title,
        p.brand ?? null,
        p.description ?? null,
        JSON.stringify(p.categories),
        JSON.stringify(p.images),
        JSON.stringify(p.claims),
        p.observedAt,
        tokens.length,
      );

      this.sql.exec("DELETE FROM variants WHERE product_id = ?", p.id);
      for (const v of p.variants) {
        this.sql.exec(
          `INSERT OR REPLACE INTO variants
             (sku_id, product_id, name, price_minor, list_price_minor, currency, available, attrs)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          v.skuId,
          p.id,
          v.name,
          v.priceMinor ?? null,
          v.listPriceMinor ?? null,
          v.currency,
          v.available === undefined ? null : v.available ? 1 : 0,
          JSON.stringify(v.attributes),
        );
      }

      this.sql.exec("DELETE FROM terms WHERE product_id = ?", p.id);
      for (const [term, tf] of termFrequencies(tokens)) {
        this.sql.exec("INSERT OR REPLACE INTO terms (term, product_id, tf) VALUES (?, ?, ?)", term, p.id, tf);
      }

      const hasVec = this.sql
        .exec<{ n: number }>("SELECT COUNT(*) AS n FROM vectors WHERE product_id = ?", p.id)
        .one().n;
      if (!hasVec) needEmbedding.push(p.id);
    }
    this.vecCache = null;
    return { upserted: products.length, needEmbedding };
  }

  async putVectors(entries: { productId: string; vec: number[] }[]): Promise<number> {
    for (const e of entries) {
      const q = quantize(l2normalize(e.vec));
      this.sql.exec("INSERT OR REPLACE INTO vectors (product_id, vec) VALUES (?, ?)", e.productId, q);
    }
    this.vecCache = null;
    return entries.length;
  }

  /** Text the search index sees. Weighted by repetition — title matters most. */
  private indexableText(p: Product): string {
    const variantAttrs = p.variants
      .flatMap((v) => Object.values(v.attributes))
      .join(" ");
    return [
      p.title, p.title, p.title,
      p.brand ?? "",
      p.categories.join(" "),
      p.categories.join(" "),
      p.description ?? "",
      p.claims.map((c) => `${c.predicate} ${c.value}`).join(" "),
      variantAttrs,
    ].join(" ");
  }

  /** Text we hand to the embedding model. Denser and shorter than the lexical doc. */
  async embeddingInputs(productIds: string[]): Promise<{ productId: string; text: string }[]> {
    const out: { productId: string; text: string }[] = [];
    for (const id of productIds) {
      const p = await this.getProductById(id);
      if (!p) continue;
      out.push({
        productId: id,
        text: [
          p.title,
          p.categories.join(" > "),
          p.description ?? "",
          p.claims.slice(0, 12).map((c) => `${c.predicate}: ${c.value}`).join("; "),
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1600),
      });
    }
    return out;
  }

  // ----------------------------------------------------------------- reading

  async getProductBySlug(slug: string): Promise<Product | null> {
    const row = this.sql.exec<ProductRow>("SELECT * FROM products WHERE slug = ?", slug).toArray()[0];
    return row ? this.hydrate(row) : null;
  }

  async getProductById(id: string): Promise<Product | null> {
    const row = this.sql.exec<ProductRow>("SELECT * FROM products WHERE id = ?", id).toArray()[0];
    return row ? this.hydrate(row) : null;
  }

  async listProducts(limit = 100, offset = 0): Promise<Product[]> {
    const rows = this.sql
      .exec<ProductRow>("SELECT * FROM products ORDER BY title LIMIT ? OFFSET ?", limit, offset)
      .toArray();
    return rows.map((r) => this.hydrate(r));
  }

  /** Distinct normalized category paths, for the PLP and llms.txt surfaces. */
  async listCategories(): Promise<{ path: string; count: number }[]> {
    const rows = this.sql.exec<{ categories: string }>("SELECT categories FROM products").toArray();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const cats = JSON.parse(r.categories) as string[];
      for (let i = 0; i < cats.length; i++) {
        const path = cats.slice(0, i + 1).join(" > ");
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
  }

  async listByCategory(category: string, limit = 60): Promise<Product[]> {
    const rows = this.sql.exec<ProductRow>("SELECT * FROM products").toArray();
    const needle = category.toLowerCase();
    return rows
      .filter((r) => (JSON.parse(r.categories) as string[]).some((c) => c.toLowerCase() === needle))
      .slice(0, limit)
      .map((r) => this.hydrate(r));
  }

  private hydrate(row: ProductRow): Product {
    const variants = this.sql
      .exec<VariantRow>("SELECT * FROM variants WHERE product_id = ?", row.id)
      .toArray()
      .map<Variant>((v) => ({
        skuId: v.sku_id,
        name: v.name,
        priceMinor: v.price_minor ?? undefined,
        listPriceMinor: v.list_price_minor ?? undefined,
        currency: v.currency,
        available: v.available === null ? undefined : v.available === 1,
        attributes: JSON.parse(v.attrs),
      }));
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      brand: row.brand ?? undefined,
      description: row.description ?? undefined,
      categories: JSON.parse(row.categories),
      images: JSON.parse(row.images),
      claims: JSON.parse(row.claims),
      observedAt: row.observed_at,
      variants,
    };
  }

  // ------------------------------------------------------------------ search

  /**
   * Hybrid search. Lexical catches SKU codes, collection names and exact
   * model numbers; semantic catches intent ("vestido pra casamento na praia").
   * Fused with RRF so neither scale has to be tuned against the other.
   */
  async search(query: string, opts: { limit?: number; queryVec?: number[] } = {}): Promise<SearchHit[]> {
    const limit = opts.limit ?? 12;
    const lexical = this.lexicalSearch(query, limit * 4);
    const semantic = opts.queryVec ? this.vectorSearch(opts.queryVec, limit * 4) : [];

    const fused = rrf<Scored>([lexical, semantic], (s) => s.productId);
    const ranked = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);

    const hits: SearchHit[] = [];
    for (const r of ranked) {
      const product = await this.getProductById(r.item.productId);
      if (!product) continue;
      const why: string[] = [];
      if (r.ranks[0]) why.push(`term match (#${r.ranks[0]}${r.item.terms?.length ? `: ${r.item.terms.join(", ")}` : ""})`);
      if (r.ranks[1]) why.push(`semantic match (#${r.ranks[1]})`);
      hits.push({ product, score: Number(r.score.toFixed(5)), why });
    }
    return hits;
  }

  private lexicalSearch(query: string, limit: number): Scored[] {
    const qTerms = [...new Set(tokenize(query))];
    if (!qTerms.length) return [];

    const N = this.count();
    if (!N) return [];
    const avgdl =
      this.sql.exec<{ a: number }>("SELECT AVG(doc_len) AS a FROM products").one().a || 1;

    const scores = new Map<string, { score: number; terms: string[] }>();
    for (const term of qTerms) {
      const postings = this.sql
        .exec<{ product_id: string; tf: number; doc_len: number }>(
          `SELECT t.product_id, t.tf, p.doc_len
             FROM terms t JOIN products p ON p.id = t.product_id
            WHERE t.term = ?`,
          term,
        )
        .toArray();
      if (!postings.length) continue;

      const df = postings.length;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (const post of postings) {
        const denom = post.tf + K1 * (1 - B + (B * post.doc_len) / avgdl);
        const contribution = idf * ((post.tf * (K1 + 1)) / denom);
        const prev = scores.get(post.product_id) ?? { score: 0, terms: [] };
        prev.score += contribution;
        prev.terms.push(term);
        scores.set(post.product_id, prev);
      }
    }

    return [...scores.entries()]
      .map(([productId, s]) => ({ productId, score: s.score, terms: s.terms }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private vectorSearch(queryVec: number[], limit: number): Scored[] {
    const q = quantize(l2normalize(queryVec));
    if (!this.vecCache) {
      this.vecCache = new Map();
      for (const row of this.sql
        .exec<{ product_id: string; vec: ArrayBuffer }>("SELECT product_id, vec FROM vectors")
        .toArray()) {
        this.vecCache.set(row.product_id, new Uint8Array(row.vec));
      }
    }
    const out: Scored[] = [];
    for (const [productId, vec] of this.vecCache) {
      if (vec.length !== q.length) continue;
      out.push({ productId, score: dequantizeDot(q, vec) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ------------------------------------------------------------------- admin

  async reset(): Promise<void> {
    for (const t of ["products", "variants", "terms", "vectors"]) {
      this.sql.exec(`DELETE FROM ${t}`);
    }
    this.vecCache = null;
  }
}

interface Scored {
  productId: string;
  score: number;
  terms?: string[];
}

interface ProductRow extends Record<string, SqlStorageValue> {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  description: string | null;
  categories: string;
  images: string;
  claims: string;
  observed_at: string;
  doc_len: number;
}

interface VariantRow extends Record<string, SqlStorageValue> {
  sku_id: string;
  product_id: string;
  name: string;
  price_minor: number | null;
  list_price_minor: number | null;
  currency: string;
  available: number | null;
  attrs: string;
}
