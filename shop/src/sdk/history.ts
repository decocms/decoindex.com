import type { Turn } from "./useShopChat";

/** One finished search, as the history drawer shows it. Reopens from its snapshot (/c/{id}). */
export interface Past {
  id: string;
  q: string;
  context?: string[];
  images: string[];
  brands: string[];
  n: number;
  dept?: string;
  at: string;
}

/**
 * "Histórico": the searches made on this device, newest first. localStorage only (nothing leaves
 * the browser), and it may throw or be empty in private mode, so every access is guarded.
 */
const KEY = "decoshop:history";
const MAX = 60;

export const pastSearches = {
  list(): Past[] {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  },
  add(t: Turn, dept?: string) {
    if (!t.shareId) return;
    const picked = t.curated?.length ? t.curated.map((id) => t.products.find((p) => p.id === id)).filter((p) => !!p) : t.products;
    const entry: Past = {
      id: t.shareId,
      q: t.seed ? `Mais como “${t.seed.title}”` : t.user,
      context: t.context,
      images: picked.slice(0, 3).map((p) => p!.images[0]).filter(Boolean),
      brands: [...new Set(picked.map((p) => p!.brand))].slice(0, 4),
      n: picked.length,
      dept,
      at: new Date().toISOString(),
    };
    try {
      const rest = pastSearches.list().filter((p) => p.id !== entry.id);
      localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, MAX)));
    } catch {
      /* private mode: no history, nothing breaks */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  },
};
