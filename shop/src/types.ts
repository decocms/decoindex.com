/** One product card. Shared by the chat stream (server) and the grid (client). */
export interface Tile {
  /** `{domain}:{decoindex id}` — unique across brands. */
  id: string;
  domain: string;
  brand: string;
  title: string;
  /** Observed base price in centavos. Never the final price — that is the merchant's. */
  priceMinor?: number;
  listPriceMinor?: number;
  currency: string;
  images: string[];
  /** Merchant PDP with our attribution param. */
  url: string;
  /** Sizes the catalog lists as available right now. A hint, not a stock promise. */
  sizes: string[];
  /** Color names from the variants (VTEX "Cor", Shopify "Color"). Optional: old snapshots lack it. */
  colors?: string[];
  category?: string;
  /** Department the store files it under, from the category breadcrumb ("Moda Feminina > …"). */
  dept?: "feminino" | "masculino";
  description?: string;
}

/** One NDJSON line of POST /api/chat. */
export type ChatEvent =
  | { type: "meta"; chatId: string; model: string }
  | { type: "status"; text: string }
  | { type: "products"; items: Tile[] }
  | { type: "curate"; ids: string[]; refinements?: string[] }
  | { type: "share"; id: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done"; ms: number };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  chatId: string;
  messages: ChatTurn[];
  dept?: "feminino" | "masculino";
  /** Partner store the shopper came from (`?store=`): searched first, shown first. */
  store?: string;
  /** Force a model from CHAT_MODELS (`?model=` for comparing by hand). */
  model?: string;
}

/** POST /api/similar: "mais como este", answered without a model. */
export interface SimilarRequest {
  chatId: string;
  dept?: "feminino" | "masculino";
  tile: Pick<Tile, "id" | "domain" | "title" | "category" | "priceMinor">;
}

/** A finished turn, frozen for `/s/{id}`. Prices are as observed at `createdAt`. */
export interface Share {
  id: string;
  q: string;
  answer: string;
  dept?: "feminino" | "masculino";
  store?: string;
  model: string;
  createdAt: string;
  tiles: Tile[];
  refinements: string[];
}
