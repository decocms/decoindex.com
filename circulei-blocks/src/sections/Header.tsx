import { useEffect, useRef } from "react";
import { Logo, Pin } from "~/components/ui";
import type { HubLink, Place } from "~/types";

export interface Props {
  /** @title Texto do botão */
  cta?: string;
  /** @title Link do botão */
  ctaHref?: string;
  /** @hide */
  place?: Place;
  /** @hide */
  hubs?: HubLink[];
}

export default function Header({ cta = "Quero circular", ctaHref = "/seja-locadora", place, hubs = [] }: Props) {
  const label = place?.hub ? place.hub.city : "Brasil todo";
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pop.current;
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") el?.querySelector<HTMLElement>("a[aria-current]")?.focus();
    };
    el?.addEventListener("toggle", onToggle);
    return () => el?.removeEventListener("toggle", onToggle);
  }, []);
  return (
    <header className="top">
      <a className="logo" href="/" aria-label="Circulei, início">
        <Logo />
      </a>
      <button className="city" popoverTarget="cities" aria-label={`Cidade: ${label}. Trocar`}>
        <Pin />
        <span>{label}</span>
      </button>
      <nav>
        <a href={ctaHref} className="lend">
          {cta}
        </a>
      </nav>
      {/* Picking a city opens that city's home, from any page: a piece belongs to one city. */}
      <div id="cities" popover="auto" className="cities" ref={pop}>
        <p className="hint">
          {place?.visitorCity ? `Você está em ${place.visitorCity}. ` : ""}Mostramos primeiro as peças da cidade mais perto de você. Tudo também chega por envio, pra todo o Brasil.
        </p>
        {hubs.map((h) => (
          <a key={h.slug} href={`/?cidade=${h.slug}`} aria-current={h.current ? "true" : undefined}>
            <span>
              {h.city} <small>{h.uf}</small>
            </span>
            <span className="n">
              {h.count} peças{h.dist ? ` · ${h.dist}` : ""}
            </span>
          </a>
        ))}
        <a href="/?cidade=brasil" aria-current={place?.hub ? undefined : "true"}>
          <span>Brasil todo</span>
          <span className="n">{place?.total ?? 0} peças</span>
        </a>
      </div>
    </header>
  );
}
