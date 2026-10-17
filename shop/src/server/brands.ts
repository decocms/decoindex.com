/**
 * Who the shop searches. Every domain here is one decoindex already reads
 * (VTEX/Shopify, verified with `/{domain}/search.json?q=`). The blurb is what
 * the model reads to decide where to look, so it says what the brand *sells*.
 *
 * ponytail: hardcoded roster (56 brands); move to a CMS block once brands get added weekly.
 */
export type Segment = "feminino" | "masculino" | "infantil" | "esporte" | "calcados" | "bolsas" | "praia" | "lingerie";

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
  { domain: "www.newbalance.com.br", name: "New Balance", segments: ["esporte", "calcados", "feminino", "masculino"], blurb: "tênis de corrida e lifestyle, roupas esportivas" },
  { domain: "www.asics.com.br", name: "ASICS", segments: ["esporte", "calcados", "feminino", "masculino"], blurb: "tênis de corrida de performance" },
  { domain: "www.mizuno.com.br", name: "Mizuno", segments: ["esporte", "calcados", "feminino", "masculino"], blurb: "tênis de corrida e vôlei, roupas de treino" },
  { domain: "www.olympikus.com.br", name: "Olympikus", segments: ["esporte", "calcados", "feminino", "masculino"], blurb: "tênis de corrida nacional, custo-benefício" },
  { domain: "www.havaianas.com.br", name: "Havaianas", segments: ["calcados", "praia", "feminino", "masculino"], blurb: "chinelos e sandálias" },
  { domain: "www.bagaggio.com.br", name: "Bagaggio", segments: ["bolsas", "feminino", "masculino"], blurb: "malas de viagem, mochilas, bolsas" },
  // Added Oct 2026 from premium-mall directories (Leblon, VillageMall, JK/Iguatemi), each verified against decoindex search.
  { domain: "www.lennyniemeyer.com.br", name: "Lenny Niemeyer", segments: ["praia", "feminino"], blurb: "moda praia autoral carioca, maiôs e biquínis icônicos" },
  { domain: "www.adrianadegreas.com", name: "Adriana Degreas", segments: ["praia", "feminino"], blurb: "beachwear de luxo, maiôs e saídas estampadas" },
  { domain: "www.patbo.com.br", name: "PatBO", segments: ["feminino", "praia"], blurb: "vestidos bordados e beachwear de festa" },
  { domain: "www.iodice.com.br", name: "Iódice", segments: ["feminino"], blurb: "moda feminina sofisticada, alfaiataria e vestidos" },
  { domain: "www.lelis.com.br", name: "Le Lis", segments: ["feminino"], blurb: "moda feminina elegante, alfaiataria e vestidos" },
  { domain: "www.gloriacoelho.com.br", name: "Gloria Coelho", segments: ["feminino"], blurb: "moda autoral de vanguarda, cortes arquitetônicos" },
  { domain: "www.aviator.com.br", name: "Aviator", segments: ["masculino", "calcados"], blurb: "camisaria masculina desde 1987, alfaiataria, polos e calçados" },
  { domain: "www.ricardoalmeida.com.br", name: "Ricardo Almeida", segments: ["masculino"], blurb: "alfaiataria masculina premium, ternos e camisas" },
  { domain: "www.nkstore.com.br", name: "NK Store", segments: ["feminino", "masculino"], blurb: "multimarcas de luxo, curadoria nacional e internacional" },
  { domain: "www.bobo.com.br", name: "Bo.Bô", segments: ["feminino"], blurb: "moda feminina chic, vestidos e alfaiataria" },
  { domain: "www.dressto.com.br", name: "Dress To", segments: ["feminino"], blurb: "moda carioca estampada, vestidos leves e coloridos" },
  { domain: "www.aguadecoco.com.br", name: "Água de Coco", segments: ["praia", "feminino"], blurb: "moda praia brasileira estampada, biquínis e maiôs" },
  { domain: "www.ciamaritima.com.br", name: "Cia. Marítima", segments: ["praia", "feminino"], blurb: "biquínis e maiôs, moda praia e fitness" },
  { domain: "www.blueman.com.br", name: "Blue Man", segments: ["praia", "feminino"], blurb: "moda praia carioca clássica, biquínis estampados" },
  { domain: "www.lancaperfume.com.br", name: "Lança Perfume", segments: ["feminino"], blurb: "moda feminina jovem e sexy, jeans e vestidos" },
  { domain: "www.cantao.com.br", name: "Cantão", segments: ["feminino"], blurb: "moda carioca colorida e estampada" },
  { domain: "www.mariavalentina.com.br", name: "Maria Valentina", segments: ["feminino"], blurb: "moda feminina romântica" },
  { domain: "www.iorane.com.br", name: "Iorane", segments: ["feminino"], blurb: "moda feminina autoral, estampas e couro" },
  { domain: "www.sacada.com", name: "Sacada", segments: ["feminino"], blurb: "moda feminina carioca contemporânea" },
  { domain: "www.lezalez.com.br", name: "Lez a Lez", segments: ["feminino"], blurb: "moda feminina casual e jeans" },
  { domain: "www.morenarosa.com.br", name: "Morena Rosa", segments: ["feminino"], blurb: "moda feminina, jeans e vestidos" },
  { domain: "www.tf.com.br", name: "Track & Field", segments: ["esporte", "feminino", "masculino"], blurb: "roupas esportivas premium para corrida e yoga" },
  { domain: "www.altogiro.com.br", name: "Alto Giro", segments: ["esporte", "feminino"], blurb: "moda fitness feminina de alta performance, leggings" },
  { domain: "www.handred.com.br", name: "Handred", segments: ["masculino"], blurb: "moda masculina minimalista em linho e algodão" },
  { domain: "www.dudalina.com.br", name: "Dudalina", segments: ["masculino", "feminino"], blurb: "camisaria premium masculina e feminina" },
  { domain: "www.aramis.com.br", name: "Aramis", segments: ["masculino"], blurb: "moda masculina, camisas e alfaiataria casual" },
  { domain: "www.sergiok.com.br", name: "Sergio K", segments: ["masculino"], blurb: "moda masculina casual-luxo, camisetas e polos" },
  { domain: "www.redley.com.br", name: "Redley", segments: ["masculino", "calcados"], blurb: "surfwear carioca, bermudas e tênis de lona" },
  { domain: "www.jorgebischoff.com.br", name: "Jorge Bischoff", segments: ["calcados", "bolsas", "feminino"], blurb: "sapatos e bolsas femininos de couro premium" },
  { domain: "www.santalolla.com.br", name: "Santa Lolla", segments: ["calcados", "bolsas", "feminino"], blurb: "sapatos, sandálias e bolsas femininas fashion" },
  { domain: "www.capodarte.com.br", name: "Capodarte", segments: ["calcados", "bolsas", "feminino"], blurb: "calçados e bolsas femininos de couro" },
  { domain: "www.constance.com.br", name: "Constance", segments: ["calcados", "bolsas", "feminino"], blurb: "calçados e bolsas femininos acessíveis e tendência" },
  { domain: "www.mrcat.com.br", name: "Mr. Cat", segments: ["bolsas", "calcados", "feminino", "masculino"], blurb: "bolsas e sapatos de couro femininos e masculinos" },
  { domain: "www.luzdalua.com.br", name: "Luz da Lua", segments: ["bolsas", "calcados", "feminino"], blurb: "bolsas e calçados femininos de couro" },
  { domain: "www.ferracini.com.br", name: "Ferracini", segments: ["calcados", "masculino"], blurb: "sapatos e tênis masculinos de couro" },
  { domain: "www.usaflex.com.br", name: "Usaflex", segments: ["calcados", "feminino"], blurb: "calçados femininos confortáveis, sandálias" },
  { domain: "www.loungerie.com.br", name: "Loungerie", segments: ["lingerie", "feminino"], blurb: "lingerie e pijamas confortáveis e modernos" },
  { domain: "www.valisere.com.br", name: "Valisère", segments: ["lingerie", "feminino"], blurb: "lingerie clássica, sutiãs e calcinhas" },
  { domain: "www.recco.com.br", name: "Recco", segments: ["lingerie", "feminino"], blurb: "lingerie e moda noite" },
  { domain: "www.lupo.com.br", name: "Lupo", segments: ["lingerie", "esporte", "feminino", "masculino"], blurb: "meias, underwear e roupas esportivas" },
  { domain: "www.pituchinhus.com.br", name: "Pituchinhus", segments: ["infantil"], blurb: "moda infantil festiva e delicada" },
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
