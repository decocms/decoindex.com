import { useEffect, useRef, useState } from "react";
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

/**
 * An overlay owns a history entry while it is open, so the browser's Back
 * (iOS edge swipe included) closes it instead of leaving the page. `layer`
 * nests them: Back from the gallery closes only the gallery. Returns the
 * close function the overlay's own buttons should use.
 */
export function useBackToClose(layer: number, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    history.pushState({ turn: history.state?.turn, layer }, "");
    const onPop = (e: PopStateEvent) => {
      if ((e.state?.layer ?? 0) < layer) closeRef.current();
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [layer]);
  // Closing from inside pops our own entry; the popstate above does the rest.
  return () => (history.state?.layer === layer ? history.back() : closeRef.current());
}

const COLS = ["", "grid-cols-2", "grid-cols-2", "grid-cols-3", "grid-cols-4 [@media(min-width:640px)_and_(min-height:900px)]:grid-cols-2"];

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
  const [shown, setShown] = useState<number | null>(null);
  /** Desktop: the photo on the stage left of the drawer. Thumbs switch it; phones open the gallery instead. */
  const [stage, setStage] = useState(0);
  const wide = () => matchMedia("(min-width: 1024px)").matches;
  const close = useBackToClose(1, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && shown == null && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [close, shown]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t.title}>
      <button type="button" aria-label="Fechar" onClick={close} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] lg:bg-ink/55 lg:backdrop-blur-md" />
      {t.images.length > 0 && (
        // The space the drawer leaves on a desktop is the product's photo, not a blurred grid.
        <div className="pointer-events-none relative hidden min-w-0 flex-1 items-center justify-center p-10 lg:flex">
          <button type="button" onClick={() => setShown(stage)} aria-label="Ver fotos em tela cheia" className="pointer-events-auto h-full max-h-[min(100%,1100px)] animate-rise">
            <img key={stage} src={thumb(t.images[stage], 1200)} alt={t.title} className="h-full w-auto max-w-full animate-rise rounded-sm object-contain shadow-2xl" />
          </button>
          {t.images.length > 1 &&
            ([-1, 1] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-label={d < 0 ? "Foto anterior" : "Próxima foto"}
                onClick={() => setStage((i) => (i + d + t.images.length) % t.images.length)}
                className={`pointer-events-auto absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-paper/90 text-xl text-ink transition hover:bg-paper ${d < 0 ? "left-6" : "right-6"}`}
              >
                {d < 0 ? "‹" : "›"}
              </button>
            ))}
        </div>
      )}
      <aside className="relative flex h-full w-full max-w-[520px] animate-rise flex-col overflow-y-auto bg-card shadow-2xl">
        <button type="button" onClick={close} aria-label="Fechar" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-card/90 text-lg">
          ×
        </button>
        <div className="flex flex-col gap-4 p-6 pt-14">
          {t.images.length > 0 && (
            // Fewer photos, bigger cards: they fill the row; one photo still gets half, never a full-bleed hero.
            // Four on a tall desktop screen: 2×2, the drawer has the room.
            <div className={`grid gap-2 ${COLS[Math.min(t.images.length, 4)]}`}>
              {t.images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => (wide() ? setStage(i) : setShown(i))}
                  aria-label={`Foto ${i + 1} de ${t.images.length}`}
                  aria-current={stage === i}
                  className={`aspect-[3/4] overflow-hidden rounded-sm bg-[#f0f0f0] transition hover:opacity-80 lg:ring-offset-2 ${stage === i ? "lg:ring-2 lg:ring-ink" : ""}`}
                >
                  <img src={thumb(src, 480)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
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
      {shown != null && <Gallery images={t.images} start={shown} onClose={() => setShown(null)} />}
    </div>
  );
}

/** Full-screen photos of one product. Native snap scrolling does the swiping; arrows and keys page it. */
function Gallery({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const close = useBackToClose(2, onClose);
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const go = (d: number) => strip.current?.scrollBy({ left: d * strip.current.clientWidth, behavior: "smooth" });
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const arrow = "absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-paper/90 text-xl text-ink transition hover:bg-paper disabled:opacity-0 sm:grid";
  return (
    <div className="fixed inset-0 z-[60] bg-ink" role="dialog" aria-modal="true" aria-label="Fotos">
      <div
        ref={strip}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
      >
        {images.map((src) => (
          <div key={src} className="h-full w-full shrink-0 snap-center p-4 sm:p-12">
            <img src={thumb(src, 1200)} alt="" className="h-full w-full object-contain" />
          </div>
        ))}
      </div>
      <button type="button" onClick={close} aria-label="Fechar" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-paper/90 text-lg text-ink">
        ×
      </button>
      <button type="button" onClick={() => go(-1)} disabled={at === 0} aria-label="Foto anterior" className={`${arrow} left-4`}>
        ‹
      </button>
      <button type="button" onClick={() => go(1)} disabled={at === images.length - 1} aria-label="Próxima foto" className={`${arrow} right-4`}>
        ›
      </button>
      <p className="absolute inset-x-0 bottom-4 text-center text-xs tabular-nums text-paper/80">
        {at + 1} / {images.length}
      </p>
    </div>
  );
}
