import { useCallback, useRef, useState } from "react";
import { splitDetails } from "~/details";
import type { ChatEvent, ChatTurn, RefineDim, Share, Tile } from "~/types";

export type Dept = "feminino" | "masculino";

export interface Turn {
  /** Identity of this turn, so a stream only ever writes into its own turn. */
  key: string;
  user: string;
  /** Details picked in "Refinar ✨" ("horário: noite"), shown under the question and sent with it. */
  context?: string[];
  answer: string;
  status?: string;
  /** What the server said it was doing, in order: the loading view lists them. */
  steps?: string[];
  /** Every tile the searches returned, in arrival order. */
  products: Tile[];
  /** The model's pick, in its order. Undefined until show_products runs. */
  curated?: string[];
  /** Next steps the model suggests, shown as chips. */
  refinements?: string[];
  /** Set once the server froze this turn at /s/{id}. */
  shareId?: string;
  /** "Mais como este": the piece it started from, shown as a card in the thread. */
  seed?: Pick<Tile, "brand" | "title" | "images">;
  error?: string;
  /** Streamed in this session (not reopened from a link): its loading view gets to play. */
  live?: boolean;
  done: boolean;
  ms?: number;
}

/**
 * "Meu contexto": a few words the shopper writes about themselves, sent with every search.
 * Lives only in this browser (localStorage), which can throw or be empty in private mode.
 */
const CONTEXT_KEY = "decoshop:context";
export const myContext = {
  get(): string {
    try {
      return localStorage.getItem(CONTEXT_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set(v: string) {
    try {
      if (v.trim()) localStorage.setItem(CONTEXT_KEY, v);
      else localStorage.removeItem(CONTEXT_KEY);
    } catch {
      /* private mode: it just won't persist */
    }
  },
};

const newId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export function useShopChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [model, setModel] = useState<string>();
  const chatId = useRef<string>("");
  const abort = useRef<AbortController | null>(null);

  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  /**
   * One turn: keep the first `keep` turns (asking after going Back branches the
   * conversation, like browser history; 0 = a new conversation), push the new
   * turn, POST `endpoint`, fold the NDJSON events into *that* turn by key.
   * Patching "the last turn" instead let an aborted stream finish the new one
   * and leave itself spinning forever.
   */
  const stream = useCallback(async (label: string, keep: number, endpoint: string, payload: (id: string) => object, seed?: Turn["seed"], context?: string[]) => {
    abort.current?.abort();
    const ctrl = (abort.current = new AbortController());
    if (keep === 0 || !chatId.current) chatId.current = newId();
    const key = newId();
    const patchLast = (fn: (t: Turn) => Turn) => setTurns((all) => all.map((t) => (t.key === key ? fn(t) : t)));
    setTurns((all) => [...all.slice(0, keep), { key, user: label, seed, context, answer: "", products: [], done: false, live: true, status: "Pensando…" }]);
    try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload(chatId.current)),
          signal: ctrl.signal,
        });
        if (res.status === 429) {
          patchLast((t) => ({ ...t, error: "Muitas buscas seguidas. Espera um minutinho e tenta de novo?" }));
          return;
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) apply(JSON.parse(line) as ChatEvent);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") patchLast((t) => ({ ...t, error: "Falha de conexão. Tente de novo." }));
      } finally {
        patchLast((t) => ({ ...t, done: true, status: undefined }));
      }

      function apply(e: ChatEvent) {
        switch (e.type) {
          case "meta":
            return setModel(e.model);
          case "status":
            return patchLast((t) => ({ ...t, status: e.text, steps: t.steps?.includes(e.text) ? t.steps : [...(t.steps ?? []), e.text] }));
          case "products":
            return patchLast((t) => ({ ...t, products: [...t.products, ...e.items] }));
          case "curate":
            return patchLast((t) => ({ ...t, curated: e.ids, refinements: e.refinements ?? t.refinements, status: t.answer ? undefined : "Escrevendo…" }));
          case "share":
            return patchLast((t) => ({ ...t, shareId: e.id }));
          case "text":
            return patchLast((t) => ({ ...t, answer: t.answer + e.text, status: undefined }));
          case "error":
            return patchLast((t) => ({ ...t, error: e.message }));
          case "done":
            return patchLast((t) => ({ ...t, ms: e.ms }));
        }
      }
  }, []);

  const send = useCallback(
    (text: string, keep: number, dept?: Dept, store?: string, context?: string[]) => {
      const q = text.trim();
      if (!q) return;
      const withContext = (t: { user: string; context?: string[] }) => (t.context?.length ? `${t.user}\n(Detalhes: ${t.context.join("; ")})` : t.user);
      const history: ChatTurn[] = turnsRef.current.slice(0, keep).flatMap((t) => [
        { role: "user" as const, content: withContext(t) },
        ...(t.answer ? [{ role: "assistant" as const, content: t.answer }] : []),
      ]);
      const forced = new URLSearchParams(location.search).get("model") ?? undefined;
      const profile = myContext.get() || undefined;
      return stream(q, keep, "/api/chat", (id) => ({ chatId: id, dept, store, model: forced, profile, messages: [...history, { role: "user", content: withContext({ user: q, context }) }] }), undefined, context);
    },
    [stream],
  );

  /**
   * Reopen a frozen turn (`?s=id`) at position `keep`: same tiles, order, answer and chips as
   * whoever copied the URL saw, from KV, without a new search. The conversation continues from it.
   */
  const restore = useCallback(async (id: string, keep: number): Promise<Share | null> => {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`).catch(() => null);
    if (!res?.ok) return null;
    const s = (await res.json()) as Share;
    if (keep === 0 || !chatId.current) chatId.current = newId();
    setModel(s.model);
    setTurns((all) => [
      ...all.slice(0, keep),
      { key: newId(), user: splitDetails(s.q).q, context: splitDetails(s.q).context, seed: s.seed, answer: s.answer, products: s.tiles, curated: s.tiles.map((t) => t.id), refinements: s.refinements, shareId: s.id, done: true },
    ]);
    return s;
  }, []);

  /** "Mais como este": category heuristics on the server, no model call. */
  const similarTo = useCallback(
    (t: Tile, keep: number, dept?: Dept) =>
      stream(`Mais como “${t.title}”`, keep, "/api/similar", (id) => ({
        chatId: id,
        dept,
        tile: { id: t.id, domain: t.domain, title: t.title, category: t.category, priceMinor: t.priceMinor, image: t.images[0] },
      }), { brand: t.brand, title: t.title, images: t.images.slice(0, 1) }),
    [stream],
  );

  const reset = () => {
    abort.current?.abort();
    chatId.current = "";
    setTurns([]);
  };

  return { turns, model, chatId: () => chatId.current, send, similarTo, restore, reset };
}

/** Fire-and-forget event to /api/event. */
export function track(name: "shop.feedback" | "shop.dismiss" | "shop.open" | "shop.share" | "shop.refine" | "shop.enrich.shown" | "shop.enrich.search", meta: Record<string, unknown>) {
  fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, meta }), keepalive: true }).catch(() => {});
}

/** "Refinar ✨": what the request may mean, ranked per dimension by Jev. Null when unavailable. */
export async function fetchRefine(text: string, dept: Dept, chatId?: string): Promise<RefineDim[] | null> {
  try {
    const res = await fetch("/api/refine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, dept, chatId }),
      signal: AbortSignal.timeout(4_000),
    });
    return res.ok ? ((await res.json()) as { dims: RefineDim[] }).dims : null;
  } catch {
    return null;
  }
}
