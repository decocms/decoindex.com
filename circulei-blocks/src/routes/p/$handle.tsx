import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { useRef, useState } from "react";
import { Arrow, Card, Hb, Kick, Pin, brl, img, srcset } from "~/components/ui";
import Header from "~/sections/Header";
import Footer from "~/sections/Footer";
import { FOOTER_LINKS } from "~/components/footerLinks";

/** A piece's page. Not a CMS page: everything on it is the piece's own data. */
const getPiece = createServerFn({ method: "GET" })
  .inputValidator((handle: string) => handle)
  .handler(async ({ data }) => {
    const v = await import("~/server/view.server");
    const c = await v.ctxFor(getRequest());
    const p = v.pdp(c, data);
    return p ? { ...p, place: v.place(c), hubs: v.hubs(c) } : null;
  });

const outbound = (handle: string) => `https://www.circulei.co/products/${encodeURIComponent(handle)}?ref=decoindex`;

export const Route = createFileRoute("/p/$handle")({
  loader: async ({ params }) => {
    const d = await getPiece({ data: params.handle });
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData: d }) =>
    d
      ? {
          meta: [
            { title: `${d.piece.title} · ${d.piece.brand} · Circulei` },
            { name: "description", content: `Alugue ${d.piece.title} (${d.piece.brand}) por ${brl(d.piece.price4)} por 4 dias. Do closet de ${d.piece.owner}, ${d.piece.city}.` },
            ...(d.piece.images[0] ? [{ property: "og:image", content: img(d.piece.images[0], 1200) }] : []),
          ],
        }
      : {},
  component: Pdp,
});

function Pdp() {
  const { piece: p, similar, place, hubs } = Route.useLoaderData();
  const [at, setAt] = useState(0);
  const lb = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    const t = track.current;
    if (t) t.scrollTo({ left: Math.max(0, Math.min(p.images.length - 1, i)) * t.clientWidth, behavior: "smooth" });
  };
  const open = (i: number) => {
    lb.current?.showModal();
    if (track.current) track.current.scrollLeft = i * track.current.clientWidth;
    setAt(i);
  };
  return (
    <div className="pdp-page">
      <Header place={place} hubs={hubs} />
      <main className="pdp wrap">
        <div className="gallery" aria-label="Fotos">
          {p.images.map((u, i) => (
            <button key={u} type="button" className="zoom" aria-label={`Ampliar foto ${i + 1} de ${p.images.length}`} onClick={() => open(i)}>
              <img src={img(u, 900)} srcSet={srcset(u)} sizes="(min-width: 900px) 50vw, 92vw" alt={`${p.title}, foto ${i + 1}`} loading={i ? "lazy" : "eager"} fetchPriority={i ? "auto" : "high"} decoding="async" />
            </button>
          ))}
        </div>
        <dialog
          className="lightbox"
          aria-label={`Fotos de ${p.title}`}
          ref={lb}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(at + 1);
            if (e.key === "ArrowLeft") go(at - 1);
          }}
        >
          <div className="lb-track" ref={track} onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
            {p.images.map((u, i) => (
              <img key={u} src={img(u, 1600)} alt={`${p.title}, foto ${i + 1}`} loading="lazy" decoding="async" />
            ))}
          </div>
          <p className="lb-n" aria-live="polite">
            {at + 1} / {p.images.length}
          </p>
          <button type="button" className="lb-x" aria-label="Fechar" onClick={() => lb.current?.close()}>
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <button type="button" className="lb-prev" aria-label="Foto anterior" onClick={() => go(at - 1)}>
            <svg viewBox="0 0 24 24">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="lb-next" aria-label="Próxima foto" onClick={() => go(at + 1)}>
            <Arrow />
          </button>
        </dialog>
        <div className="info">
          <Kick>{p.brand}</Kick>
          <h1 className="hb">{p.title}</h1>
          <p className="price">
            <b>{brl(p.price4)}</b>
            <span>por 4 dias · {brl(p.daily)} por dia</span>
          </p>
          <p className={`where${p.motoboy ? " near" : ""}`}>
            <Pin />
            <span>
              Do closet de <b>{p.owner}</b>, {p.city}, {p.uf}
              {p.dist ? ` · ${p.dist}` : ""}.<small>{p.motoboy ? "Entrega por motoboy." : "Enviamos pra você, com nota fiscal."}</small>
            </span>
          </p>
          <dl>
            {p.facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <a className="btn rent" href={outbound(p.handle)}>
            Escolher datas na Circulei <Arrow />
          </a>
          <p className="fine">Reserva, pagamento e entrega acontecem em circulei.co.</p>
        </div>
      </main>
      <div className="buybar">
        <span>
          <b>{brl(p.price4)}</b> 4 dias
        </span>
        <a className="btn rent" href={outbound(p.handle)}>
          Escolher datas
        </a>
      </div>
      {similar.length ? (
        <section className="wrap similar">
          <Kick>Pra você também</Kick>
          <Hb dim="No seu tamanho, perto de você.">Combina com você.</Hb>
          <div className="grid">
            {similar.map((c, i) => (
              <Card key={c.handle} c={c} i={i} />
            ))}
          </div>
        </section>
      ) : null}
      <Footer links={FOOTER_LINKS} />
    </div>
  );
}
