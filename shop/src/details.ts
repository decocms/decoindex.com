/**
 * A request sent with "Refinar ✨" details goes to the model as one string:
 * "roupa pra correr\n(Detalhes: ocasião: corrida; horário: manhã)". Snapshots keep it that way;
 * this splits it back into the question and its chips for whoever opens the link.
 */
export function splitDetails(q: string): { q: string; context?: string[] } {
  const m = q.match(/^([\s\S]*?)\s*\(Detalhes: ([^)]*)\)\s*$/);
  return m ? { q: m[1].trim(), context: m[2].split(";").map((x) => x.trim()).filter(Boolean) } : { q };
}
