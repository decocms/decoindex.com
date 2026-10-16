import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import type { ChatEvent, ChatRequest, Tile } from "../types";
import { BRANDS } from "./brands";
import { searchBrand, tileLine } from "./catalog";
import type { Env, ExecutionContext } from "./env";
import { logEvent } from "./events";

const MAX_SEARCHES = 6;
const MAX_TURNS = 12;

/** Pinned per chat: the same id always lands on the same model, so a chat never switches mid-way. */
export function pickModel(env: Env, chatId: string, forced?: string): string {
  const models = env.CHAT_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
  if (forced && models.includes(forced)) return forced;
  let h = 0;
  for (const c of chatId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return models[Math.abs(h) % models.length];
}

function systemPrompt(dept?: string): string {
  const roster = BRANDS.map((b) => `- ${b.domain} — ${b.name} [${b.segments.join(", ")}]: ${b.blurb}`).join("\n");
  return `Você é o deco shop: um personal shopper que busca nos catálogos de marcas brasileiras de moda a partir de um único chat.

Marcas disponíveis (use o domínio exato em search_catalogs):
${roster}
${dept ? `\nO cliente está navegando em: ${dept}. Prefira marcas e produtos desse departamento.\n` : ""}
Como trabalhar:
1. Sempre chame search_catalogs primeiro. Escolha de 3 a ${MAX_SEARCHES} marcas que realmente vendem o que foi pedido.
2. A busca de cada loja é por palavra-chave, não semântica: use 1 a 3 palavras em português como aparecem num catálogo ("vestido linho", "tênis corrida", "camisa social"). Nada de frases, cores raras ou ocasiões na query. Você pode buscar a mesma marca com queries diferentes.
3. Se vier pouco resultado, faça uma segunda rodada com termos mais amplos ou outras marcas.
4. Depois chame show_products com os ids que melhor atendem ao pedido, do mais para o menos relevante (8 a 24). Respeite orçamento, tamanho e estilo pedidos. Misture marcas.
5. Por fim, responda em 1 ou 2 frases curtas, no idioma do cliente, dizendo o que você escolheu e por quê. Pode sugerir um refinamento.

Regras: preços são preços de catálogo observados, não o preço final. Nunca prometa estoque, frete, prazo ou desconto — isso é da loja. Não invente produtos nem ids.`;
}

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
  const model = pickModel(env, body.chatId, body.model);
  const started = Date.now();

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (e: ChatEvent) => writer.write(enc.encode(JSON.stringify(e) + "\n"));

  const seen = new Map<string, Tile>();
  const stats = { searches: 0, hits: 0, curated: 0, error: "" };

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

  const run = async () => {
    await send({ type: "meta", chatId: body.chatId, model });
    const result = streamText({
      model: openrouter(model),
      system: systemPrompt(body.dept),
      messages,
      stopWhen: stepCountIs(5),
      maxOutputTokens: 1200,
      abortSignal: req.signal,
      tools: {
        search_catalogs: tool({
          description: "Busca produtos em várias lojas em paralelo. Cada busca = uma loja + uma query curta em português.",
          inputSchema: z.object({
            searches: z
              .array(z.object({ domain: z.string(), query: z.string() }))
              .min(1)
              .max(MAX_SEARCHES),
            maxPriceBRL: z.number().optional().describe("Preço máximo em reais, se o cliente deu orçamento"),
          }),
          execute: async ({ searches, maxPriceBRL }) => {
            const known = searches.filter((s) => BRANDS.some((b) => b.domain === s.domain)).slice(0, MAX_SEARCHES);
            const names = known.map((s) => BRANDS.find((b) => b.domain === s.domain)?.name).join(", ");
            await send({ type: "status", text: `Buscando em ${names}…` });
            stats.searches += known.length;
            const lists = await Promise.all(known.map((s) => searchBrand(env, s.domain, s.query, ip)));
            const max = maxPriceBRL ? maxPriceBRL * 100 : Infinity;
            const fresh = lists
              .flat()
              .filter((t) => !seen.has(t.id) && (t.priceMinor ?? 0) <= max)
              .slice(0, 80);
            for (const t of fresh) seen.set(t.id, t);
            stats.hits += fresh.length;
            if (fresh.length) await send({ type: "products", items: interleave(lists, fresh) });
            return fresh.length ? fresh.map(tileLine).join("\n") : "Nenhum resultado. Tente termos mais amplos ou outras marcas.";
          },
        }),
        show_products: tool({
          description: "Mostra ao cliente os produtos escolhidos, em ordem de relevância. Use apenas ids retornados por search_catalogs.",
          inputSchema: z.object({ ids: z.array(z.string()).min(1).max(24) }),
          execute: async ({ ids }) => {
            const valid = ids.filter((id) => seen.has(id));
            stats.curated = valid.length;
            await send({ type: "curate", ids: valid });
            return `Mostrando ${valid.length} produtos.`;
          },
        }),
      },
    });

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") await send({ type: "text", text: part.text });
      else if (part.type === "error") throw part.error;
    }
  };

  ctx.waitUntil(
    run()
      .catch(async (err) => {
        stats.error = String((err as Error)?.message ?? err).slice(0, 300);
        console.error("chat failed", model, stats.error);
        await send({ type: "error", message: "Não consegui terminar essa busca. Tente de novo?" }).catch(() => {});
      })
      .finally(async () => {
        const ms = Date.now() - started;
        await send({ type: "done", ms }).catch(() => {});
        await writer.close().catch(() => {});
        await logEvent(env, "shop.chat", ms, {
          chat: body.chatId,
          model,
          turn: messages.filter((m) => m.role === "user").length,
          dept: body.dept,
          ...stats,
        });
      }),
  );

  return new Response(readable, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
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
