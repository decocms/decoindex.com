import { useRouterState } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import type { Dept } from "./useShopChat";

/**
 * Tiny shared state between CMS sections that render side by side (ShopChat
 * and Showcase): the department toggle, whether a chat has started, and a way
 * for a card in one section to ask a question in the other.
 */
type State = { dept: Dept; started: boolean };
let state: State = { dept: "feminino", started: false };
const subs = new Set<() => void>();
const askers = new Set<(text: string) => void>();

export const bus = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
  },
  /** A card asked something: ShopChat runs it. */
  ask(text: string) {
    askers.forEach((f) => f(text));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  },
  onAsk(f: (text: string) => void) {
    askers.add(f);
    return () => void askers.delete(f);
  },
};

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
const SERVER: State = { dept: "feminino", started: false };

export function useBus(): State {
  const st = useSyncExternalStore(subscribe, bus.get, () => SERVER);
  // A /c/{id} page renders its turn on the server: the home's sections are already hidden there,
  // before ShopChat's effect gets to say "started".
  const turnPage = useRouterState({ select: (r) => !!(r.matches.find((m) => m.routeId === "/")?.loaderData as { share?: unknown } | undefined)?.share });
  return turnPage && !st.started ? { ...st, started: true } : st;
}
