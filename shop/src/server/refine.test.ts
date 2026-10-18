import { expect, test } from "bun:test";
import { forWhom } from "./refine";

const o = (...l: string[]) => l.map((label) => ({ label, p: 0.1 }));
const dims = [
  {
    key: "ocasiao",
    name: "ocasião",
    relevance: 1,
    label: "Qual o seu papel?",
    options: o("casamento — padrinho", "casamento — convidada(o)", "casamento — madrinha", "casamento — noiva", "casamento — mãe ou pai dos noivos"),
    picked: [],
    ask: true,
  },
  { key: "comprimento", name: "comprimento", relevance: 1, label: "Qual comprimento?", options: o("midi", "longo"), picked: [], ask: true },
];
const roles = (ds: typeof dims) => ds[0].options.map((x) => x.label.split(" — ")[1]);

test("a terno gets no bride, no godmother, no midi", () => {
  const m = forWhom(dims, "masculino");
  expect(m.map((d) => d.key)).toEqual(["ocasiao"]);
  expect(roles(m)).toEqual(["padrinho", "convidada(o)", "mãe ou pai dos noivos"]);
});

test("a dress gets no groomsman", () => {
  const f = forWhom(dims, "feminino");
  expect(f).toHaveLength(2);
  expect(roles(f)).toEqual(["convidada(o)", "madrinha", "noiva", "mãe ou pai dos noivos"]);
});

test("unknown wearer: everything stays", () => {
  expect(forWhom(dims, undefined)).toEqual(dims);
});
