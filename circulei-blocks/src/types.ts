/** What reaches the browser: only the fields a component renders, never the catalog. */
export interface CardData {
  handle: string;
  title: string;
  brand: string;
  img: string;
  alt?: string;
  price4: number;
  size: string;
  /** Sizes for the filter, comma-separated, no spaces. */
  sizes: string;
  /** Height band for the filter: a ≤1,59 · b 1,60–1,64 · c 1,65–1,69 · d 1,70+. */
  h: string;
  tag: { near: boolean; label: string } | null;
}

export interface HubLink {
  slug: string;
  city: string;
  uf: string;
  count: number;
  /** "aqui", "359 km", or null when we don't know where the visitor is. */
  dist: string | null;
  current: boolean;
  cover?: string;
}

export interface Place {
  /** null = Brasil todo. */
  hub: { slug: string; city: string; uf: string } | null;
  /** The visitor is really in (or next to) the city on screen. */
  here: boolean;
  /** Cloudflare's city, when it differs from the one on screen and we picked it. */
  visitorCity: string | null;
  total: number;
}
