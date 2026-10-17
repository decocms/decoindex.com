import { thumb } from "~/components/Product";
import type { Env } from "./env";

/** Photos we pass to a vision model: merchant CDNs only (the same ones `thumb()` resizes). */
export const MERCHANT_IMAGE = /^https:\/\/[^/]+(\.vteximg\.com\.br|\.vtexassets\.com|cdn\.shopify\.com)\/|^https:\/\/[^/]+\/cdn\/shop\//;

const TIMEOUT = 5_000;

/**
 * "Mais como este", by eye, on a budget: ONE image, the seed's, small. A cheap vision model turns
 * it into the words a catalog would use (cor, estampa, comprimento, alça…), and those words drive
 * the cheap steps after it: which products get fetched and how Jev ranks them. Titles alone miss
 * this: "Vestido Midi Alça Estampado Floral Leni" never says it is green and tropical.
 *
 * ~1-2s, ~US$0.0001 (gpt-6-luna, minimal reasoning). Never a grid of candidate thumbnails: that was
 * 24 images, 6-9s and up to US$0.02 per click, and it ranked no better (see AGENTS.md, Cost).
 * Raw chat completions with `image_url`: through the AI SDK a URL image went out as a file part and
 * the provider refused it. The image stays the merchant's URL; we never fetch or store it.
 */
export async function describe(
  env: Env,
  image: string,
  title: string,
  meta: Record<string, string>,
): Promise<{ look: string[]; ms: number; cost: number; model: string } | { error: string }> {
  const model = env.VISION_MODEL || "openai/gpt-6-luna";
  const started = Date.now();
  try {
    const res = await fetch(`https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openrouter/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-aig-metadata": JSON.stringify({ app: "decoshop", ...meta }),
        ...(env.CF_AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        model,
        usage: { include: true },
        reasoning: { effort: "minimal" },
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: thumb(image, 320) } },
              {
                type: "text",
                text: `Produto: "${title.slice(0, 120)}". Descreva a peça da foto em 3 a 6 atributos curtos, em português, do jeito que um catálogo de moda escreveria: cor principal, estampa, comprimento, decote ou alça, tecido aparente. Uma ou duas palavras cada, sem repetir o tipo de peça. Responda só JSON: {"attrs":["verde","estampa tropical","midi"]}`,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return { error: `${res.status}: ${(await res.text()).slice(0, 160)}` };
    const out = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
    const reply = out.choices?.[0]?.message?.content ?? "";
    const attrs = (JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? "{}").attrs ?? []) as unknown[];
    const look = attrs.filter((a): a is string => typeof a === "string" && a.length <= 30).map((a) => a.toLowerCase().trim()).slice(0, 6);
    if (!look.length) return { error: `unparsed: ${reply.slice(0, 120)}` };
    return { look, ms: Date.now() - started, cost: out.usage?.cost ?? 0, model };
  } catch (err) {
    return { error: String((err as Error)?.message ?? err).slice(0, 200) };
  }
}
