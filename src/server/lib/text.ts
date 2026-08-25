/**
 * Tokenization must be identical at index time and query time. Keeping both
 * in this one module is the cheapest way to guarantee that.
 */

const STOPWORDS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","um","uma","uns","umas",
  "para","pra","por","com","sem","no","na","nos","nas","que","ao","aos","à","às",
  "the","and","for","with","of",
]);

/** Strip accents; PT-BR users type "vestido" and "véstido" interchangeably. */
export function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function tokenize(input: string): string[] {
  const base = deaccent(input.toLowerCase());
  const out: string[] = [];
  for (const raw of base.split(/[^a-z0-9]+/)) {
    if (!raw || raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(raw);
    // Light suffix folding: plurals dominate catalog text ("vestidos" -> "vestido").
    if (raw.length > 3 && raw.endsWith("s")) out.push(raw.slice(0, -1));
  }
  return out;
}

export function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * int8 quantization. bge-m3 gives 1024 float dims; at 4 bytes that is 4KB per
 * SKU (40MB for 10k SKUs, too much to scan). At 1 byte it is 10MB, which a DO
 * can brute-force in a few ms. Recall loss is negligible at this scale.
 */
export function quantize(vec: number[]): Uint8Array {
  const out = new Uint8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const v = Math.max(-1, Math.min(1, vec[i]!));
    out[i] = Math.round((v + 1) * 127.5);
  }
  return out;
}

export function dequantizeDot(a: Uint8Array, b: Uint8Array): number {
  // Both vectors are L2-normalized before quantization, so the dot product is
  // cosine similarity. We work in the quantized space and rescale once.
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i]! / 127.5 - 1) * (b[i]! / 127.5 - 1);
  }
  return sum;
}

export function l2normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Reciprocal Rank Fusion. Beats score normalization when combining a lexical
 * ranking (unbounded BM25) with a semantic one (cosine in [-1,1]) — no tuning
 * of incomparable scales required.
 */
export function rrf<T>(
  rankings: T[][],
  keyOf: (item: T) => string,
  k = 60,
): Map<string, { item: T; score: number; ranks: number[] }> {
  const fused = new Map<string, { item: T; score: number; ranks: number[] }>();
  rankings.forEach((ranking, listIdx) => {
    ranking.forEach((item, i) => {
      const key = keyOf(item);
      const prev = fused.get(key) ?? { item, score: 0, ranks: [] as number[] };
      prev.score += 1 / (k + i + 1);
      prev.ranks[listIdx] = i + 1;
      fused.set(key, prev);
    });
  });
  return fused;
}
