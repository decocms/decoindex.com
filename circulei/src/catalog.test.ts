import { expect, test } from "bun:test";
import { group, parsePiece } from "./catalog";

const p = (description: string, slug = "/products/x") => ({ slug, title: "vestido", brand: "Minú", description, images: ["a"], variants: [{ priceMinor: 10600, available: true }] });

test("reads the new listing format: owner, city, size, body, retail", () => {
  const x = parsePiece(p("direto do closet de: Paula B. São Paulo, SP tamanho tamanho da etiqueta: 36 permite ajustes: sim aceita prova: não Manequim: 36 Altura: 1.57m Busto: 81cm Cintura: 72cm Quadril: 90cm custo da peça: 1.300,00"))!;
  expect([x.owner, x.city, x.uf, x.size, x.height, x.retail, x.prova, x.ajuste]).toEqual(["Paula B.", "São Paulo", "SP", "36", 1.57, 130000, false, true]);
  expect(x.body).toBe("busto 81 · cintura 72 · quadril 90");
});

test("reads the old format and cities without a comma", () => {
  const a = parsePiece(p("vestido roxo, Vessi. Tamanho P, serve nos tamanhos PP, M. Direto do closet de Kharina L., em Curitiba, PR. Alugue na Circulei a partir de R$ 424,00 por 4 dias."))!;
  expect([a.owner, a.city, a.size, a.fits]).toEqual(["Kharina L.", "Curitiba", "P", "PP, M"]);
  const b = parsePiece(p("direto do closet de: Circulei Curitiba, PR tamanho tamanhos: 36, 38 permite ajustes"))!;
  expect([b.owner, b.city, b.size]).toEqual(["Circulei", "Curitiba", "36, 38"]);
  expect(parsePiece(p("direto do closet de: Livia M. Cuiabá MT tamanho"))!.city).toBe("Cuiabá");
});

test("small closets join the nearest hub within reach", () => {
  const raw = [
    ...Array.from({ length: 5 }, (_, i) => parsePiece(p("closet de: A. São Paulo, SP", `/products/sp${i}`))!),
    parsePiece(p("closet de: B. Guarulhos, SP", "/products/g"))!,
    parsePiece(p("closet de: C. Manaus, AM", "/products/m"))!,
  ];
  const g = group(raw);
  expect(g.hubs.map((h) => [h.city, h.count])).toEqual([["São Paulo", 6]]);
  expect(g.pieces.find((x) => x.handle === "m")!.hub).toBe("Manaus");
});
