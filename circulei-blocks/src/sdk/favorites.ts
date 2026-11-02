import { useSyncExternalStore } from "react";
import type { CardData } from "~/types";

/**
 * "Favoritos", the shop's mechanism (shop/src/sdk/favorites.ts): lists of pieces saved on this
 * device, one list per search or per city ("Peças em Curitiba"), newest first. localStorage only,
 * guarded (private mode may throw or be empty). A tiny store with subscribers, so every heart on
 * screen updates together.
 */
export interface FavList {
  name: string;
  at: string;
  items: CardData[];
}

const KEY = "circulei:favorites";
const MAX_LISTS = 40;
const MAX_ITEMS = 60;

let lists: FavList[] | null = null;
const listeners = new Set<() => void>();

function load(): FavList[] {
  if (lists) return lists;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    lists = Array.isArray(v) ? v : [];
  } catch {
    lists = [];
  }
  return lists;
}

function save(next: FavList[]) {
  lists = next.filter((l) => l.items.length).slice(0, MAX_LISTS);
  try {
    localStorage.setItem(KEY, JSON.stringify(lists));
  } catch {
    /* private mode: kept for this visit only */
  }
  for (const l of listeners) l();
}

export const favorites = {
  has: (id: string) => load().some((l) => l.items.some((t) => t.handle === id)),
  /** Saved under `list` (moved to the top), or removed from every list if it was already saved. */
  toggle(c: CardData, list: string) {
    const all = load();
    if (all.some((l) => l.items.some((x) => x.handle === c.handle))) {
      save(all.map((l) => ({ ...l, items: l.items.filter((x) => x.handle !== c.handle) })));
      return false;
    }
    const name = list.trim().slice(0, 80) || "Favoritos";
    const found = all.find((l) => l.name === name);
    const updated: FavList = { name, at: new Date().toISOString(), items: [c, ...(found?.items ?? [])].slice(0, MAX_ITEMS) };
    save([updated, ...all.filter((l) => l.name !== name)]);
    return true;
  },
  remove: (id: string) => save(load().map((l) => ({ ...l, items: l.items.filter((x) => x.handle !== id) }))),
  dropList: (name: string) => save(load().filter((l) => l.name !== name)),
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const EMPTY: FavList[] = [];

/** Re-renders when any favorite changes. Empty on the server (no localStorage there). */
export function useFavorites(): FavList[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

export const useFavCount = () => useFavorites().reduce((s, l) => s + l.items.length, 0);
export const useIsFav = (id: string) => useFavorites().some((l) => l.items.some((x) => x.handle === id));

/** Toggle and log it (circulei.fav), like the shop's shop.fav. */
export function toggleFav(c: CardData, list: string) {
  const on = favorites.toggle(c, list);
  fetch("/api/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "circulei.fav", meta: { id: c.handle, on, list } }),
    keepalive: true,
  }).catch(() => {});
  return on;
}
