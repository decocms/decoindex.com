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
  category?: string;
  description?: string;
}

/** One NDJSON line of POST /api/chat. */
export type ChatEvent =
  | { type: "meta"; chatId: string; model: string }
  | { type: "status"; text: string }
  | { type: "products"; items: Tile[] }
  | { type: "curate"; ids: string[] }
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
  /** Force a model from CHAT_MODELS (`?model=` for comparing by hand). */
  model?: string;
}
