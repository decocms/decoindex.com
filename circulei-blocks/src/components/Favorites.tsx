import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { brl, img } from "~/components/ui";
import { openPiece } from "~/components/PieceDrawer";
import { favorites, useFavCount, useFavorites } from "~/sdk/favorites";

/** Header button: the heart with the saved-pieces count. Opens the favorites drawer. */
export function FavoritesButton() {
  const n = useFavCount();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="fav-btn" aria-label={`Favoritos${n ? `: ${n} peças` : ""}`} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3c.8-1.2 2.1-2.3 4.1-2.3 3.4 0 5.1 3.5 3.6 6.4C19 15.6 12 20 12 20z" />
        </svg>
        {n > 0 ? <span className="fav-n">{n}</span> : null}
      </button>
      {/* Portaled to <body>: inside the header's <nav> it picked up the nav links' styles. */}
      {open ? createPortal(<FavoritesDrawer onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

/** The saved pieces, one list per search or city, like the shop's library drawer (without history). */
function FavoritesDrawer({ onClose }: { onClose: () => void }) {
  const lists = useFavorites();
  useEffect(() => {
    const root = document.documentElement;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = "";
      removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Favoritos">
      <button type="button" className="drawer-scrim" aria-label="Fechar" onClick={onClose} />
      <aside className="drawer-panel favs">
        <button type="button" className="drawer-x" aria-label="Fechar" onClick={onClose}>
          <svg viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <h2 className="drawer-title">Favoritos</h2>
        <p className="fine">Uma lista por busca ou cidade, salvas só neste aparelho.</p>
        {lists.length === 0 ? (
          <p className="favs-empty">Toque no ♡ de uma peça e ela fica guardada aqui.</p>
        ) : (
          lists.map((l) => (
            <section key={l.name} className="favs-list">
              <div className="favs-head">
                <h3>{l.name}</h3>
                <button type="button" onClick={() => favorites.dropList(l.name)}>
                  Apagar lista
                </button>
              </div>
              <ul>
                {l.items.map((c) => (
                  <li key={c.handle}>
                    <a
                      href={`/p/${c.handle}`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        onClose();
                        openPiece(c, l.name);
                      }}
                    >
                      <img src={img(c.img, 360)} alt="" loading="lazy" />
                      <span className="b">{c.brand}</span>
                      <span>{brl(c.price4)} / 4 dias</span>
                    </a>
                    <button type="button" className="favs-x" aria-label={`Remover ${c.title}`} onClick={() => favorites.remove(c.handle)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </aside>
    </div>
  );
}
