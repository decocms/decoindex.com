import { useEffect, useState } from "react";
import type { Tile } from "~/types";

export function money(minor: number | undefined, currency = "BRL") {
  if (minor == null) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}

/** Ask the merchant's own image CDN for a smaller file. Still their URL — we never rehost. */
/** Width only: VTEX pads a fixed WxH box with white, `-W-auto` keeps the photo's own ratio. */
export function thumb(url: string, w = 480) {
  if (/vteximg\.com\.br|vtexassets\.com/.test(url)) return url.replace(/\/arquivos\/ids\/(\d+)(-\d+-(?:\d+|auto))?\//, `/arquivos/ids/$1-${w}-auto/`);
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) {
    const u = new URL(url);
    u.searchParams.set("width", String(w));
    return u.toString();
  }
  return url;
}

export function outbound(t: Tile, chatId: string, model?: string) {
  const p = new URLSearchParams({ u: t.url, c: chatId, id: t.id });
  if (model) p.set("m", model);
  return `/go?${p}`;
}

function Price({ t }: { t: Tile }) {
  const sale = t.listPriceMinor && t.priceMinor && t.listPriceMinor > t.priceMinor;
  return (
    <p className="text-sm tabular-nums">
      {sale && <span className="mr-1.5 text-ink-soft line-through">{money(t.listPriceMinor, t.currency)}</span>}
      <span className={sale ? "text-sale" : ""}>{money(t.priceMinor, t.currency)}</span>
    </p>
  );
}

export function ProductTile({
  t,
  index,
  onOpen,
  onMore,
  onDismiss,
}: {
  t: Tile;
  index: number;
  onOpen: () => void;
  onMore: () => void;
  onDismiss: () => void;
}) {
  const [a, b] = t.images;
  return (
    <article className="group animate-rise" style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}>
      <div className="relative aspect-[372/498] overflow-hidden rounded-sm bg-[#f0f0f0]">
        <button type="button" onClick={onOpen} className="block h-full w-full" aria-label={`Ver ${t.brand} ${t.title}`}>
          {a && <img src={thumb(a)} alt="" loading={index < 8 ? "eager" : "lazy"} className="h-full w-full object-cover" />}
          {b && (
            <img
              src={thumb(b)}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
          )}
        </button>
        {t.listPriceMinor && t.priceMinor && t.listPriceMinor > t.priceMinor ? (
          <span className="pointer-events-none absolute left-2 top-2 rounded-xs frost px-1.5 py-1 text-2xs font-semibold leading-none">
            -{Math.round((1 - t.priceMinor / t.listPriceMinor) * 100)}%
          </span>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Mostrar menos como este"
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full glass-white text-ink opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          ×
        </button>
        <button
          type="button"
          onClick={onMore}
          className="absolute inset-x-2 bottom-2 frost rounded-full px-3 py-2 text-xs font-medium opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          Mais como este
        </button>
      </div>
      <button type="button" onClick={onOpen} className="mt-2 block w-full text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{t.brand}</p>
        <p className="line-clamp-2 text-sm leading-snug">{t.title}</p>
        <Price t={t} />
      </button>
    </article>
  );
}

export function TileSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[372/498] rounded-sm" />
      <div className="skeleton mt-2 h-3 w-1/3 rounded" />
      <div className="skeleton mt-1.5 h-3 w-4/5 rounded" />
    </div>
  );
}

export function ProductDrawer({
  t,
  href,
  onClose,
  onMore,
  onChange,
}: {
  t: Tile;
  href: string;
  onClose: () => void;
  onMore: () => void;
  onChange: (what: string) => void;
}) {
  const [change, setChange] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t.title}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
      <aside className="relative flex h-full w-full max-w-[520px] animate-rise flex-col overflow-y-auto bg-card shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-card/90 text-lg">
          ×
        </button>
        <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
          {t.images.map((src) => (
            <img key={src} src={thumb(src, 800)} alt="" className="aspect-[3/4] w-full shrink-0 snap-center object-cover" />
          ))}
        </div>
        <div className="flex flex-col gap-4 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">{t.brand}</p>
            <h2 className="mt-1 font-medium tracking-tight text-3xl leading-tight">{t.title}</h2>
            <div className="mt-2 text-base">
              <Price t={t} />
            </div>
          </div>
          {t.sizes.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-ink-soft">Tamanhos no catálogo</p>
              <div className="flex flex-wrap gap-1.5">
                {t.sizes.map((s) => (
                  <span key={s} className="min-w-9 rounded-full border border-line px-2.5 py-1 text-center text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {t.description && <p className="text-sm leading-relaxed text-ink-soft">{t.description}</p>}
          <a href={href} target="_blank" rel="noopener" className="tap-scale rounded-full bg-forest px-5 py-3.5 text-center text-sm font-medium text-paper transition hover:bg-ink">
            Comprar na {t.brand} ↗
          </a>
          <p className="-mt-2 text-center text-[11px] text-ink-soft">Preço e estoque finais na loja.</p>
          <button type="button" onClick={onMore} className="tap-scale rounded-full border border-ink/15 px-5 py-3 text-sm font-medium transition hover:border-ink">
            Mais como este
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (change.trim()) onChange(change.trim());
            }}
            className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-4 pr-1"
          >
            <input
              value={change}
              onChange={(e) => setChange(e.target.value)}
              placeholder="Mudar algo? ex.: mais curto, em azul…"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-ink-soft/70"
            />
            <button type="submit" className="rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-paper disabled:opacity-40" disabled={!change.trim()}>
              Refinar
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
