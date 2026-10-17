import { describe, expect, test } from "bun:test";

// heroScore is module-private; exercise it through the same rules it encodes.
import { detectType, overlap, words } from "./taxonomy";

const first = (title: string) => words(title)[0];

describe("hero photo rules", () => {
  test("a luggage tag is not a suitcase", () => {
    expect(first("TAG MALA COURO METAL PRETO")).toBe("tag");
    expect(first("Mala de Bordo Rígida 20")).toBe("mala");
  });
  test("terms are required: nylon is not linen", () => {
    expect(overlap(["linho"], "Calça Nylon Cargo Feminina")).toBe(0);
    expect(overlap(["linho"], "Calça Pantalona de Linho")).toBe(1);
  });
  test("type still recognized past the first word", () => {
    expect(detectType("Kit 3 Tech T-Shirts")).toBe("camiseta");
  });
});
