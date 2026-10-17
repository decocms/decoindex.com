import { SiteHeader } from "~/components/Share";

const IDEAS = ["Vestido de linho para o verão", "Tênis de corrida até R$ 600", "Biquíni de luxo", "Camisa social masculina"];

/**
 * Any dead end (unknown URL, expired share) turns into a search: the form is a plain GET to
 * `/?q=`, which the home already treats as a deep link, so it works before hydration too.
 */
export function Lost({ title = "Essa página não existe.", body = "A peça que você procura pode estar em alguma das 57 marcas." }: { title?: string; body?: string }) {
  return (
    <section className="relative min-h-dvh overflow-x-clip">
      <SiteHeader />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-5 pb-16 pt-[12vh] text-center">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[45%] -z-10 h-[300px] w-[min(760px,100vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(217,249,157,0.45),rgba(196,181,253,0.18)_55%,transparent)] blur-2xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">404</p>
        <h1 className="mt-3 text-4xl font-medium leading-tight tracking-[-0.03em] text-balance md:text-5xl">{title}</h1>
        <p className="mt-4 text-ink-soft text-pretty">{body}</p>
        <form action="/" method="get" className="mt-7 flex w-full items-center gap-2 rounded-full border border-line bg-card py-1.5 pl-5 pr-1.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
          <input name="q" required placeholder="O que você está procurando?" className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-ink-soft/70" />
          <button type="submit" className="tap-scale rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">
            Buscar
          </button>
        </form>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {IDEAS.map((q) => (
            <a key={q} href={`/?${new URLSearchParams({ q })}`} className="tap-scale rounded-full border border-line bg-card px-3.5 py-2 text-sm text-ink-soft transition hover:border-ink/40 hover:text-ink">
              {q}
            </a>
          ))}
        </div>
        <p className="mt-10 text-sm text-ink-soft">
          <a href="/" className="underline decoration-ink/20 underline-offset-2 hover:text-ink">Voltar ao início</a>
          <span className="mx-2">·</span>
          <a href="/como-funciona" className="underline decoration-ink/20 underline-offset-2 hover:text-ink">Como funciona</a>
        </p>
      </div>
    </section>
  );
}
