import { useState } from "react";
import { pastSearches, type Past } from "~/sdk/history";
import { thumb, useBackToClose } from "./Product";

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return `hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 2) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
};

/** The clock button in the header. */
export function HistoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Histórico de buscas" title="Histórico" className="tap-scale grid size-8 shrink-0 place-items-center rounded-full text-ink/70 transition hover:bg-ink/5 hover:text-ink">
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </svg>
    </button>
  );
}

/** Side drawer (like the product one) with this device's past searches. Back closes it. */
export function HistoryDrawer({ onOpen, onClose }: { onOpen: (p: Past) => void; onClose: () => void }) {
  const [items, setItems] = useState(() => pastSearches.list());
  const close = useBackToClose(1, onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Histórico de buscas">
      <button type="button" aria-label="Fechar" onClick={close} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
      <aside className="relative flex h-full w-full max-w-[440px] animate-rise flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Suas buscas</h2>
            <p className="text-xs text-ink-soft">Salvas só neste aparelho.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="grid size-9 place-items-center rounded-full text-lg hover:bg-line">
            ×
          </button>
        </div>
        {items.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-ink-soft">Suas buscas aparecem aqui, pra você voltar a elas quando quiser.</p>
        ) : (
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
        )}
        {items.length > 0 && (
          <div className="border-t border-line px-6 py-3 text-right">
            <button type="button" onClick={() => { pastSearches.clear(); setItems([]); }} className="text-xs text-ink-soft underline-offset-2 hover:underline">
              Limpar histórico
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
