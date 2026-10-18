import { useSyncExternalStore } from "react";
import type { Tile } from "~/types";

/**
 * "Favoritos": lists of pieces saved on this device, one list per search ("vestido para casamento
 * em portugal"), newest first. localStorage only, guarded (private mode may throw or be empty).
 * A tiny store with subscribers, so every heart on screen updates together.
 */
export interface FavList {
  name: string;
  at: string;
  items: Tile[];
}

const KEY = "decoshop:favorites";
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

/** What a list is called: the search, without Refinar details, short. */
export const listName = (q: string) => q.replace(/\s*\(Detalhes:[\s\S]*$/, "").trim().slice(0, 80) || "Sem nome";

/** Only what the drawer and the product view need: no description, at most four photos. */
const slim = (t: Tile): Tile => ({ ...t, description: undefined, images: t.images.slice(0, 4) });

export const favorites = {
  lists: load,
  has: (id: string) => load().some((l) => l.items.some((t) => t.id === id)),
  /** Saved under `list` (moved to the top), or removed from every list if it was already saved. */
  toggle(t: Tile, list: string) {
    const all = load();
    if (all.some((l) => l.items.some((x) => x.id === t.id))) {
      save(all.map((l) => ({ ...l, items: l.items.filter((x) => x.id !== t.id) })));
      return false;
    }
    const name = listName(list);
    const found = all.find((l) => l.name === name);
    const updated: FavList = { name, at: new Date().toISOString(), items: [slim(t), ...(found?.items ?? [])].slice(0, MAX_ITEMS) };
    save([updated, ...all.filter((l) => l.name !== name)]);
    return true;
  },
  remove: (id: string) => save(load().map((l) => ({ ...l, items: l.items.filter((x) => x.id !== id) }))),
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
