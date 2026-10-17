import { useCallback, useRef, useState } from "react";
import type { ChatEvent, ChatTurn, Tile } from "~/types";

export type Dept = "feminino" | "masculino";

export interface Turn {
  user: string;
  answer: string;
  status?: string;
  /** Every tile the searches returned, in arrival order. */
  products: Tile[];
  /** The model's pick, in its order. Undefined until show_products runs. */
  curated?: string[];
  /** Next steps the model suggests, shown as chips. */
  refinements?: string[];
  /** Set once the server froze this turn at /s/{id}. */
  shareId?: string;
  error?: string;
  done: boolean;
  ms?: number;
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export function useShopChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [model, setModel] = useState<string>();
  const chatId = useRef<string>("");
  const abort = useRef<AbortController | null>(null);

  const patchLast = (fn: (t: Turn) => Turn) =>
    setTurns((all) => (all.length ? [...all.slice(0, -1), fn(all[all.length - 1])] : all));

  /** One turn: push it, POST `endpoint`, fold the NDJSON events into it. */
  const stream = useCallback(async (label: string, endpoint: string, payload: (id: string) => object) => {
    abort.current?.abort();
    const ctrl = (abort.current = new AbortController());
    if (!chatId.current) chatId.current = newId();
    setTurns((all) => [...all, { user: label, answer: "", products: [], done: false, status: "Pensando…" }]);
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
            return patchLast((t) => ({ ...t, status: e.text }));
          case "products":
            return patchLast((t) => ({ ...t, products: [...t.products, ...e.items], status: "Escolhendo os melhores…" }));
          case "curate":
            return patchLast((t) => ({ ...t, curated: e.ids, refinements: e.refinements }));
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
    (text: string, dept?: Dept, store?: string) => {
      const q = text.trim();
      if (!q) return;
      const history: ChatTurn[] = turns.flatMap((t) => [
        { role: "user" as const, content: t.user },
        ...(t.answer ? [{ role: "assistant" as const, content: t.answer }] : []),
      ]);
      const forced = new URLSearchParams(location.search).get("model") ?? undefined;
      return stream(q, "/api/chat", (id) => ({ chatId: id, dept, store, model: forced, messages: [...history, { role: "user", content: q }] }));
    },
    [turns, stream],
  );

  /** "Mais como este": category heuristics on the server, no model call. */
  const similarTo = useCallback(
    (t: Tile, dept?: Dept) =>
      stream(`Mais como “${t.title}”`, "/api/similar", (id) => ({
        chatId: id,
        dept,
        tile: { id: t.id, domain: t.domain, title: t.title, category: t.category, priceMinor: t.priceMinor },
      })),
    [stream],
  );

  const reset = () => {
    abort.current?.abort();
    chatId.current = "";
    setTurns([]);
  };

  return { turns, model, chatId: () => chatId.current, send, similarTo, reset };
}

/** Fire-and-forget event to /api/event. */
export function track(name: "shop.feedback" | "shop.dismiss" | "shop.open" | "shop.share" | "shop.refine", meta: Record<string, unknown>) {
  fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, meta }), keepalive: true }).catch(() => {});
}
