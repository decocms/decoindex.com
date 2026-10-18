import { favorites, useFavorites } from "~/sdk/favorites";
import type { Tile } from "~/types";
import { money, thumb } from "./Product";

/** How many pieces are saved, across every list. */
export const useFavCount = () => useFavorites().reduce((s, l) => s + l.items.length, 0);

/** The saved pieces, one list per search. Shown in the library drawer. */
export function FavoritesList({ onOpenTile }: { onOpenTile: (t: Tile) => void }) {
  const lists = useFavorites();
  return (
    <>
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
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-white/90 shadow-sm text-xs opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:opacity-100"
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
    </>
  );
}
