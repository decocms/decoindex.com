import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import type { ChatEvent, ChatRequest, Share, SimilarRequest, Tile } from "../types";
import { BRANDS, type Brand, brandByDomain } from "./brands";
import { newHealth, tileLine } from "./catalog";
import type { Env, ExecutionContext } from "./env";
import { logEvent } from "./events";
import { findProducts, similar } from "./find";
import { preselect, rankTiles, rosterLine } from "./jev";
import { TYPE_NAMES } from "./taxonomy";

const MAX_SEARCHES = 6;
const MAX_TURNS = 12;
const SHARE_TTL = 60 * 60 * 24 * 365;
/** A first question's answer is reused for a day: same words, same dept, same store, same grid. */
const ANSWER_TTL = 60 * 60 * 24;

interface CachedAnswer {
  model: string;
  tiles: Tile[];
  refinements: string[];
  answer: string;
  share?: string;
}

async function answerKey(q: string, dept?: string, store?: string) {
  const norm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${norm}|${dept ?? ""}|${store ?? ""}`));
  return `answer:v2:${[...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
const SORTS = ["relevance", "price_asc", "price_desc", "new", "discount"] as const;

/** 8 chars of base62: short enough for a WhatsApp message, too many to guess. */
function shareId(): string {
  const abc = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => abc[b % 62]).join("");
}

/** Pinned per chat: the same id always lands on the same model, so a chat never switches mid-way. */
export function pickModel(env: Env, chatId: string, forced?: string): string {
  const models = env.CHAT_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
  if (forced && models.includes(forced)) return forced;
  let h = 0;
  for (const c of chatId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return models[Math.abs(h) % models.length];
}

function systemPrompt(dept?: string, store?: string, domains?: string[]): string {
  const home = store ? BRANDS.find((b) => b.domain === store) : undefined;
  const brands = domains ? domains.map(brandByDomain).filter((b): b is Brand => !!b) : BRANDS;
  const roster = brands.map(rosterLine).join("\n");
  return `Você é o deco shop: um personal shopper que busca nos catálogos de marcas brasileiras de moda a partir de um único chat.

Marcas disponíveis (use o domínio exato em find_products). Entre parênteses: origem, ano de fundação e faixa de preço ($ popular a $$$$ luxo). Use isso quando o pedido falar de origem ("marcas cariocas", "mineiras", "do Sul"), tradição ou faixa de preço ("de luxo", "baratinho"); sem origem informada, não suponha:
${roster}
${dept ? `\nO cliente está navegando em: ${dept}. Prefira marcas e produtos desse departamento.\n` : ""}${home ? `\nO cliente chegou pela loja ${home.name} (${home.domain}). Busque nela primeiro e mostre os produtos dela no topo. Só traga outras marcas para completar quando ela não tiver o suficiente.\n` : ""}
Como trabalhar:
1. Sempre chame find_products primeiro. Escolha de 3 a ${MAX_SEARCHES} marcas que realmente vendem o que foi pedido.
2. Para cada marca informe "type" (o tipo de peça, da lista fixa) e, em "terms", só os atributos que importam: material, cor, estampa, comprimento, uso ("linho", "azul", "estampado", "midi", "corrida"). Com type, a loja é navegada pela categoria daquele tipo e os terms ordenam o resultado — mais preciso que busca. Sem type (algo fora da lista, nome de coleção, personagem), mande só "terms" e vira busca por palavra-chave (1 a 3 palavras, como num catálogo).
3. "sort": price_asc quando há orçamento ou pedem barato, discount para promoção, new para novidades; senão omita. Se vier pouco, faça outra rodada com outro type, menos terms ou outras marcas.
4. Depois chame show_products com os ids que melhor atendem ao pedido, do mais para o menos relevante (8 a 24). Respeite orçamento, tamanho e estilo pedidos. Misture marcas. Junto, mande de 2 a 4 refinamentos: frases curtas (até 5 palavras) que o cliente clicaria a seguir, como "Só midi", "Até R$ 300", "Em tons de azul", "Ver sandálias para combinar".
5. Por fim, responda em no máximo 2 frases curtas (até 220 caracteres), no idioma do cliente, com o critério da seleção. Não liste produtos nem preços: eles já aparecem na tela. Não escreva nada antes disso: nada de "vou buscar", "boa base", "vou ampliar" entre as chamadas — todo texto que você escreve aparece para o cliente.

Se find_products disser que a LEITURA FALHOU, as lojas não responderam: nunca diga que não existem produtos; diga que as lojas não responderam agora e peça para tentar de novo em instantes.

Regras: preços são preços de catálogo observados, não o preço final. Nunca prometa estoque, frete, prazo ou desconto — isso é da loja. Não invente produtos nem ids.`;
}

/** An NDJSON response whose body is written by `work`, finished and logged no matter how `work` ends. */
function ndjson(ctx: ExecutionContext, work: (send: (e: ChatEvent) => Promise<void>) => Promise<void>, onEnd: (ms: number, error: string) => Promise<void>) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (e: ChatEvent) => writer.write(enc.encode(JSON.stringify(e) + "\n"));
  const started = Date.now();
  let error = "";
  ctx.waitUntil(
    work(send)
      .catch(async (err) => {
        error = String((err as Error)?.message ?? err).slice(0, 300);
        console.error("stream failed", error);
        await send({ type: "error", message: "Não consegui terminar essa busca. Tente de novo?" }).catch(() => {});
      })
      .finally(async () => {
        const ms = Date.now() - started;
        await send({ type: "done", ms }).catch(() => {});
        await writer.close().catch(() => {});
        await onEnd(ms, error);
      }),
  );
  return new Response(readable, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * Freeze a turn for /s/{id}. Only ever called with tiles the server fetched —
 * never client input, or anyone could publish fake products under our domain.
 */
async function saveShare(env: Env, s: Omit<Share, "id" | "createdAt">): Promise<string | undefined> {
  if (!s.tiles.length || !env.SHARES) return undefined;
  const share: Share = { ...s, id: shareId(), createdAt: new Date().toISOString() };
  await env.SHARES.put(`s:${share.id}`, JSON.stringify(share), { expirationTtl: SHARE_TTL });
  return share.id;
}

async function limited(env: Env, ip: string) {
  return !!env.CHAT_LIMIT && !(await env.CHAT_LIMIT.limit({ key: ip })).success;
}
const TOO_MANY = () => Response.json({ error: "Muitas buscas seguidas. Espera um minutinho?" }, { status: 429 });

export async function handleChat(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ChatRequest | null;
  if (!body?.chatId || !Array.isArray(body.messages) || !body.messages.length) {
    return Response.json({ error: "chatId and messages required" }, { status: 400 });
  }
  const messages = body.messages
    .slice(-MAX_TURNS)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  const store = BRANDS.some((b) => b.domain === body.store) ? body.store : undefined;

  // Only an opening question is cacheable: later turns depend on the whole thread.
  // A forced ?model= is someone comparing models by hand, so it always runs live.
  const opening = messages.length === 1 && messages[0].role === "user" && !body.model && env.SHARES;
  const key = opening ? await answerKey(messages[0].content, body.dept, store) : "";
  if (key) {
    const raw = await env.SHARES!.get(key).catch(() => null);
    const hit = raw ? (JSON.parse(raw) as CachedAnswer) : null;
    if (hit) return replay(ctx, env, body, hit);
  }

  if (await limited(env, ip)) return TOO_MANY();
  const model = pickModel(env, body.chatId, body.model);

  const seen = new Map<string, Tile>();
  const stats = { searches: 0, viaCategory: 0, hits: 0, curated: 0, brands: [] as string[], share: "", fallback: false, tokensIn: 0, tokensOut: 0, cost: 0, lateError: "", preselect: null as { ms: number; n: number } | null, rank: [] as { ms: number; from: number; to: number }[] };
  const final = { answer: "", ids: [] as string[], refinements: [] as string[] };
  const health = newHealth();
  const UNREACHABLE = "As lojas não responderam agora — não é falta de produto. Tente de novo em instantes.";

  const openrouter = createOpenRouter({
    // The gateway carries BYOK for OpenRouter: with no key of our own, send no
    // Authorization header at all and let it inject the stored one.
    apiKey: env.OPENROUTER_API_KEY || "byok",
    fetch: env.OPENROUTER_API_KEY
      ? undefined
      : (input, init) => {
          const headers = new Headers(init?.headers);
          headers.delete("authorization");
          return fetch(input, { ...init, headers });
        },
    baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openrouter/v1`,
    headers: {
      "cf-aig-metadata": JSON.stringify({ app: "decoshop", chat: body.chatId, model }),
      ...(env.CF_AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {}),
    },
  });

  return ndjson(
    ctx,
    async (send) => {
      await send({ type: "meta", chatId: body.chatId, model });
      await send({ type: "status", text: "Escolhendo marcas…" });
      const pick = await preselect(env, {
        asks: messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content),
        dept: body.dept,
        store,
      });
      stats.preselect = pick ? { ms: pick.ms, n: pick.domains.length } : null;
      stats.cost += pick?.cost ?? 0;
      const result = streamText({
        // usage.include: OpenRouter reports tokens and USD cost per step, logged below for the admin's cost view.
        model: openrouter(model, { usage: { include: true } }),
        system: systemPrompt(body.dept, store, pick?.domains),
        messages,
        stopWhen: stepCountIs(5),
        maxOutputTokens: 3000, // per step; DeepSeek ran out at 1200 mid show_products ("Tool calls cutoff by max_tokens")
        abortSignal: req.signal,
        tools: {
          find_products: tool({
            description:
              "Encontra produtos em várias lojas em paralelo. Com type, navega a categoria daquele tipo na loja e ordena pelos terms; sem type, busca pelos terms.",
            inputSchema: z.object({
              requests: z
                .array(
                  z.object({
                    domain: z.string(),
                    type: z.enum(TYPE_NAMES as [string, ...string[]]).optional().describe("Tipo de peça, da lista fixa"),
                    terms: z.string().max(60).optional().describe("Atributos: material, cor, estampa, comprimento, uso"),
                    sort: z.enum(SORTS).optional(),
                  }),
                )
                .min(1)
                .max(MAX_SEARCHES),
              maxPriceBRL: z.number().optional().describe("Preço máximo em reais, se o cliente deu orçamento"),
            }),
            execute: async ({ requests, maxPriceBRL }) => {
              const known = requests.filter((r) => BRANDS.some((b) => b.domain === r.domain)).slice(0, MAX_SEARCHES);
              const names = [...new Set(known.map((r) => brandByDomain(r.domain)?.name))].join(", ");
              await send({ type: "status", text: `Procurando em ${names}…` });
              stats.searches += known.length;
              stats.brands.push(...known.map((r) => r.domain).filter((d) => !stats.brands.includes(d)));
              const found = await Promise.all(
                known.map((r) => findProducts({ env, ip, dept: body.dept, health }, r as Parameters<typeof findProducts>[1])),
              );
              stats.viaCategory += found.filter((f) => f.via.includes("›")).length;
              const lists = found.map((f) => f.tiles);
              const max = maxPriceBRL ? maxPriceBRL * 100 : Infinity;
              const fresh = lists
                .flat()
                .filter((t) => !seen.has(t.id) && (t.priceMinor ?? 0) <= max)
                .slice(0, 90);
              for (const t of fresh) seen.set(t.id, t);
              stats.hits += fresh.length;
              if (fresh.length) await send({ type: "products", items: interleave(lists, fresh) });
              const how = found.map((f) => `- ${f.via}: ${f.tiles.length}`).join("\n");
              const asks = messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content);
              const ranked = await rankTiles(env, { asks, dept: body.dept }, fresh, tileLine);
              if (ranked) {
                stats.rank.push({ ms: ranked.ms, from: fresh.length, to: ranked.tiles.length });
                stats.cost += ranked.cost;
              }
              const shown = ranked?.tiles ?? fresh;
              if (!fresh.length && health.failed && !health.ok) {
                return `LEITURA FALHOU: ${health.failed} leituras de catálogo não responderam (status ${[...new Set(health.statuses)].join(", ")}). Isso não significa que as lojas não tenham o produto.`;
              }
              return fresh.length
                ? `Como cada loja foi lida:\n${how}\n\nProdutos${ranked ? ` (os ${shown.length} mais relevantes de ${fresh.length})` : ""}:\n${shown.map(tileLine).join("\n")}`
                : `Nenhum resultado.\n${how}\nTente outro type, menos terms ou outras marcas.`;
            },
          }),
          show_products: tool({
            description: "Mostra ao cliente os produtos escolhidos, em ordem de relevância. Use apenas ids retornados por find_products.",
            inputSchema: z.object({
              ids: z.array(z.string()).min(1).max(24),
              refinements: z.array(z.string().max(60)).max(4).optional().describe("2 a 4 próximos passos curtos que o cliente clicaria"),
            }),
            execute: async ({ ids, refinements = [] }) => {
              // One curation per turn: a second call would swap the grid under the shopper.
              if (final.ids.length) return "Os produtos já estão na tela. Agora só responda ao cliente.";
              const valid = ids.filter((id) => seen.has(id));
              stats.curated = valid.length;
              final.ids = valid;
              final.refinements = refinements.slice(0, 4);
              await send({ type: "curate", ids: valid, refinements: final.refinements });
              return `Mostrando ${valid.length} produtos.`;
            },
          }),
        },
      });

      let warned = false;
      let failed: unknown;
      try {
        for await (const part of result.fullStream) {
          // Nothing could be read at all: say so plainly instead of letting the model guess.
          if (!warned && health.failed && !health.ok && !seen.size && part.type === "text-delta") {
            warned = true;
            await send({ type: "error", message: UNREACHABLE });
          }
          if (part.type === "text-delta") {
            final.answer += part.text;
            await send({ type: "text", text: part.text });
          } else if (part.type === "error") throw part.error ?? new Error("stream error");
        }
      } catch (err) {
        // The shopper left: nothing to finish, and not a model failure.
        if (req.signal.aborted) return;
        // Products already on screen: a late model error (cut-off tool call, upstream 400) must not
        // turn a usable answer into "não consegui". Log it, then curate with the fallback below.
        if (!seen.size) throw err;
        failed = err;
        stats.lateError = String((err as Error)?.message ?? err).slice(0, 300);
      }

      // ponytail: cost is only summed for turns that finish; an aborted or failed stream's spend is not logged.
      for (const step of failed ? [] : await result.steps) {
        const usage = (step.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage;
        stats.tokensIn += step.usage.inputTokens ?? 0;
        stats.tokensOut += step.usage.outputTokens ?? 0;
        stats.cost += usage?.cost ?? 0;
      }

      // Some models stop after searching without curating or answering. Never leave the shopper
      // with a spinner or a silent grid: show what was found and say so in one line.
      const fallback = (stats.fallback = !final.ids.length || !final.answer.trim());
      if (!final.ids.length && seen.size) {
        final.ids = [...seen.keys()].slice(0, 24);
        stats.curated = final.ids.length;
        await send({ type: "curate", ids: final.ids, refinements: [] });
      }
      if (!final.answer.trim() && final.ids.length) {
        const brands = [...new Set(final.ids.map((i) => seen.get(i)?.brand))].slice(0, 4).join(", ");
        final.answer = `Separei estas opções de ${brands}. Toque em uma para ver mais, ou me diga o que mudar.`;
        await send({ type: "text", text: final.answer });
      }

      const id = await saveShare(env, {
        q: messages.filter((m) => m.role === "user").at(-1)?.content ?? "",
        answer: final.answer.trim(),
        dept: body.dept,
        store,
        model,
        tiles: final.ids.map((i) => seen.get(i)).filter((t): t is Tile => !!t),
        refinements: final.refinements,
      });
      if (id) {
        stats.share = id;
        await send({ type: "share", id });
      }
      // Cache only a clean, complete answer: never a failed read or an empty grid.
      if (key && !fallback && !failed && !health.failed) {
        const cached: CachedAnswer = {
          model,
          tiles: final.ids.map((i) => seen.get(i)).filter((t): t is Tile => !!t),
          refinements: final.refinements,
          answer: final.answer.trim(),
          share: id,
        };
        await env.SHARES!.put(key, JSON.stringify(cached), { expirationTtl: ANSWER_TTL });
      }
    },
    (ms, error) =>
      logEvent(env, "shop.chat", ms, {
        // What the shopper typed: the admin dashboard's main column. Search text, not identity.
        q: messages.filter((m) => m.role === "user").at(-1)?.content.slice(0, 300),
        chat: body.chatId,
        model,
        turn: messages.filter((m) => m.role === "user").length,
        dept: body.dept,
        store,
        ...stats,
        reads: { ok: health.ok, failed: health.failed, statuses: [...new Set(health.statuses)] },
        error: error || (health.failed && !health.ok ? `upstream: ${[...new Set(health.statuses)].join(",")}` : ""),
      }),
  );
}

/** A cached opening answer, streamed in the same events a live one uses. No model call, no catalog read. */
function replay(ctx: ExecutionContext, env: Env, body: ChatRequest, hit: CachedAnswer) {
  return ndjson(
    ctx,
    async (send) => {
      await send({ type: "meta", chatId: body.chatId, model: hit.model });
      await send({ type: "products", items: hit.tiles });
      await send({ type: "curate", ids: hit.tiles.map((t) => t.id), refinements: hit.refinements });
      await send({ type: "text", text: hit.answer });
      if (hit.share) await send({ type: "share", id: hit.share });
    },
    (ms, error) =>
      logEvent(env, "shop.chat", ms, {
        q: body.messages[0].content.slice(0, 300),
        chat: body.chatId,
        model: hit.model,
        turn: 1,
        dept: body.dept,
        store: body.store,
        cached: true,
        cost: 0, // a replay spends nothing; counting it keeps "cost per search" honest
        curated: hit.tiles.length,
        share: hit.share,
        error,
      }),
  );
}

/**
 * "Mais como este": no model call. The seed only steers which category pages
 * are read and how they are ranked — the tiles shown are always ones the server
 * fetched itself, so a forged seed can't put anything on screen or in a share.
 */
export async function handleSimilar(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = (await req.json().catch(() => null)) as SimilarRequest | null;
  const seed = body?.tile;
  if (!body?.chatId || !seed || typeof seed.title !== "string" || !brandByDomain(seed.domain)) {
    return Response.json({ error: "chatId and a roster tile required" }, { status: 400 });
  }
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  if (await limited(env, ip)) return TOO_MANY();
  const clean = {
    id: String(seed.id).slice(0, 120),
    domain: seed.domain,
    title: seed.title.slice(0, 160),
    category: typeof seed.category === "string" ? seed.category.slice(0, 80) : undefined,
    priceMinor: Number.isFinite(seed.priceMinor) ? Number(seed.priceMinor) : undefined,
  };
  let hits = 0;

  return ndjson(
    ctx,
    async (send) => {
      await send({ type: "meta", chatId: body.chatId, model: "similar" });
      await send({ type: "status", text: "Procurando parecidos…" });
      const health = newHealth();
      const found = await similar({ env, ip, dept: body.dept, health }, clean);
      hits = found.tiles.length;
      if (!hits && health.failed && !health.ok) {
        await send({ type: "error", message: "As lojas não responderam agora — tente de novo em instantes." });
        return;
      }
      if (!hits) {
        await send({ type: "text", text: "Não achei nada parecido agora. Tente descrever o que você gostou nele." });
        return;
      }
      await send({ type: "products", items: found.tiles });
      await send({ type: "curate", ids: found.tiles.map((t) => t.id), refinements: [] });
      const brands = [...new Set(found.tiles.map((t) => t.brand))].slice(0, 4).join(", ");
      const answer = `Peças parecidas com “${clean.title}”, de ${brands}. Toque em uma para ver mais, ou me diga o que mudar.`;
      await send({ type: "text", text: answer });
      const id = await saveShare(env, {
        q: `Mais como “${clean.title}”`,
        answer,
        dept: body.dept,
        model: "similar",
        tiles: found.tiles,
        refinements: [],
      });
      if (id) await send({ type: "share", id });
    },
    (ms, error) => logEvent(env, "shop.similar", ms, { chat: body.chatId, seed: clean.id, hits, error }, clean.domain),
  );
}

/** Round-robin across brands so the first tiles on screen aren't all one store. */
function interleave(lists: Tile[][], keep: Tile[]): Tile[] {
  const ok = new Set(keep.map((t) => t.id));
  const out: Tile[] = [];
  for (let i = 0; out.length < keep.length && i < 100; i++) {
    for (const l of lists) if (l[i] && ok.has(l[i].id)) out.push(l[i]);
  }
  return out;
}
