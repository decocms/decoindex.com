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

  const send = useCallback(
    async (text: string, dept?: Dept) => {
      const q = text.trim();
      if (!q) return;
      abort.current?.abort();
      const ctrl = (abort.current = new AbortController());
      if (!chatId.current) chatId.current = newId();

      const history: ChatTurn[] = turns.flatMap((t) => [
        { role: "user" as const, content: t.user },
        ...(t.answer ? [{ role: "assistant" as const, content: t.answer }] : []),
      ]);
      setTurns((all) => [...all, { user: q, answer: "", products: [], done: false, status: "Pensando…" }]);

      const forced = new URLSearchParams(location.search).get("model") ?? undefined;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chatId: chatId.current, dept, model: forced, messages: [...history, { role: "user", content: q }] }),
          signal: ctrl.signal,
        });
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
            return patchLast((t) => ({ ...t, curated: e.ids }));
          case "text":
            return patchLast((t) => ({ ...t, answer: t.answer + e.text, status: undefined }));
          case "error":
            return patchLast((t) => ({ ...t, error: e.message }));
          case "done":
            return patchLast((t) => ({ ...t, ms: e.ms }));
        }
      }
    },
    [turns],
  );

  const reset = () => {
    abort.current?.abort();
    chatId.current = "";
    setTurns([]);
  };

  return { turns, model, chatId: () => chatId.current, send, reset };
}

/** Fire-and-forget event to /api/event. */
export function track(name: "shop.feedback" | "shop.dismiss" | "shop.open", meta: Record<string, unknown>) {
  fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, meta }), keepalive: true }).catch(() => {});
}
