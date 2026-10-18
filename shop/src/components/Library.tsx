import { useState } from "react";
import type { Past } from "~/sdk/history";
import type { Tile } from "~/types";
import { FavoritesList, useFavCount } from "./Favorites";
import { HistoryList } from "./History";
import { useBackToClose } from "./Product";

export type LibraryTab = "historico" | "favoritos";

/** One header button for both: the clock and the heart, with the saved-pieces count. */
export function LibraryButton({ onClick }: { onClick: () => void }) {
  const n = useFavCount();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Histórico e favoritos"
      title="Histórico e favoritos"
      className="tap-scale relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-ink/70 transition hover:bg-ink/5 hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </svg>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
        <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3c.8-1.2 2.1-2.3 4.1-2.3 3.4 0 5.1 3.5 3.6 6.4C19 15.6 12 20 12 20z" />
      </svg>
      {n > 0 && <span className="absolute -right-1 -top-0.5 grid min-w-4 place-items-center rounded-full bg-sale px-1 text-[9px] font-semibold leading-4 text-white">{n}</span>}
    </button>
  );
}

/** Side drawer (like the product one): every past search, or the saved pieces. Back closes it. */
export function LibraryDrawer({ initial, onOpen, onOpenTile, onClose }: { initial: LibraryTab; onOpen: (p: Past) => void; onOpenTile: (t: Tile) => void; onClose: () => void }) {
  const [tab, setTab] = useState(initial);
  const close = useBackToClose(1, onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Histórico e favoritos">
      <button type="button" aria-label="Fechar" onClick={close} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
      <aside className="relative flex h-full w-full max-w-[440px] animate-rise flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div role="radiogroup" aria-label="Mostrar" className="flex rounded-full border border-line bg-card p-0.5 text-sm">
            {(
              [
                ["historico", "Histórico"],
                ["favoritos", "Favoritos"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-full px-3.5 py-1.5 transition ${tab === k ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="grid size-9 place-items-center rounded-full text-lg hover:bg-line">
            ×
          </button>
        </div>
        <p className="px-6 pt-3 text-xs text-ink-soft">{tab === "historico" ? "Todas as suas buscas" : "Uma lista por busca"}, salvas só neste aparelho.</p>
        {tab === "historico" ? <HistoryList onOpen={onOpen} /> : <FavoritesList onOpenTile={onOpenTile} />}
      </aside>
    </div>
  );
}
