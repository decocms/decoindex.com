import { useState } from "react";
import { pastSearches, type Past } from "~/sdk/history";
import { thumb } from "./Product";

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return `hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 2) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
};

/** This device's past searches, every one of them, newest first. Shown in the library drawer. */
export function HistoryList({ onOpen }: { onOpen: (p: Past) => void }) {
  const [items, setItems] = useState(() => pastSearches.list());
  if (items.length === 0) return <p className="px-6 py-12 text-center text-sm text-ink-soft">Suas buscas aparecem aqui, pra você voltar a elas quando quiser.</p>;
  return (
    <>
      <ol className="flex-1 overflow-y-auto">
        {items.map((p) => (
          <li key={p.id} className="border-b border-line/70">
            <button type="button" onClick={() => onOpen(p)} className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-ink/[0.03]">
              <span className="flex shrink-0 -space-x-4">
                {p.images.slice(0, 3).map((src, i) => (
                  <img key={src} src={thumb(src, 120)} alt="" loading="lazy" className="h-16 w-12 rounded-sm object-cover ring-2 ring-card" style={{ zIndex: 3 - i }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-medium leading-snug">{p.q}</span>
                {!!p.context?.length && <span className="mt-0.5 block truncate text-xs text-ink-soft">{p.context.join(" · ")}</span>}
                <span className="mt-1 block truncate text-[11px] text-ink-soft">
                  {when(p.at)} · {p.n} peças · {p.brands.join(", ")}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="border-t border-line px-6 py-3 text-right">
        <button type="button" onClick={() => { pastSearches.clear(); setItems([]); }} className="text-xs text-ink-soft underline-offset-2 hover:underline">
          Limpar histórico
        </button>
      </div>
    </>
  );
}
