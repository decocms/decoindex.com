/**
 * Category heuristics: turn "vestido" into FARM's `/moda-feminina/vestido` and
 * Osklen's `/feminino/vestuario`, so a request reads a category page instead of
 * a free-text search.
 *
 * Why bother: a category page is the same URL for every shopper, so it is warm
 * in decoindex's cache after the first read, it is ordered by the merchant (or
 * by `?sort=`), and it does not depend on each store's keyword search, which is
 * where "camisa de linho" turns into t-shirts. Free text is still the fallback.
 */

/** Canonical product types → words (normalized: no accents, lowercase, singular). */
export const TYPES = {
  vestido: ["vestido"],
  saia: ["saia"],
  short: ["short"],
  bermuda: ["bermuda"],
  calca: ["calca", "pantalona", "legging"],
  jeans: ["jean", "denim"],
  camisa: ["camisa"],
  camiseta: ["camiseta", "t-shirt", "tshirt", "tee"],
  polo: ["polo"],
  blusa: ["blusa", "regata"],
  top: ["top", "cropped"],
  body: ["body"],
  macacao: ["macacao", "macaquinho"],
  casaco: ["casaco", "jaqueta", "blazer", "colete", "cardigan", "trico", "tricot", "sueter"],
  moletom: ["moletom", "sweatshirt", "hoodie"],
  biquini: ["biquini"],
  maio: ["maio"],
  praia: ["praia", "beachwear", "swimwear", "saida", "kimono", "canga"],
  lingerie: ["lingerie", "underwear", "sutia", "calcinha", "cueca", "pijama"],
  tenis: ["tenis", "sneaker"],
  sandalia: ["sandalia", "rasteira", "papete"],
  chinelo: ["chinelo"],
  sapato: ["sapato", "mocassim", "scarpin", "bota", "sapatilha", "mule", "calcado"],
  bolsa: ["bolsa", "clutch", "tote"],
  mochila: ["mochila"],
  mala: ["mala", "bagagem", "frasqueira"],
  acessorio: ["acessorio", "cinto", "oculo", "bone", "chapeu", "brinco", "colar", "lenco"],
} as const;

export type ProductType = keyof typeof TYPES;
export const TYPE_NAMES = Object.keys(TYPES) as ProductType[];

export interface Category {
  path: string;
  /** Full breadcrumb, normalized, e.g. "moda feminina vestido". */
  words: string[];
  name: string;
  depth: number;
  count?: number;
}

/** "Vestidos Longos" → ["vestido", "longo"]. Cheap pt-BR plural folding; keeps tênis/lápis. */
export function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .flatMap((w) => (/^t-shirts?$/.test(w) ? ["t-shirt"] : w.split("-"))) // "T-Shirts" too, or it splits into t + shirt
    .filter((w) => w.length > 1)
    .map((w) => (w.length > 3 && w.endsWith("s") && !/(is|us)$/.test(w) ? w.slice(0, -1) : w))
    .map((w) => (w.endsWith("oe") ? w.slice(0, -2) + "ao" : w)); // calcoes → calcao
}

const FEM = /\b(feminin[oa]|fem|mulher|women|woman|female|ela)\b/;
const MASC = /\b(masculin[oa]|masc|homem|men|man|male|ele)\b/;
const KIDS = /\b(infantil|kid|crianca|baby|bebe|menin[oa]|teen|mini)\b/;
const JUNK = /\b(desativad[oa]|integracao|category|nao categorizado|vale presente|presente|gift|teste|test|casa|home|tok stok|clube|me leva)\b/;
const SALE = /\b(bazar|outlet|sale|promo|liquida|black friday|off)\b/;

export function toCategories(raw: { path: string; name: string; depth?: number; count?: number; parent?: string }[]): Category[] {
  return raw.map((c) => {
    const crumb = [c.parent, c.name, c.path.replace(/\/collections\//, " ").replace(/\//g, " ")].filter(Boolean).join(" ");
    return {
      path: c.path,
      name: c.name,
      words: [...new Set(words(crumb))],
      depth: c.depth ?? (c.path.split("/").filter(Boolean).length - 1),
      count: c.count,
    };
  });
}

export interface Pick {
  category: Category;
  score: number;
}

/**
 * Best category for a product type in one store, or undefined when nothing
 * plausibly matches (then the caller falls back to search).
 */
export function pickCategory(
  cats: Category[],
  type: ProductType,
  opts: { dept?: "feminino" | "masculino"; sale?: boolean } = {},
): Pick | undefined {
  const syn = TYPES[type] as readonly string[];
  let best: Pick | undefined;
  for (const c of cats) {
    const hit = c.words.some((w) => syn.includes(w));
    if (!hit) continue;
    const text = c.words.join(" ");
    if (JUNK.test(text)) continue;
    let score = 10;
    // The type is the category's own name, not just somewhere up the breadcrumb.
    if (words(c.name).some((w) => syn.includes(w))) score += 6;
    score += Math.min(c.depth, 3) * 2;
    if (opts.dept === "feminino") score += FEM.test(text) ? 5 : MASC.test(text) ? -25 : 0;
    if (opts.dept === "masculino") score += MASC.test(text) ? 5 : FEM.test(text) ? -25 : 0;
    if (KIDS.test(text)) score -= 15;
    if (SALE.test(text)) score += opts.sale ? 4 : -8;
    if (c.count) score += Math.min(Math.log10(c.count), 3);
    if (!best || score > best.score) best = { category: c, score };
  }
  return best && best.score > 0 ? best : undefined;
}

/** Which canonical type a free-text title/category is about, if any. */
export function detectType(text: string): ProductType | undefined {
  const ws = words(text);
  // First word wins: "Vestido Camisa Linho" is a dress.
  for (const w of ws) for (const t of TYPE_NAMES) if ((TYPES[t] as readonly string[]).includes(w)) return t;
  return undefined;
}

const STOP = new Set(["de", "da", "do", "das", "dos", "com", "em", "e", "na", "no", "para", "pra", "a", "o", "um", "uma", "the", "and", "with"]);

/** Descriptive words of a title, minus the type itself: "Vestido Linho Curto Preto" → [linho, curto, preto]. */
export function attributes(title: string, type?: ProductType): string[] {
  const typeWords = new Set<string>(type ? TYPES[type] : []);
  return words(title).filter((w) => !STOP.has(w) && !typeWords.has(w) && !/^\d+$/.test(w));
}

/** True when the text says it is for the *other* department ("Camisa Feminina" while browsing masculino). */
export function otherDept(text: string, dept?: "feminino" | "masculino"): boolean {
  if (!dept) return false;
  const t = words(text).join(" ");
  return dept === "masculino" ? FEM.test(t) && !MASC.test(t) : MASC.test(t) && !FEM.test(t);
}

/** How many of `want` appear in `text` (normalized). Used to rank a category page against the shopper's terms. */
export function overlap(want: string[], text: string): number {
  if (!want.length) return 0;
  const have = new Set(words(text));
  // Prefix match so "estampa" finds "estampado" and "azul" finds "azul-marinho".
  return want.filter((w) => have.has(w) || [...have].some((h) => h.length > 4 && w.length > 4 && (h.startsWith(w) || w.startsWith(h)))).length;
}
