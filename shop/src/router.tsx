import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createDecoRouter } from "@decocms/tanstack";
import { routeTree } from "./routeTree.gen";
import "./setup";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });

const CHAT = /^\/c\/([0-9A-Za-z]{8})$/;

export function getRouter() {
  const router = createDecoRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
  // `/c/{id}` (a chat turn's URL) is the home route with `?c={id}` inside the router, so the address bar
  // can move to /c/ when a turn finishes without switching routes and remounting the chat.
  // createDecoRouter doesn't take `rewrite`, hence update().
  router.update({
    ...router.options,
    rewrite: {
      input: ({ url }) => {
        const m = url.pathname.match(CHAT);
        if (!m) return undefined;
        const u = new URL(url);
        u.pathname = "/";
        u.searchParams.set("c", m[1]);
        return u;
      },
      output: ({ url }) => {
        const c = url.searchParams.get("c");
        if (url.pathname !== "/" || !c || !/^[0-9A-Za-z]{8}$/.test(c)) return undefined;
        const u = new URL(url);
        u.pathname = `/c/${c}`;
        u.searchParams.delete("c");
        return u;
      },
    },
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
