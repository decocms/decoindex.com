/**
 * The decocms.com footer (decocms-tanstack, sections/Common/Footer.tsx): dark green card, lime
 * headings, the big "deco" wordmark cropped at the bottom. Same logo asset, links for the shop.
 */
const LOGO = "https://assets.decocache.com/decocms/42ba3cd7-83b9-4cbf-88f2-0c0d4a361851/decologo.png";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  { title: "deco shop", links: [["Nova busca", "/"], ["Como funciona", "/como-funciona"]] },
  {
    title: "Feito com",
    links: [
      ["decoindex", "https://decoindex.com"],
      ["deco Studio", "https://github.com/decocms/studio"],
      ["Blocks", "https://github.com/decocms/blocks"],
    ],
  },
  {
    title: "deco",
    links: [
      ["decocms.com", "https://decocms.com"],
      ["Blog", "https://decocms.com/blog"],
      ["Falar com a gente", "https://decocms.com/agendar"],
    ],
  },
  {
    title: "Social",
    links: [
      ["LinkedIn", "https://www.linkedin.com/company/decocms/"],
      ["YouTube", "https://www.youtube.com/@decocms"],
      ["X", "https://x.com/deco_cms"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Termos de uso", "https://decocms.com/termos-de-uso"],
      ["Privacidade", "https://decocms.com/politica-de-privacidade"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="w-full p-2">
      <div className="rounded-2xl bg-[#07401A] px-4 pt-20 md:px-8 md:pt-28 lg:px-16">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-10 md:gap-20">
          <nav aria-label="Rodapé" className="grid w-full grid-cols-2 gap-8 md:grid-cols-3 md:gap-10 lg:grid-cols-5">
            {COLUMNS.map((c) => (
              <div key={c.title} className="flex flex-col gap-4">
                <h3 className="text-lg font-medium leading-relaxed text-[#D0EC1A]">{c.title}</h3>
                <ul className="flex flex-col">
                  {c.links.map(([text, url]) => {
                    const external = /^https?:\/\//.test(url);
                    return (
                      <li key={text} className="py-2">
                        <a
                          href={url}
                          target={external ? "_blank" : undefined}
                          rel={external ? "noopener noreferrer" : undefined}
                          className="text-base text-[#E7E5E4] transition-colors hover:text-[#D0EC1A]/80"
                        >
                          {text}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="w-full overflow-hidden">
            <img src={LOGO} alt="deco" width={1296} height={186} loading="lazy" className="w-full object-cover object-top" />
          </div>
        </div>
      </div>
    </footer>
  );
}
