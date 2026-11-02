import { useRouter } from "@tanstack/react-router";

/**
 * Changes the address bar without telling the router. TanStack patches history.pushState and
 * replaceState so every URL change becomes a navigation: opening a piece over the list (/p/{handle})
 * rendered the piece's page underneath, and each filter click reloaded the page data. These URL
 * changes are bookkeeping for back and for sharing, not navigations.
 */
export function useQuietHistory() {
  const router = useRouter();
  return (fn: () => void) => {
    const h = router.history as unknown as { _ignoreSubscribers?: boolean };
    h._ignoreSubscribers = true;
    try {
      fn();
    } finally {
      h._ignoreSubscribers = false;
    }
  };
}
