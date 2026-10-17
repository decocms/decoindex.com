import { describe, expect, test } from "bun:test";
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
