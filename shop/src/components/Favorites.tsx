import { favorites, useFavorites } from "~/sdk/favorites";
import type { Tile } from "~/types";
import { money, thumb, useBackToClose } from "./Product";

/** The heart button in the header, with how many pieces are saved. */
export function FavoritesButton({ onClick }: { onClick: () => void }) {
  const n = useFavorites().reduce((s, l) => s + l.items.length, 0);
  return (
    <button type="button" onClick={onClick} aria-label="Favoritos" title="Favoritos" className="tap-scale relative grid size-8 shrink-0 place-items-center rounded-full text-ink/70 transition hover:bg-ink/5 hover:text-ink">
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
        <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3c.8-1.2 2.1-2.3 4.1-2.3 3.4 0 5.1 3.5 3.6 6.4C19 15.6 12 20 12 20z" />
      </svg>
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-sale px-1 text-[9px] font-semibold leading-4 text-white">{n}</span>}
    </button>
  );
}

/** Side drawer with the saved pieces, one list per search. Back closes it. */
export function FavoritesDrawer({ onOpenTile, onClose }: { onOpenTile: (t: Tile) => void; onClose: () => void }) {
  const lists = useFavorites();
  const close = useBackToClose(1, onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Favoritos">
      <button type="button" aria-label="Fechar" onClick={close} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
      <aside className="relative flex h-full w-full max-w-[440px] animate-rise flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Favoritos</h2>
            <p className="text-xs text-ink-soft">Uma lista por busca, salvas só neste aparelho.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="grid size-9 place-items-center rounded-full text-lg hover:bg-line">
            ×
          </button>
        </div>
        {lists.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-ink-soft">
            Toque no ♡ de uma peça, ou numa foto enquanto a busca roda, e ela fica guardada aqui, na lista daquela busca.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {lists.map((l) => (
              <section key={l.name} className="border-b border-line/70 px-6 py-5">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 truncate text-sm font-medium first-letter:uppercase">{l.name}</h3>
                  <button type="button" onClick={() => favorites.dropList(l.name)} className="shrink-0 text-[11px] text-ink-soft underline-offset-2 hover:underline">
                    Apagar lista
                  </button>
                </div>
                <ul className="grid grid-cols-3 gap-2">
                  {l.items.map((t) => (
                    <li key={t.id} className="group relative">
                      <button type="button" onClick={() => onOpenTile(t)} className="block w-full text-left">
                        <img src={thumb(t.images[0] ?? "", 240)} alt="" loading="lazy" className="aspect-[3/4] w-full rounded-sm bg-[#f2f2f2] object-cover" />
                        <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t.brand}</span>
                        <span className="block text-xs tabular-nums">{money(t.priceMinor, t.currency)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => favorites.remove(t.id)}
                        aria-label={`Remover ${t.title}`}
                        className="absolute right-1 top-1 grid size-6 place-items-center rounded-full glass-white text-xs opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
