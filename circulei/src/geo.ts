/**
 * Where the pieces are and where the visitor is.
 *
 * Every Circulei listing names its owner's city in the description, so a piece's
 * location is a lookup in this table — no geocoder on the request path. Cities
 * not listed fall back to their state's capital (good enough for "how far").
 */
export type Point = { lat: number; lng: number };

export const CITIES: Record<string, Point & { uf: string }> = {
  "São Paulo": { uf: "SP", lat: -23.55, lng: -46.63 },
  Curitiba: { uf: "PR", lat: -25.43, lng: -49.27 },
  "Belo Horizonte": { uf: "MG", lat: -19.92, lng: -43.94 },
  "Rio de Janeiro": { uf: "RJ", lat: -22.91, lng: -43.17 },
  Goiânia: { uf: "GO", lat: -16.69, lng: -49.25 },
  Joinville: { uf: "SC", lat: -26.3, lng: -48.85 },
  Cuiabá: { uf: "MT", lat: -15.6, lng: -56.1 },
  "Montes Claros": { uf: "MG", lat: -16.73, lng: -43.86 },
  Salvador: { uf: "BA", lat: -12.97, lng: -38.5 },
  Brasília: { uf: "DF", lat: -15.79, lng: -47.88 },
  Londrina: { uf: "PR", lat: -23.31, lng: -51.16 },
  "Balneário Camboriú": { uf: "SC", lat: -26.99, lng: -48.63 },
  Manaus: { uf: "AM", lat: -3.12, lng: -60.02 },
  Piracicaba: { uf: "SP", lat: -22.73, lng: -47.65 },
  Gaspar: { uf: "SC", lat: -26.93, lng: -48.96 },
  Franca: { uf: "SP", lat: -20.54, lng: -47.4 },
  "Ponta Grossa": { uf: "PR", lat: -25.09, lng: -50.16 },
  Campinas: { uf: "SP", lat: -22.91, lng: -47.06 },
  Niterói: { uf: "RJ", lat: -22.88, lng: -43.1 },
  "Jaraguá do Sul": { uf: "SC", lat: -26.49, lng: -49.07 },
  "Governador Valadares": { uf: "MG", lat: -18.85, lng: -41.95 },
  Itaqui: { uf: "RS", lat: -29.13, lng: -56.55 },
  Vitória: { uf: "ES", lat: -20.32, lng: -40.34 },
  "Vila Velha": { uf: "ES", lat: -20.33, lng: -40.29 },
  "Presidente Prudente": { uf: "SP", lat: -22.12, lng: -51.39 },
  Guarulhos: { uf: "SP", lat: -23.46, lng: -46.53 },
  "Jaboatão dos Guararapes": { uf: "PE", lat: -8.11, lng: -35.01 },
  "Porto Alegre": { uf: "RS", lat: -30.03, lng: -51.23 },
  Apucarana: { uf: "PR", lat: -23.55, lng: -51.46 },
  Jundiaí: { uf: "SP", lat: -23.19, lng: -46.88 },
  Itatiba: { uf: "SP", lat: -23.01, lng: -46.84 },
  Fortaleza: { uf: "CE", lat: -3.73, lng: -38.53 },
  "São Carlos": { uf: "SP", lat: -22.02, lng: -47.89 },
  "João Pessoa": { uf: "PB", lat: -7.12, lng: -34.86 },
  Formosa: { uf: "GO", lat: -15.54, lng: -47.33 },
  Aracaju: { uf: "SE", lat: -10.91, lng: -37.07 },
  Recife: { uf: "PE", lat: -8.05, lng: -34.88 },
  Mafra: { uf: "SC", lat: -26.11, lng: -49.81 },
  Araras: { uf: "SP", lat: -22.36, lng: -47.38 },
  Araçatuba: { uf: "SP", lat: -21.21, lng: -50.43 },
  Teresina: { uf: "PI", lat: -5.09, lng: -42.8 },
  Florianópolis: { uf: "SC", lat: -27.6, lng: -48.55 },
  "Ribeirão Preto": { uf: "SP", lat: -21.18, lng: -47.81 },
  Santos: { uf: "SP", lat: -23.96, lng: -46.33 },
  Maringá: { uf: "PR", lat: -23.42, lng: -51.94 },
  Blumenau: { uf: "SC", lat: -26.92, lng: -49.07 },
  Uberlândia: { uf: "MG", lat: -18.92, lng: -48.28 },
  "Campo Grande": { uf: "MS", lat: -20.47, lng: -54.62 },
  Belém: { uf: "PA", lat: -1.46, lng: -48.5 },
  Natal: { uf: "RN", lat: -5.79, lng: -35.21 },
  Maceió: { uf: "AL", lat: -9.67, lng: -35.74 },
  "São Luís": { uf: "MA", lat: -2.53, lng: -44.3 },
};

const CAPITAL: Record<string, string> = {
  SP: "São Paulo", PR: "Curitiba", MG: "Belo Horizonte", RJ: "Rio de Janeiro", GO: "Goiânia",
  SC: "Florianópolis", MT: "Cuiabá", BA: "Salvador", DF: "Brasília", AM: "Manaus", RS: "Porto Alegre",
  ES: "Vitória", PE: "Recife", CE: "Fortaleza", PB: "João Pessoa", SE: "Aracaju", PI: "Teresina",
  MS: "Campo Grande", PA: "Belém", RN: "Natal", AL: "Maceió", MA: "São Luís",
};

/** Longest names first, so "Rio de Janeiro" wins over a shorter name inside it. */
const BY_LENGTH = Object.keys(CITIES).sort((a, b) => b.length - a.length);
export const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Finds the city named in a stretch of text, else the capital of the first state code in it. */
export function findCity(text: string): { city: string; uf: string } | null {
  const t = fold(text);
  for (const name of BY_LENGTH) if (t.includes(fold(name))) return { city: name, uf: CITIES[name]!.uf };
  const uf = text.match(/\b([A-Z]{2})\b/)?.[1];
  const cap = uf && CAPITAL[uf];
  return cap ? { city: cap, uf } : null;
}

export function pointOf(city: string): Point | null {
  return CITIES[city] ?? null;
}

export function km(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A city big enough to be its own home page. Smaller closets join the nearest hub within reach. */
export const HUB_MIN = 5;
export const HUB_REACH_KM = 130;
