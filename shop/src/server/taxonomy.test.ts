import { describe, expect, test } from "bun:test";
import { anotherRound, curate } from "./chat";
import type { Tile } from "../types";
import { BRAND_CONTEXT } from "./brand-context";
import { BRANDS } from "./brands";
import { attributes, detectType, overlap, pickCategory, toCategories, words } from "./taxonomy";

// Shapes copied from real decoindex storefront docs (FARM: VTEX tree with depth;
// Osklen: breadcrumb names, no depth; Insider: Shopify collections with counts).
const farm = toCategories([
  { path: "/moda-feminina", name: "Moda Feminina", depth: 0 },
  { path: "/moda-feminina/vestido", name: "Vestido", depth: 1, parent: "Moda Feminina" },
  { path: "/moda-feminina/saia", name: "Saia", depth: 1, parent: "Moda Feminina" },
  { path: "/moda-feminina/praia", name: "Praia", depth: 1, parent: "Moda Feminina" },
  { path: "/moda-feminina/t-shirt", name: "t-shirt", depth: 1, parent: "Moda Feminina" },
  { path: "/bazar-farm/vestido", name: "Vestido", depth: 1, parent: "bazar farm" },
  { path: "/fabula-e-bento/vestido", name: "Vestido", depth: 1, parent: "Fábula e Bento" },
  { path: "/moda-feminina/vale-presente-e-farm", name: "Vale Presente e-FARM", depth: 1, parent: "Moda Feminina" },
]);
const osklen = toCategories([
  { path: "/masculino/vestuario", name: "Masculino > Vestuário" },
  { path: "/masculino/calcados", name: "Masculino > Calçados" },
  { path: "/feminino/calcados", name: "Feminino > Calçados" },
]);
const nb = toCategories([
  { path: "/calcado", name: "Calçado", depth: 0 },
  { path: "/calcado/tenis", name: "Tênis", depth: 1, parent: "Calçado" },
  { path: "/calcado/chuteira-campo", name: "Chuteira Campo", depth: 1, parent: "Calçado" },
]);

describe("words", () => {
  test("folds accents and plurals, keeps tênis", () => {
    expect(words("Vestidos Longos")).toEqual(["vestido", "longo"]);
    expect(words("Tênis")).toEqual(["tenis"]);
    expect(words("Calções")).toEqual(["calcao"]);
    expect(words("t-shirt")).toEqual(["t-shirt"]);
    expect(words("Kit 3 Tech T-Shirts")).toEqual(["kit", "tech", "t-shirt"]);
  });
});

describe("pickCategory", () => {
  test("main line beats bazar and kids lines", () => {
    expect(pickCategory(farm, "vestido", { dept: "feminino" })?.category.path).toBe("/moda-feminina/vestido");
  });
  test("bazar wins when the shopper wants a sale", () => {
    expect(pickCategory(farm, "vestido", { sale: true })?.category.path).toBe("/bazar-farm/vestido");
  });
  test("synonyms reach the store's own naming", () => {
    expect(pickCategory(farm, "camiseta")?.category.path).toBe("/moda-feminina/t-shirt");
    expect(pickCategory(farm, "biquini")).toBeUndefined(); // no biquini category: caller searches instead
    expect(pickCategory(farm, "praia")?.category.path).toBe("/moda-feminina/praia");
  });
  test("department steers away from the wrong side", () => {
    expect(pickCategory(osklen, "sapato", { dept: "feminino" })?.category.path).toBe("/feminino/calcados");
    expect(pickCategory(osklen, "sapato", { dept: "masculino" })?.category.path).toBe("/masculino/calcados");
  });
  test("leaf over root", () => {
    expect(pickCategory(nb, "tenis")?.category.path).toBe("/calcado/tenis");
  });
  test("internal/disabled categories are skipped", () => {
    const aviator = toCategories([
      { path: "/camisas-desativado", name: "CAMISAS - DESATIVADO", depth: 0 },
      { path: "/roupas-masculinas/camisa-masculina", name: "Camisa Masculina", depth: 1, parent: "Roupas Masculinas" },
    ]);
    expect(pickCategory(aviator, "camisa", { dept: "masculino" })?.category.path).toBe("/roupas-masculinas/camisa-masculina");
  });
  test("gift cards are never a category", () => {
    expect(pickCategory(farm, "vestido")?.category.path).not.toContain("presente");
  });
});

describe("similar", () => {
  test("type and attributes from a title", () => {
    expect(detectType("Vestido Linho Curto")).toBe("vestido");
    expect(detectType("T-shirt soft used gold crown")).toBe("camiseta");
    expect(attributes("Vestido De Linho Midi Com Bordados", "vestido")).toEqual(["linho", "midi", "bordado"]);
  });
  test("overlap matches prefixes", () => {
    expect(overlap(["linho", "estampa"], "Saia Midi Estampada de Linho")).toBe(2);
    expect(overlap(["azul"], "Vestido Preto")).toBe(0);
  });
});

describe("otherDept", () => {
  test("drops the other side, keeps unisex", async () => {
    const { otherDept } = await import("./taxonomy");
    expect(otherDept("Camisa Feminina Com Linho", "masculino")).toBe(true);
    expect(otherDept("Camisa Masculina Linho", "masculino")).toBe(false);
    expect(otherDept("Tênis Unissex 530", "feminino")).toBe(false);
    expect(otherDept("Camiseta Fila Comfort Soft Fem", "masculino")).toBe(true);
  });
});

describe("isKids", () => {
  test("children's lines are recognized", async () => {
    const { isKids } = await import("./taxonomy");
    expect(isKids("biquíni infantil listrado")).toBe(true);
    expect(isKids("Jardineira Infantil de Moletom")).toBe(true);
    expect(isKids("Vestido Longo Estampado")).toBe(false);
  });
});

describe("deptOf", () => {
  test("reads the breadcrumb", async () => {
    const { deptOf } = await import("./taxonomy");
    expect(deptOf("Moda Feminina Macacão")).toBe("feminino");
    expect(deptOf("Masculino > Vestuário")).toBe("masculino");
    expect(deptOf("Calçados")).toBeUndefined();
  });
});

test("every roster brand has context, and nothing orphaned", () => {
  expect(BRANDS.filter((b) => !BRAND_CONTEXT[b.domain]).map((b) => b.domain)).toEqual([]);
  expect(Object.keys(BRAND_CONTEXT).filter((d) => !BRANDS.some((b) => b.domain === d))).toEqual([]);
});

test("mixBrands interleaves brands and keeps each brand's order", async () => {
  const { mixBrands } = await import("./chat");
  const t = (brand: string, id: string) => ({ brand, id }) as never;
  const out = mixBrands([t("A", "a1"), t("A", "a2"), t("A", "a3"), t("B", "b1"), t("C", "c1"), t("B", "b2")]) as { id: string }[];
  expect(out.map((x) => x.id)).toEqual(["a1", "b1", "c1", "a2", "b2", "a3"]);
});

test("colorsFromNames reads the color out of SKU names when the slug agrees", async () => {
  const { colorsFromNames } = await import("./catalog");
  expect(colorsFromNames("/vestido-linho-desfiado-preto-77131-10/p", [{ name: "Vestido linho desfiado - preto - G" }, { name: "Vestido linho desfiado - preto - M" }])).toEqual(["preto"]);
  expect(colorsFromNames("/vestido-curto-desfiado-ggt-off-white-75320-18/p", [{ name: "Vestido curto desfiado ggt - off white - G" }])).toEqual(["off white"]);
  expect(colorsFromNames("/vestido-de-crepe-midi-marrom-grape-07-16/p", [{ name: "Marrom Grape - P" }])).toEqual(["Marrom Grape"]);
  expect(colorsFromNames("/vestido-cropped-jardim-maravilhoso_preto-341401/p", [{ name: "Jardim Maravilhoso_Preto - PP" }])).toEqual(["Jardim Maravilhoso / Preto"]);
  // Not in the slug → not trusted as a color.
  expect(colorsFromNames("/calca-agata/p", [{ name: "Calça Agata - Linho - 38" }])).toEqual([]);
});

test("colorConflict drops a known other color, keeps unknown", async () => {
  const { colorConflict } = await import("./taxonomy");
  expect(colorConflict(["linho", "branco"], { title: "Camisa classic linen", colors: ["preto"] })).toBe(true);
  expect(colorConflict(["linho", "branco"], { title: "Camisa Slim Linho Branca" })).toBe(false);
  expect(colorConflict(["branco"], { title: "Vestido", colors: ["OFF WHITE/OFF WHITE"] })).toBe(false);
  expect(colorConflict(["linho", "branco"], { title: "Camisa Linho Ampla Cava" })).toBe(false); // unknown
  expect(colorConflict(["linho"], { title: "Camisa", colors: ["preto"] })).toBe(false); // no color asked
});

test("colorsFromClaims reads VTEX color specifications", async () => {
  const { colorsFromClaims } = await import("./catalog");
  expect(colorsFromClaims([{ predicate: "cor_filtro", value: "BORDO ESCURO" }, { predicate: "cor", value: "Bordo Escuro/Fungi-Marrom Claro" }, { predicate: "categoria", value: "Corrida" }])).toEqual(["BORDO ESCURO", "Bordo Escuro", "Fungi-Marrom Claro"]);
  expect(colorsFromClaims(undefined)).toEqual([]);
});

describe("Jev grid", () => {
  const tile = (brand: string, n: number) => ({ id: `${brand}:${n}`, brand, domain: brand, title: `${brand} ${n}`, images: [], url: "", sizes: [], currency: "BRL" }) as Tile;
  const tiles = [...Array(10)].map((_, i) => tile("cea", i)).concat([...Array(4)].map((_, i) => tile("hering", i)), [tile("bobo", 0)]);

  test("best first, one brand capped, brands take turns", () => {
    const scores = new Map(tiles.map((t, i) => [t.id, t.brand === "cea" ? 2 - i * 0.01 : 1.5]));
    const grid = curate(tiles, scores);
    expect(grid.filter((t) => t.brand === "cea").length).toBe(8); // cap = ceil(24 / 3 brands)
    expect(grid.slice(0, 3).map((t) => t.brand)).toEqual(["cea", "hering", "bobo"]);
  });

  test("unrelated tiles stay off the grid once there are 12 good ones", () => {
    const scores = new Map(tiles.map((t) => [t.id, t.brand === "bobo" ? 0.1 : 1.8]));
    expect(curate(tiles, scores).some((t) => t.brand === "bobo")).toBe(false);
  });

  test("without scores, the stores' order", () => {
    expect(curate(tiles.slice(0, 3), new Map()).map((t) => t.id)).toEqual(["cea:0", "cea:1", "cea:2"]);
  });

  test("a second round when good ones are few or one brand dominates", () => {
    const allGood = (ts: Tile[]) => new Map(ts.map((t) => [t.id, 2]));
    expect(anotherRound(tiles.slice(0, 4), allGood(tiles))).toContain("Só 4");
    expect(anotherRound(tiles.slice(0, 9), allGood(tiles))).toContain("cea é 9 dos 9");
    expect(anotherRound(tiles, allGood(tiles))).toBe("");
  });
});

test("Tênis de Mesa is not tênis", () => {
  const mizuno = toCategories([
    { path: "/feminino/calcados/tenis-de-mesa", name: "Tênis de Mesa", depth: 2, parent: "Calçados" },
    { path: "/feminino/calcados/corrida", name: "Corrida", depth: 2, parent: "Calçados" },
  ]);
  expect(pickCategory(mizuno, "tenis", { dept: "feminino" })).toBeUndefined();
});
