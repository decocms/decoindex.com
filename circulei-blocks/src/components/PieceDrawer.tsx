import { useCallback, useEffect, useRef, useState } from "react";
import { Arrow, Pin, brl, img } from "~/components/ui";
import { useQuietHistory } from "~/components/quietHistory";
import type { CardData } from "~/types";

interface Detail {
  handle: string;
  title: string;
  brand: string;
  images: string[];
  price4: number;
  daily: number;
  owner: string;
  city: string;
  uf: string;
  dist: string | null;
  motoboy: boolean;
  facts: [string, string][];
}

/** Set while a drawer is mounted (after hydration): a card click opens the piece here, not on a new page. */
let opener: ((c: CardData) => void) | null = null;
export function openPiece(c: CardData): boolean {
  if (!opener) return false;
  opener(c);
  return true;
}

const outbound = (handle: string) => `https://www.circulei.co/products/${encodeURIComponent(handle)}?ref=decoindex`;

/**
 * A piece over the list, like the shop's drawer: the list stays (blurred) underneath, so closing it
 * or going back lands exactly where the visitor was. The URL is the piece's own (/p/{handle}), so a
 * copied link opens the full page. The photo opens at once with the copy the card already loaded and
 * swaps to the large one when it arrives.
 */
export function PieceDrawer() {
  const [card, setCard] = useState<CardData | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stage, setStage] = useState(0);
  const [big, setBig] = useState<Set<string>>(new Set());
  const current = useRef<string | null>(null);
  const quiet = useQuietHistory();

  const open = useCallback((c: CardData) => {
    current.current = c.handle;
    setCard(c);
    setDetail(null);
    setStage(0);
    quiet(() => history.pushState({ ...history.state, piece: c.handle }, "", `/p/${c.handle}`));
    fetch(`/api/peca?handle=${encodeURIComponent(c.handle)}`)
      .then((r) => (r.ok ? r.json() : null))
      // A slow answer for a piece already closed (or swapped) is dropped.
      .then((d: Detail | null) => d && current.current === d.handle && setDetail(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    opener = open;
    // Back closes the drawer. Forward onto a piece's URL has no card in hand: load its page.
    const onPop = () => {
      current.current = null;
      setCard(null);
      if (location.pathname.startsWith("/p/")) location.reload();
    };
    addEventListener("popstate", onPop);
    return () => {
      opener = null;
      removeEventListener("popstate", onPop);
    };
  }, [open]);

  const close = useCallback(() => history.back(), []);
  const images = detail?.images ?? (card ? [card.img, card.alt].filter((x): x is string => !!x) : []);

  // Every large photo starts loading as the drawer opens; each one shows once it is in the browser.
  useEffect(() => {
    const loaders = images.map((src) => {
      const im = new Image();
      im.onload = () => setBig((b) => new Set(b).add(src));
      im.src = img(src, 1100);
      return im;
    });
    return () => loaders.forEach((im) => (im.onload = null));
  }, [images.join("|")]);

  useEffect(() => {
    if (!card) return;
    const root = document.documentElement;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (images.length > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) setStage((i) => (i + (e.key === "ArrowRight" ? 1 : -1) + images.length) % images.length);
    };
    addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = "";
      removeEventListener("keydown", onKey);
    };
  }, [card, close, images.length]);

  if (!card) return null;
  const d = detail;
  const src = images[stage] ?? card.img;
  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label={card.title}>
      <button type="button" className="drawer-scrim" aria-label="Fechar" onClick={close} />
      <div className="drawer-stage">
        {/* A fixed frame: the small copy and the large one fill the same box, so nothing jumps when
            the large one lands. Keyed by position, not file, so the swap doesn't replay the entrance. */}
        <span className="stage-frame" key={stage}>
          <img src={img(src, big.has(src) ? 1100 : 540)} alt={card.title} />
        </span>
        {images.length > 1
          ? ([-1, 1] as const).map((dir) => (
              <button key={dir} type="button" className={`stage-nav ${dir < 0 ? "prev" : "next"}`} aria-label={dir < 0 ? "Foto anterior" : "Próxima foto"} onClick={() => setStage((i) => (i + dir + images.length) % images.length)}>
                {dir < 0 ? "‹" : "›"}
              </button>
            ))
          : null}
      </div>
      <aside className="drawer-panel">
        <button type="button" className="drawer-x" aria-label="Fechar" onClick={close}>
          <svg viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="drawer-thumbs">
          {images.map((s, i) => (
            <button key={s} type="button" aria-label={`Foto ${i + 1} de ${images.length}`} aria-current={stage === i} onClick={() => setStage(i)}>
              <img src={img(s, 540)} alt="" />
            </button>
          ))}
        </div>
        <p className="brand">{card.brand}</p>
        <h2 className="drawer-title">{card.title}</h2>
        <p className="price">
          <b>{brl(card.price4)}</b>
          <span>por 4 dias{d ? ` · ${brl(d.daily)} por dia` : ""}</span>
        </p>
        {d ? (
          <>
            <p className={`where${d.motoboy ? " near" : ""}`}>
              <Pin />
              <span>
                Do closet de <b>{d.owner}</b>, {d.city}, {d.uf}
                {d.dist ? ` · ${d.dist}` : ""}.<small>{d.motoboy ? "Entrega por motoboy." : "Enviamos pra você, com nota fiscal."}</small>
              </span>
            </p>
            <dl>
              {d.facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="drawer-wait" aria-live="polite">
            Carregando os detalhes…
          </p>
        )}
        <a className="btn rent" href={outbound(card.handle)}>
          Escolher datas na Circulei <Arrow />
        </a>
        <p className="fine">
          Reserva, pagamento e entrega acontecem em circulei.co · <a href={`/p/${card.handle}`}>página da peça</a>
        </p>
      </aside>
    </div>
  );
}
