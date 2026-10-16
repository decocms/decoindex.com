/**
 * Who the shop searches. Every domain here is one decoindex already reads
 * (VTEX/Shopify, verified with `/{domain}/search.json?q=`). The blurb is what
 * the model reads to decide where to look, so it says what the brand *sells*.
 *
 * ponytail: hardcoded roster; move to a CMS block once brands get added weekly.
 */
export type Segment = "feminino" | "masculino" | "infantil" | "esporte" | "calcados" | "bolsas" | "praia";

export interface Brand {
  domain: string;
  name: string;
  segments: Segment[];
  blurb: string;
}

export const BRANDS: Brand[] = [
  { domain: "www.farmrio.com.br", name: "FARM Rio", segments: ["feminino", "praia"], blurb: "estampas tropicais, vestidos coloridos, moda carioca" },
  { domain: "www.animale.com.br", name: "Animale", segments: ["feminino"], blurb: "moda feminina sofisticada, alfaiataria, vestidos de festa, linho e seda" },
  { domain: "www.osklen.com.br", name: "Osklen", segments: ["feminino", "masculino", "praia"], blurb: "minimalismo carioca, linho, camisetas premium, beachwear" },
  { domain: "www.johnjohndenim.com.br", name: "John John", segments: ["feminino", "masculino"], blurb: "jeans, denim, visual urbano e rocker" },
  { domain: "www.zinzane.com.br", name: "Zinzane", segments: ["feminino"], blurb: "feminino casual, básicos e peças de trabalho" },
  { domain: "www.usereserva.com", name: "Reserva", segments: ["masculino", "infantil"], blurb: "masculino casual, polos, camisetas, bermudas" },
  { domain: "www.insiderstore.com.br", name: "Insider", segments: ["masculino", "feminino"], blurb: "básicos tecnológicos, camisetas e cuecas anti-odor, essenciais de viagem" },
  { domain: "www.hering.com.br", name: "Hering", segments: ["feminino", "masculino", "infantil"], blurb: "básicos de algodão, camisetas, jeans, preço acessível" },
  { domain: "www.cea.com.br", name: "C&A", segments: ["feminino", "masculino", "infantil"], blurb: "fast fashion acessível, tudo de vestuário" },
  { domain: "www.fila.com.br", name: "FILA", segments: ["esporte", "calcados", "masculino", "feminino"], blurb: "tênis e roupas esportivas, estilo retrô" },
  { domain: "www.newbalance.com.br", name: "New Balance", segments: ["esporte", "calcados"], blurb: "tênis de corrida e lifestyle, roupas esportivas" },
  { domain: "www.asics.com.br", name: "ASICS", segments: ["esporte", "calcados"], blurb: "tênis de corrida de performance" },
  { domain: "www.mizuno.com.br", name: "Mizuno", segments: ["esporte", "calcados"], blurb: "tênis de corrida e vôlei, roupas de treino" },
  { domain: "www.olympikus.com.br", name: "Olympikus", segments: ["esporte", "calcados"], blurb: "tênis de corrida nacional, custo-benefício" },
  { domain: "www.havaianas.com.br", name: "Havaianas", segments: ["calcados", "praia"], blurb: "chinelos e sandálias" },
  { domain: "www.bagaggio.com.br", name: "Bagaggio", segments: ["bolsas"], blurb: "malas de viagem, mochilas, bolsas" },
];

const byHost = new Map(BRANDS.map((b) => [b.domain.replace(/^www\./, ""), b]));

/** The roster entry a URL belongs to, or undefined — used to refuse open redirects. */
export function brandForUrl(raw: string): Brand | undefined {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return undefined;
    return byHost.get(u.hostname.replace(/^www\./, ""));
  } catch {
    return undefined;
  }
}

export function brandByDomain(domain: string): Brand | undefined {
  return byHost.get(domain.replace(/^www\./, ""));
}
