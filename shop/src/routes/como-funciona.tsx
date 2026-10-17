import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "~/components/Share";

/**
 * /como-funciona — how a question becomes a grid of products, told like the decocms.com
 * investor updates: dark paper, Switzer, lime accents, numbered sections, one big diagram.
 * Static: every number on this page was measured (decoindex bench, the Jev A/B of Oct 2026);
 * when one changes, change it here by hand.
 */
export const Route = createFileRoute("/como-funciona")({
  head: () => ({
    meta: [
      { title: "Como funciona — deco shop" },
      {
        name: "description",
        content:
          "Da pergunta à vitrine: decoindex, curadoria de marcas, Jev e modelos de raciocínio em teste contínuo. Um projeto de pesquisa da decocms.com.",
      },
      { property: "og:title", content: "Como o deco shop funciona" },
      { name: "theme-color", content: "#0a0a0a" },
    ],
  }),
  component: HowItWorks,
});

const LIME = "#D0EC1A";

const CSS = `
.hw { background:#0a0a0a; color:#e7e5e4; }
.hw ::selection { background:${LIME}; color:#07401A; }
@keyframes hw-up { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:none } }
.hw-up { animation: hw-up .9s cubic-bezier(.16,1,.3,1) both; }
@keyframes hw-rise { from { opacity:0; transform:translateY(28px) } to { opacity:1; transform:none } }
@supports (animation-timeline: view()) {
  .hw-rise { animation: hw-rise linear both; animation-timeline: view(); animation-range: entry 0% entry 45%; }
}
@keyframes hw-flow { to { stroke-dashoffset: -24 } }
.hw-wire { stroke-dasharray: 4 8; animation: hw-flow 1.2s linear infinite; }
@keyframes hw-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(208,236,26,.0) } 50% { box-shadow: 0 0 0 6px rgba(208,236,26,.12) } }
.hw-hot { animation: hw-pulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .hw-up, .hw-rise, .hw-wire, .hw-hot { animation: none !important } }
`;

function HowItWorks() {
  return (
    <div className="hw min-h-dvh">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SiteHeader />

      <Hero />
      <Diagram />

      <Section n="01" kicker="A pergunta" title="Tudo começa como numa loja: alguém pedindo ajuda.">
        <Lead>
          “Vestido longo para madrinha de casamento de dia.” Não é uma busca por palavra-chave, é um pedido com contexto: ocasião,
          horário, comprimento, o que <B>não</B> pode (preto, brilho de noite). Um vendedor bom entenderia na hora. Uma caixa de busca
          de e-commerce devolve “vestido”. O deco shop trata a frase inteira como o briefing de um personal shopper — e vai buscar
          em 57 marcas brasileiras ao mesmo tempo.
        </Lead>
      </Section>

      <Section n="02" kicker="decoindex" title="As lojas, lidas como um agente lê: em markdown, não em HTML.">
        <Lead>
          Um agente que abre a página de uma loja recebe centenas de milhares de tokens de HTML, scripts e menus para achar meia dúzia
          de fatos. O <B>decoindex</B> é um proxy sobre as APIs públicas de catálogo da VTEX e da Shopify: troque o domínio da URL e a
          mesma página volta como markdown normalizado — título, preço de catálogo, tamanhos, categorias, link para a loja.
        </Lead>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Stat value="127×" label="menos tokens por página (mediana, 12 lojas)" />
          <Stat value="1.356×" label="na loja mais pesada do benchmark" />
          <Stat value="≤ 2" label="chamadas à loja por leitura, com cache" />
        </div>
        <Note>
          Menos tokens por página é o que torna barato navegar <i>mais</i>: o modelo pode abrir a árvore de categorias de seis lojas,
          comparar, voltar e abrir de novo, pelo custo que antes pagaria por uma única página. E o decoindex é canal, não concorrente:
          nunca hospeda imagem, sempre aponta para a loja, todo link de produto leva a atribuição.
        </Note>
      </Section>

      <Section n="03" kicker="Curadoria" title="57 marcas, cada uma com contexto.">
        <Lead>
          A lista não é “tudo que roda VTEX”. Escolhemos marcas pelo que elas significam — começando pelas lojas dos shoppings que
          definem moda no Brasil (Leblon, Iguatemi, JK) — e para cada uma escrevemos o que um vendedor saberia: o que vende, para quem,
          de onde vem, desde quando, em que faixa de preço.
        </Lead>
        <div className="mt-10 overflow-hidden rounded-2xl border border-neutral-800">
          {[
            ["FARM Rio", "Rio de Janeiro · desde 1997 · $$$", "estampas tropicais, vestidos coloridos, moda carioca"],
            ["PatBO", "Uberlândia, MG · desde 2012 · $$$$", "bordados artesanais, desfila na NYFW"],
            ["Olympikus", "Jundiaí, SP · desde 1975 · $$", "tênis de corrida nacional, custo-benefício"],
            ["Lenny Niemeyer", "Rio de Janeiro · desde 1991 · $$$$", "maiôs e biquínis autorais de cortes arquitetônicos"],
          ].map(([name, facts, about]) => (
            <div key={name} className="grid gap-1 border-t border-neutral-800 px-5 py-4 first:border-t-0 md:grid-cols-[180px_260px_1fr] md:gap-6">
              <span className="font-medium text-neutral-100">{name}</span>
              <span className="text-sm tabular-nums" style={{ color: LIME }}>
                {facts}
              </span>
              <span className="text-sm text-neutral-400">{about}</span>
            </div>
          ))}
        </div>
        <Note>
          É isso que faz “linho, das marcas cariocas” ou “biquíni de luxo” funcionarem. Cada fato foi pesquisado com fonte; onde as
          fontes discordam, o campo fica vazio — o modelo nunca recebe um palpite como se fosse fato.
        </Note>
      </Section>

      <Section n="04" kicker="Jev" title="Um modelo que não escreve: decide.">
        <Lead>
          O <B>Jev</B>, da TypeSafe, é um modelo de decisão. Ele não gera texto: recebe um estado e perguntas tipadas, e devolve
          respostas com probabilidades. Para o deco shop, a pergunta é a mesma 57 vezes — <i>“quão provável é esta marca ter o que o
          cliente pede?”</i> — numa escala de três níveis, todas respondidas em paralelo numa única chamada.
        </Lead>
        <JevScores />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Stat value="~0,8 s" label="para pontuar as 57 marcas" />
          <Stat value="US$ 0,0003" label="por chamada — só a entrada é cobrada" />
          <Stat value="57 → 10" label="marcas que seguem para o próximo passo" />
        </div>
        <Note>
          O Jev aparece duas vezes. Antes: escolhe as 10 marcas que o modelo de raciocínio vai considerar, então o prompt carrega 10
          fichas e não 57. Entre os passos: cada rodada de busca devolve até 90 produtos, e o Jev pontua cada um contra a conversa —
          só os 30 melhores voltam para o modelo ler (no máximo 8 por marca, para a seleção continuar misturada). A tela do cliente
          continua recebendo tudo.
        </Note>
      </Section>

      <Section n="05" kicker="Raciocínio, em teste contínuo" title="Sete modelos competindo, em produção, todo dia.">
        <Lead>
          Quem conduz a busca é um modelo de raciocínio com duas ferramentas. <B>find_products</B> consulta até seis lojas em paralelo
          pelo decoindex: com o tipo de peça, navega a árvore de categorias da loja e ordena pelos atributos (“linho”, “midi”,
          “corrida”); sem tipo, usa a busca da própria loja. <B>show_products</B> entrega a seleção final. Entre uma e outra, o modelo
          pode refazer a rodada com outras marcas ou outros termos — até cinco passos.
        </Lead>
        <div className="mt-10 flex flex-wrap gap-2">
          {["claude-haiku-5.5", "claude-sonnet-5.5", "deepseek-v4.1-flash", "glm-5.3-flash", "qwen3.8-flash", "muse-glimmer-30b", "gemini-3.8-flash"].map(
            (m) => (
              <span key={m} className="rounded-full border border-neutral-800 bg-neutral-900 px-3.5 py-1.5 text-sm text-neutral-300">
                {m}
              </span>
            ),
          )}
        </div>
        <Note>
          Cada conversa é atendida por um dos sete, sorteado e fixo naquela conversa. Um painel compara os modelos pelo que importa:
          quantas conversas viram clique para a loja, latência, quantos resultados bons, 👍/👎, e quanto custou cada busca. Quatro dos
          sete são de pesos abertos. O melhor modelo de hoje não precisa ser o de amanhã — a troca é uma linha de configuração.
        </Note>
      </Section>

      <Section n="06" kicker="Coleta e julgamento" title="Buscar é fácil. Escolher é o trabalho.">
        <Lead>
          Com até 90 produtos coletados por rodada, o modelo julga: respeita orçamento, tamanho, ocasião e o que o cliente excluiu,
          mistura marcas e escolhe de 8 a 24 peças, em ordem. Antes de chegar ao modelo, regras simples já tiraram o óbvio: peças do
          outro departamento, linhas infantis, a categoria errada que algumas lojas usam (“Kit Calcinhas” cadastrado como biquíni).
        </Lead>
        <Numbered
          items={[
            ["Filtra", "departamento, idade, tipo de peça — regras determinísticas, de graça"],
            ["Pontua", "o Jev ordena por relevância ao pedido e corta para 30"],
            ["Escolhe", "o modelo seleciona 8 a 24 e sugere 2 a 4 próximos passos"],
            ["Explica", "duas frases com o critério — sem listar preço, que já está na tela"],
          ]}
        />
      </Section>

      <Section n="07" kicker="A vitrine" title="E aí, a parte que o cliente vê.">
        <Lead>
          A grade aparece enquanto a busca acontece, e assenta quando a seleção chega. Cada peça abre com fotos, tamanhos e o link para
          comprar na própria loja — preço e estoque finais são sempre os da loja. “Mais como este” busca parecidos sem chamar modelo
          nenhum. Toda busca vira um link compartilhável, com a foto da peça no preview do WhatsApp. E a mesma pergunta, no mesmo dia,
          volta do cache em 0,2 s.
        </Lead>
      </Section>

      <Research />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: `radial-gradient(ellipse 70% 50% at 50% 110%, ${LIME} 0%, #07401A 40%, transparent 70%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(${LIME} 1px, transparent 1px), linear-gradient(90deg, ${LIME} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative mx-auto max-w-[960px] px-6 pb-20 pt-16 md:pb-28 md:pt-24">
        <p className="hw-up flex items-center gap-2 text-xs uppercase tracking-[0.2em]" style={{ color: `${LIME}cc`, animationDelay: ".1s" }}>
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: LIME }} />
          Como funciona · pesquisa decocms.com
        </p>
        <h1 className="hw-up mt-6 text-[clamp(40px,7vw,84px)] font-medium leading-[1.02] tracking-[-0.03em] text-neutral-50" style={{ animationDelay: ".2s" }}>
          Da pergunta
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(160deg, ${LIME} 0%, #8caa25 45%, #2a5a18 90%)` }}
          >
            à vitrine.
          </span>
        </h1>
        <p className="hw-up mt-8 max-w-[720px] text-2xl font-medium leading-snug text-neutral-100 md:text-3xl" style={{ animationDelay: ".45s" }}>
          Uma frase vira uma seleção de peças de 57 marcas em cerca de dez segundos.{" "}
          <span style={{ color: LIME }}>Aqui está o caminho que ela percorre.</span>
        </p>
      </div>
    </section>
  );
}

/** The pipeline as one figure: a vertical spine of stages, with the tool loop drawn beside the reasoning model. */
function Diagram() {
  const stages: { k: string; title: string; body: string; metric?: string; hot?: boolean }[] = [
    { k: "Pergunta", title: "“vestido longo para madrinha, de dia”", body: "o pedido inteiro, com ocasião e restrições" },
    { k: "Jev · marcas", title: "57 → 10 marcas", body: "uma pergunta de score por marca, numa chamada", metric: "0,8 s" },
    { k: "Modelo de raciocínio", title: "1 de 7, em teste contínuo", body: "planeja, chama ferramentas, refaz se vier pouco", metric: "≤ 5 passos", hot: true },
    { k: "Jev · produtos", title: "até 90 → 30 produtos", body: "cada peça pontuada contra a conversa", metric: "−59% tokens" },
    { k: "Julgamento", title: "8 a 24 escolhidos", body: "orçamento, ocasião, mistura de marcas, próximos passos" },
    { k: "Vitrine", title: "grade, fotos, link para a loja", body: "compartilhável; mesma pergunta no dia volta do cache" },
  ];
  return (
    <section className="border-t border-neutral-800">
      <figure className="mx-auto m-0 max-w-[960px] px-6 py-20 md:py-28">
        <p className="mb-10 text-xs uppercase tracking-[0.2em]" style={{ color: `${LIME}cc` }}>
          O caminho, num diagrama
        </p>
        <div className="grid gap-8 md:grid-cols-[1fr_300px] md:gap-10">
          <ol className="relative m-0 list-none p-0">
            <svg aria-hidden className="absolute left-[19px] top-6 h-[calc(100%-48px)] w-px overflow-visible">
              <line x1="0" y1="0" x2="0" y2="100%" stroke={LIME} strokeOpacity=".5" strokeWidth="1.5" className="hw-wire" />
            </svg>
            {stages.map((s, i) => (
              <li key={s.k} className="hw-rise relative grid grid-cols-[40px_1fr] gap-4 pb-6 last:pb-0">
                <span
                  className={`relative z-10 grid size-10 place-items-center rounded-full border text-sm tabular-nums ${s.hot ? "hw-hot" : ""}`}
                  style={{ borderColor: s.hot ? LIME : "#3a3a3a", background: s.hot ? LIME : "#141414", color: s.hot ? "#07401A" : "#a3a3a3" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div
                  className="rounded-2xl border bg-neutral-900 px-5 py-4"
                  style={{ borderColor: s.hot ? `${LIME}55` : "#262626" }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">{s.k}</span>
                    {s.metric && (
                      <span className="text-xs tabular-nums" style={{ color: LIME }}>
                        {s.metric}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-lg font-medium text-neutral-50">{s.title}</p>
                  <p className="mt-0.5 text-sm text-neutral-400">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* The loop: the reasoning model reads stores through decoindex, as many rounds as it needs. */}
          <aside className="hw-rise self-center rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">Dentro do passo 03</p>
            <div className="mt-4 grid gap-2 text-sm">
              <Box tone="lime">modelo de raciocínio</Box>
              <Wire label="find_products · até 6 lojas" />
              <Box>decoindex</Box>
              <Wire label="≤ 2 chamadas, cache" />
              <div className="grid grid-cols-2 gap-2">
                <Box small>VTEX</Box>
                <Box small>Shopify</Box>
              </div>
              <Wire label="markdown · 127× menos tokens" up />
              <Box tone="lime">volta para o modelo, via Jev</Box>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-neutral-500">
              O laço roda até o modelo ter o suficiente — normalmente uma ou duas rodadas.
            </p>
          </aside>
        </div>
        <figcaption className="mt-8 text-center text-sm italic text-neutral-500">
          Dois modelos baratos e rápidos nas bordas, um modelo caro só onde é preciso pensar.
        </figcaption>
      </figure>
    </section>
  );
}

function Box({ children, tone, small }: { children: React.ReactNode; tone?: "lime"; small?: boolean }) {
  return (
    <div
      className={`rounded-xl border text-center ${small ? "px-2 py-2 text-xs" : "px-3 py-2.5"}`}
      style={tone ? { borderColor: `${LIME}66`, color: LIME, background: `${LIME}0d` } : { borderColor: "#2e2e2e", color: "#d4d4d4" }}
    >
      {children}
    </div>
  );
}

function Wire({ label, up }: { label: string; up?: boolean }) {
  return (
    <div className="flex items-center gap-3 pl-1 text-[11px] text-neutral-500">
      <svg width="12" height="22" aria-hidden className="shrink-0 overflow-visible">
        <line x1="6" y1="0" x2="6" y2="22" stroke={LIME} strokeOpacity=".6" className="hw-wire" />
        <path d={up ? "M2 6 L6 1 L10 6" : "M2 16 L6 21 L10 16"} fill="none" stroke={LIME} strokeOpacity=".8" />
      </svg>
      {label}
    </div>
  );
}

/** A real Jev answer shape for one query, drawn as bars: score 0–2 per brand. */
function JevScores() {
  const rows: [string, number][] = [
    ["Olympikus", 1.9],
    ["FILA", 1.57],
    ["ASICS", 1.47],
    ["New Balance", 1.44],
    ["Mizuno", 1.39],
    ["C&A", 1.21],
    ["Track & Field", 0.92],
    ["Mr. Cat", 0.67],
  ];
  return (
    <figure className="m-0 mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">“tênis de corrida até 600 reais” · score do Jev por marca</p>
      <div className="mt-5 grid gap-2.5">
        {rows.map(([name, s], i) => (
          <div key={name} className="grid grid-cols-[110px_1fr_40px] items-center gap-3 text-sm">
            <span className="truncate text-neutral-300">{name}</span>
            <div className="h-2 rounded-full bg-neutral-800">
              <div className="h-2 rounded-full" style={{ width: `${(s / 2) * 100}%`, background: i < 5 ? LIME : "#525252" }} />
            </div>
            <span className="text-right tabular-nums text-neutral-400">{s.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-5 border-t border-neutral-800 pt-4 text-sm text-neutral-500">
        0 = “não vende isso”, 1 = “talvez tenha algo”, 2 = “vende exatamente isso”. O score é a média ponderada pelas
        probabilidades — as cinco marcas de corrida se separam sozinhas.
      </figcaption>
    </figure>
  );
}

function Research() {
  return (
    <section className="border-t border-neutral-800">
      <div className="mx-auto max-w-[960px] px-6 py-20 md:py-28">
        <div className="rounded-2xl border-2 p-8 md:p-12" style={{ borderColor: `${LIME}4d`, background: `linear-gradient(90deg, ${LIME}1a, ${LIME}0d)` }}>
          <p className="text-xs uppercase tracking-wider text-neutral-500">Sobre este projeto</p>
          <p className="mt-4 text-2xl font-semibold leading-tight text-neutral-100 md:text-3xl">
            O deco shop é um projeto de pesquisa da{" "}
            <a href="https://decocms.com" className="underline decoration-1 underline-offset-4" style={{ color: LIME }}>
              decocms.com
            </a>
            .
          </p>
          <p className="mt-4 max-w-[720px] text-lg leading-relaxed text-neutral-400">
            Na decocms construímos agentes de IA que otimizam experiências digitais — sites, lojas, catálogos — medindo em produção o
            que funciona. Aqui testamos, com tráfego real, como agentes navegam catálogos de verdade: quanto custa ler uma loja, que
            modelo escolhe melhor, onde um modelo de decisão barato substitui um de raciocínio caro.
          </p>
          <a
            href="/"
            className="mt-8 inline-block rounded-full px-6 py-3.5 text-sm font-medium transition hover:opacity-90"
            style={{ background: LIME, color: "#07401A" }}
          >
            Fazer uma busca
          </a>
        </div>
      </div>
    </section>
  );
}

function Section({ n, kicker, title, children }: { n: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-neutral-800">
      <div className="hw-rise mx-auto max-w-[960px] px-6 py-20 md:py-28">
        <p className="mb-4 text-xs uppercase tracking-[0.2em]" style={{ color: `${LIME}cc` }}>
          {n} · {kicker}
        </p>
        <h2 className="mb-6 max-w-[820px] text-3xl font-medium leading-tight text-neutral-100 md:text-4xl lg:text-5xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[720px] text-lg leading-relaxed text-neutral-400">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[720px] border-t border-neutral-800 pt-6 text-base leading-relaxed text-neutral-400">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-neutral-100">{children}</strong>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <p className="text-3xl font-bold tabular-nums tracking-tight md:text-4xl" style={{ color: LIME }}>
        {value}
      </p>
      <p className="mt-2 text-xs uppercase tracking-wider text-neutral-400">{label}</p>
    </div>
  );
}

function Numbered({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {items.map(([head, body], i) => (
        <div key={head} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 transition-colors hover:border-[#D0EC1A4d]">
          <span className="mb-3 block text-sm tabular-nums" style={{ color: `${LIME}99` }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="mb-1.5 text-xl font-semibold text-neutral-50">{head}</h3>
          <p className="text-base leading-relaxed text-neutral-400">{body}</p>
        </div>
      ))}
    </div>
  );
}
