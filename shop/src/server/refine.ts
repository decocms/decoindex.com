import type { Env } from "./env";
import { decide } from "./jev";

/**
 * "Refinar ✨": before searching, Jev reads the request and, for each dimension below, ranks a
 * fixed list of answers by probability (a `choice` question returns the whole distribution).
 * The shopper confirms or picks, and the search runs with those details spelled out.
 *
 * Every dimension is treated alike: an "indefinido" option says the request gives no clue, and a
 * yes/no question says whether that dimension matters for this request at all. Relevant and
 * unknown is what gets asked. One Decisions call, ~US$0.0002 and ~0.5s (measured Oct 2026 with
 * this list); Jev caps a choice at 255 options, so a much longer occasion list would need chunks,
 * and cost grows with it (2,000 options: ~US$0.002).
 */

/** Occasion and role in one list ("casamento — madrinha"), so one question covers both. */
const EVENTS_WITH_ROLES: Record<string, string[]> = {
  casamento: ["convidada(o)", "madrinha", "padrinho", "mãe ou pai dos noivos", "noiva", "noivo", "daminha ou pajem"],
  "casamento civil": ["convidada(o)", "noiva", "noivo"],
  "casamento na praia": ["convidada(o)", "madrinha", "padrinho", "noiva"],
  "casamento no campo": ["convidada(o)", "madrinha", "padrinho", "noiva"],
  noivado: ["convidada(o)", "noiva ou noivo"],
  batizado: ["convidada(o)", "madrinha ou padrinho", "mãe ou pai"],
  "primeira comunhão": ["convidada(o)", "mãe ou pai"],
  formatura: ["formanda(o)", "convidada(o)", "mãe ou pai da formanda(o)"],
  "baile de formatura": ["formanda(o)", "acompanhante"],
  "festa de 15 anos": ["aniversariante", "convidada(o)", "mãe ou pai"],
  aniversário: ["aniversariante", "convidada(o)", "anfitriã(ão)"],
  "chá de bebê": ["mamãe", "convidada(o)"],
  "chá de panela ou de casa nova": ["noiva ou anfitriã", "convidada(o)"],
  "despedida de solteira(o)": ["noiva ou noivo", "convidada(o)"],
  "evento corporativo": ["participante", "palestrante", "organizadora(or)"],
  "jantar de gala": ["convidada(o)", "anfitriã(ão)"],
};
const OCCASIONS = [
  // The bare event first: "vestido de casamento" says nothing about who is wearing it, and with only
  // role options Jev picked "noiva" at 100%. The bare event is how it says "role unknown".
  ...Object.entries(EVENTS_WITH_ROLES).flatMap(([e, roles]) => [e, ...roles.map((r) => `${e} — ${r}`)]),
  "bodas", "cerimônia religiosa", "missa ou culto", "velório ou missa de sétimo dia", "réveillon", "réveillon na praia", "natal em família",
  "carnaval", "bloco de carnaval", "festa junina", "páscoa", "dia das mães", "dia dos namorados", "halloween",
  "jantar romântico", "primeiro encontro", "jantar com amigos", "jantar de negócios", "almoço de família", "brunch", "happy hour", "churrasco",
  "festa na casa de amigos", "festa à fantasia", "balada", "show", "festival de música", "teatro ou ópera", "cinema", "museu ou exposição",
  "vernissage", "lançamento ou coquetel", "desfile de moda", "premiação", "conferência ou congresso", "palestra",
  "entrevista de emprego", "primeiro dia de trabalho", "trabalho em escritório", "trabalho com dress code formal", "trabalho criativo ou casual",
  "home office", "reunião importante", "apresentação para clientes", "viagem a trabalho", "trabalho em pé o dia todo",
  "dia a dia", "fim de semana", "passeio no shopping", "feira ou mercado", "levar filhos à escola", "faculdade", "primeiro dia de aula",
  "viagem de férias", "viagem para a praia", "viagem para a neve", "viagem para o frio na Europa", "viagem para cidade grande", "viagem de avião longa",
  "road trip", "cruzeiro", "lua de mel", "resort all inclusive", "acampamento", "fazenda ou campo", "casa de praia", "casa de montanha",
  "praia", "piscina", "beach club", "barco ou lancha", "day use em hotel",
  "academia", "musculação", "corrida", "maratona ou meia maratona", "caminhada", "trilha", "escalada", "ciclismo", "yoga", "pilates",
  "crossfit", "dança", "natação", "surfe", "beach tennis", "tênis", "padel", "futebol", "vôlei", "esqui ou snowboard", "golfe", "equitação",
  "gestação", "pós-parto e amamentação", "pós-cirúrgico", "em casa / pijama", "dormir", "lingerie para ocasião especial",
  "ensaio fotográfico", "gravação de vídeo ou live", "foto de perfil profissional", "festival gastronômico", "degustação de vinhos",
  "piquenique", "jogo de futebol no estádio", "corrida de rua com amigos", "retiro ou spa", "evento religioso", "festa infantil",
  "presente para alguém",
];

const UNKNOWN = "indefinido: o pedido não dá pistas sobre isso";

interface Dim {
  key: string;
  /** Short name for the enriched request ("horário: noite"). */
  name: string;
  /** What the shopper sees above the chips. */
  label: string;
  /** What Jev is asked. */
  question: string;
  /** Asked as yes/no: does this dimension matter for this request? */
  relevance: string;
  options: string[];
}

export const DIMS: Dim[] = [
  { key: "ocasiao", name: "ocasião", label: "Para qual ocasião?", question: "Para qual ocasião o cliente procura, e com qual papel nela? Escolha uma opção com papel (noiva, madrinha, convidada…) só se o pedido disser quem a pessoa é; se não disser, escolha o evento sem papel.", relevance: "Saber a ocasião ajuda a escolher a peça certa para este pedido", options: OCCASIONS },
  { key: "periodo", name: "horário", label: "Que horas?", question: "Em que período do dia a peça vai ser usada?", relevance: "O período do dia (manhã, tarde, noite) muda a escolha da peça para este pedido", options: ["manhã", "tarde", "fim de tarde", "noite", "o dia todo"] },
  { key: "traje", name: "traje", label: "Qual o traje?", question: "Qual o nível de formalidade esperado?", relevance: "O nível de formalidade muda a escolha da peça para este pedido", options: ["casual", "esporte fino", "passeio completo", "black tie / gala", "esportivo"] },
  { key: "clima", name: "clima", label: "Como vai estar o clima?", question: "Qual o clima provável no lugar e na época em que a peça vai ser usada?", relevance: "O clima muda a escolha da peça (tecido, manga, comprimento) para este pedido", options: ["calor forte", "quente", "ameno", "fresco", "frio", "frio intenso"] },
  { key: "cor", name: "cor", label: "Alguma cor?", question: "Que cor o cliente prefere, ou combina com o pedido e a ocasião?", relevance: "A cor importa para este pedido", options: ["preto", "branco", "off-white", "bege ou nude", "marrom", "cinza", "azul-marinho", "azul", "azul-claro", "verde", "verde-oliva", "rosa", "vermelho", "vinho", "amarelo", "laranja", "lilás", "dourado ou prata", "tons pastel", "colorido vibrante"] },
  { key: "estampa", name: "estampa", label: "Liso ou estampado?", question: "Que padronagem combina com o pedido?", relevance: "A estampa ou padronagem importa para este pedido", options: ["liso", "estampado", "floral", "tropical", "listrado", "xadrez", "poá", "animal print", "geométrico", "bordado", "renda"] },
  { key: "comprimento", name: "comprimento", label: "Qual comprimento?", question: "Qual comprimento da peça combina com o pedido?", relevance: "O comprimento da peça (curto, midi, longo) importa para este pedido", options: ["curto", "midi", "longo", "cropped", "na altura do joelho"] },
  { key: "tecido", name: "tecido", label: "Algum tecido?", question: "Que tecido ou material combina com o pedido?", relevance: "O tecido ou material importa para este pedido", options: ["linho", "algodão", "seda", "viscose", "malha", "tricô", "jeans", "couro", "crepe", "tule", "lã", "tecido tecnológico"] },
  { key: "estilo", name: "estilo", label: "Qual estilo?", question: "Qual estilo combina com o pedido?", relevance: "O estilo muda a escolha da peça para este pedido", options: ["clássico", "elegante", "romântico", "minimalista", "boho", "moderno", "sexy", "básico", "esportivo", "praiano", "streetwear"] },
  { key: "orcamento", name: "orçamento", label: "Quanto quer gastar?", question: "Qual faixa de preço o cliente sugere?", relevance: "Saber o orçamento importa para este pedido", options: ["até R$ 200", "R$ 200 a 500", "R$ 500 a 1.000", "R$ 1.000 a 3.000", "acima de R$ 3.000"] },
];

export interface RefineDim {
  key: string;
  name: string;
  /** Jev's yes/no "does this matter here?", 0–1. The button shows the plausible ones too. */
  relevance: number;
  label: string;
  /** Best first, "indefinido" left out. */
  options: { label: string; p: number }[];
  /** Options likely enough to come pre-selected. */
  picked: string[];
  /** Matters for this request and the request doesn't say: worth a question. */
  ask: boolean;
}

/** Probability at which an option comes pre-selected. Taste is a higher bar: "linho" for a beach dress is a fair guess, not something she said. */
const SURE = 0.7;
const TASTE = new Set(["cor", "estampa", "comprimento", "tecido", "estilo"]);
const SURE_TASTE = 0.85;

/** How sure Jev must be that the request is for the other department before the toggle flips. */
const SURE_DEPT = 0.8;

export async function refine(
  env: Env,
  text: string,
  dept?: string,
): Promise<{ dims: RefineDim[]; dept?: "feminino" | "masculino"; cost: number } | null> {
  const questions: Record<string, object> = {
    // The toggle starts on Feminino whatever the shopper is: "roupa para solteiro" said masculino.
    para_quem: {
      type: "choice",
      instructions:
        "Quem vai usar a roupa do pedido: uma mulher ou um homem? Julgue só pelo texto do pedido. Em português o gênero das palavras diz: 'solteiro', 'noivo', 'convidado', 'padrinho' = homem; 'solteira', 'noiva', 'convidada', 'madrinha' = mulher. Peças também dizem: terno, gravata, cueca, sunga = homem; vestido, saia, biquíni = mulher. Responda indefinido só se nada no texto indicar.",
      criteria: { o0: "mulher", o1: "homem", o2: UNKNOWN },
    },
  };
  for (const d of DIMS) {
    questions[d.key] = { type: "choice", instructions: d.question, criteria: Object.fromEntries([...d.options, UNKNOWN].map((o, i) => [`o${i}`, o])) };
    questions[`${d.key}_importa`] = { type: "noul", instructions: d.relevance };
  }
  const res = await decide<{ probabilities?: Record<string, number>; noul?: number }>(
    env,
    { pedido: text.slice(0, 600), departamento: dept ?? "qualquer", data_de_hoje: new Date().toISOString().slice(0, 10) },
    questions,
    4_000,
  );
  if (!res) return null;
  const dims = DIMS.map((d): RefineDim => {
    const probs = res.answers[d.key]?.probabilities ?? {};
    const unknown = probs[`o${d.options.length}`] ?? 0;
    // Stable sort: when the request says nothing, the list's own order (manhã, tarde, noite) stands.
    let ranked = d.options.map((label, i) => ({ label, p: probs[`o${i}`] ?? 0 })).sort((a, b) => b.p - a.p);
    const relevance = res.answers[`${d.key}_importa`]?.noul ?? 0;
    const relevant = relevance >= 0.6;
    let picked = ranked.filter((o) => o.p >= (TASTE.has(d.key) ? SURE_TASTE : SURE)).map((o) => o.label);
    let ask = relevant && !picked.length && (unknown >= 0.4 || (ranked[0]?.p ?? 0) < 0.5);
    // The event is known but not the role ("vestido de casamento"): ask the role, among that event's.
    const roles = d.key === "ocasiao" && EVENTS_WITH_ROLES[ranked[0]?.label] && ranked[0].p >= 0.5 ? EVENTS_WITH_ROLES[ranked[0].label] : null;
    if (roles) {
      const event = ranked[0].label;
      ranked = roles.map((r) => ({ label: `${event} — ${r}`, p: probs[`o${d.options.indexOf(`${event} — ${r}`)}`] ?? 0 })).sort((a, b) => b.p - a.p);
      picked = [];
      ask = true;
    }
    // Always alternatives, picked or not: an inference the shopper can't change is a guess imposed on
    // them. Occasions only where Jev sees a chance (the list is long; "casamento" is no alternative
    // to a half marathon); the short lists show their best six.
    const shown = d.key === "ocasiao" && !roles ? ranked.filter((o, i) => i === 0 || o.p >= 0.002) : ranked;
    return { key: d.key, name: d.name, relevance, label: roles ? "Qual o seu papel?" : d.label, options: shown.slice(0, 6), picked, ask };
  });
  // Without the role, what Jev inferred from an assumed one (white and black tie: the bride) is not
  // known either. Still offered, nothing pre-selected.
  if (dims[0].ask && dims[0].label === "Qual o seu papel?") {
    for (const d of dims)
      if (["traje", "cor", "estilo"].includes(d.key) && d.picked.length) {
        d.picked = [];
        d.ask = true; // it mattered enough to infer, so it's worth asking
      }
  }
  const who = res.answers.para_quem?.probabilities ?? {};
  const said = (who.o0 ?? 0) >= SURE_DEPT ? "feminino" : (who.o1 ?? 0) >= SURE_DEPT ? "masculino" : undefined;
  return { dims, dept: said, cost: res.cost };
}
