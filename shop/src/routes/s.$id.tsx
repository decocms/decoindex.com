import { useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type { Share, Tile } from "~/types";
import { ProductDrawer, ProductTile, outbound, thumb } from "~/components/Product";
import { ShareButton, SiteHeader } from "~/components/Share";
import { track } from "~/sdk/useShopChat";

/**
 * A shared search, frozen when the chat finished. Server-rendered from KV — no
 * LLM call, so a link opened from WhatsApp shows the same picks in ~100ms, and
 * the crawler that builds the link preview gets real title/description/image.
 */
const getShare = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }): Promise<Share | null> => {
    if (!/^[0-9a-zA-Z]{8}$/.test(data)) return null;
    const raw = await env.SHARES?.get(`s:${data}`);
    return raw ? (JSON.parse(raw) as Share) : null;
  });

export const Route = createFileRoute("/s/$id")({
  loader: async ({ params }) => {
    const share = await getShare({ data: params.id });
    if (!share) throw notFound();
    return share;
  },
  head: ({ loaderData: s }) => {
    if (!s) return {};
    const title = `“${s.q}” — deco shop`;
    const brands = [...new Set(s.tiles.map((t) => t.brand))].slice(0, 4).join(", ");
    const description = s.answer || `${s.tiles.length} achados em ${brands}.`;
    const image = s.tiles[0]?.images[0];
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // Shared picks are for people, not search engines: a list of merchant PDPs must not compete with them.
        { name: "robots", content: "noindex" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(image
          ? [
              // The merchant's own CDN, resized by it — never rehosted.
              { property: "og:image", content: thumb(image, 800) },
              { name: "twitter:image", content: thumb(image, 800) },
            ]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: SharedBoard,
  notFoundComponent: Gone,
});

function SharedBoard() {
  const s = Route.useLoaderData();
  const [open, setOpen] = useState<Tile | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const brands = [...new Set(s.tiles.map((t) => t.brand))];
  const when = new Date(s.createdAt).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  const again = (q: string) => `/?${new URLSearchParams({ q, ...(s.dept ? { dept: s.dept } : {}), ...(s.store ? { store: s.store } : {}) })}`;
  const tiles = s.tiles.filter((t) => !hidden.has(t.id));

  return (
    <section className="min-h-dvh">
      <SiteHeader right={<a href="/" className="tap-scale rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">Fazer minha busca</a>} />

      <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-8 md:px-8 md:pt-12">
        <div className="max-w-3xl animate-rise">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Achados do deco shop</p>
          <h1 className="mt-3 text-[2rem] font-medium leading-[1.05] tracking-[-0.03em] text-balance md:text-5xl">“{s.q}”</h1>
          {s.answer && <p className="mt-4 text-base leading-relaxed text-ink-soft text-pretty md:text-lg">{s.answer}</p>}
          <p className="mt-3 text-xs text-ink-soft/80">
            {s.tiles.length} peças · {brands.slice(0, 5).join(", ")}
            {brands.length > 5 ? ` e mais ${brands.length - 5}` : ""} · preços vistos em {when}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <ShareButton id={s.id} q={s.q} variant="solid" />
            <a href={again(s.q)} className="tap-scale rounded-full border border-ink/15 px-5 py-3 text-sm font-medium transition hover:border-ink">
              Refazer com preços de hoje
            </a>
          </div>
          {s.refinements.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-5 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
              {s.refinements.map((r) => (
                <a key={r} href={again(`${s.q} — ${r}`)} className="tap-scale shrink-0 rounded-full bg-[#f2f2f2] px-3 py-1.5 text-xs font-medium hover:bg-[#e8e8e8]">
                  {r}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {tiles.map((t, i) => (
            <ProductTile
              key={t.id}
              t={t}
              index={i}
              onOpen={() => {
                setOpen(t);
                track("shop.open", { share: s.id, id: t.id });
              }}
              onMore={() => (location.href = again(`Mais opções parecidas com "${t.title}" da ${t.brand}.`))}
              onDismiss={() => setHidden((h) => new Set(h).add(t.id))}
            />
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-xl text-center">
          <p className="text-2xl font-medium tracking-tight">Procurando outra coisa?</p>
          <p className="mt-2 text-sm text-ink-soft">Diga o que você quer e o deco shop busca em FARM, Animale, Osklen, Reserva, FILA, New Balance e mais.</p>
          <a href="/" className="tap-scale mt-5 inline-block rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-white">
            Começar minha busca
          </a>
        </div>
      </div>

      {open && (
        <ProductDrawer
          t={open}
          href={outbound(open, `share:${s.id}`, s.model)}
          onClose={() => setOpen(null)}
          onMore={() => (location.href = again(`Mais opções parecidas com "${open.title}" da ${open.brand}.`))}
          onChange={(what) => (location.href = again(`Como "${open.title}" da ${open.brand}, mas ${what}.`))}
        />
      )}
    </section>
  );
}

function Gone() {
  return (
    <section className="min-h-dvh">
      <SiteHeader />
      <div className="mx-auto max-w-xl px-5 pt-[18vh] text-center">
        <h1 className="text-3xl font-medium tracking-tight">Essa seleção não existe mais.</h1>
        <p className="mt-3 text-ink-soft">Mas dá pra fazer uma nova em segundos.</p>
        <a href="/" className="tap-scale mt-6 inline-block rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-white">
          Fazer minha busca
        </a>
      </div>
    </section>
  );
}
