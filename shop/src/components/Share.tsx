import { useState } from "react";
import { track } from "~/sdk/useShopChat";

// The turn's own address: it opens in the chat, where the conversation can go on.
const shareUrl = (id: string) => `${location.origin}/c/${id}`;
const shareText = (q: string) => `Olha o que o deco shop achou pra “${q}” ✨`;

/**
 * Native share sheet on phones (WhatsApp, Instagram, iMessage… whatever the OS
 * offers); on desktop, WhatsApp + copy link. The link is a frozen snapshot, so
 * a friend opening it sees the same picks instantly, without a new LLM call.
 */
export function ShareButton({ id, q, variant = "pill" }: { id: string; q: string; variant?: "pill" | "solid" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const native = async () => {
    // No `text` in the sheet: macOS "Copy" would paste the caption along with the link.
    // Copying is the "🔗 Link" button's job; this one only opens the sheet.
    const data = { title: `deco shop: ${q}`, url: shareUrl(id) };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        track("shop.share", { id, via: "native" });
      } catch {
        /* dismissed */
      }
      return;
    }
    setOpen((o) => !o);
  };

  const copy = async () => {
    await navigator.clipboard?.writeText(shareUrl(id)).catch(() => {});
    setCopied(true);
    track("shop.share", { id, via: "copy" });
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={native}
        aria-expanded={open}
        className={
          variant === "solid"
            ? "tap-scale inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-ink/85"
            : "tap-scale inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium transition hover:border-ink/40"
        }
      >
        <svg viewBox="0 0 24 24" className={variant === "solid" ? "size-4" : "size-3.5"} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        Compartilhar
      </button>
      {variant === "pill" && (
        <button
          type="button"
          onClick={copy}
          className="tap-scale ml-1.5 inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium transition hover:border-ink/40"
        >
          {copied ? "Copiado ✓" : "🔗 Link"}
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 flex w-52 animate-rise flex-col overflow-hidden rounded-md border border-line bg-white p-1 text-sm shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${shareText(q)} ${shareUrl(id)}`)}`}
            target="_blank"
            rel="noopener"
            onClick={() => {
              track("shop.share", { id, via: "whatsapp" });
              setOpen(false);
            }}
            className="rounded-sm px-3 py-2.5 hover:bg-[#f5f5f5]"
          >
            Enviar no WhatsApp
          </a>
          <button type="button" onClick={copy} className="rounded-sm px-3 py-2.5 text-left hover:bg-[#f5f5f5]">
            {copied ? "Link copiado ✓" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}

export function SiteHeader({ onHome, right }: { onHome?: () => void; right?: React.ReactNode }) {
  return (
    // One centered floating frost pill, like demo-storefront's HeaderNav: logo | wordmark, then the page's controls.
    <header className="sticky top-0 z-30 flex justify-center px-3 py-3 md:px-6">
      <nav className={`frost flex h-11 max-w-full items-center gap-3 rounded-sm pl-3 ${right ? "pr-1.5" : "pr-3.5"}`}>
        <a
          href="/"
          aria-label="deco shop — início"
          onClick={(e) => {
            if (onHome) {
              e.preventDefault();
              onHome();
            }
          }}
          className="tap-scale flex shrink-0 items-center gap-3"
        >
          <img src="/deco-logo.png" alt="deco" width={67} height={28} className="h-7 w-auto" />
          {/* On a phone with controls on the right, the wordmark doesn't fit: the logo alone goes home. */}
          <span aria-hidden className={`h-5 w-px bg-ink/20 ${right ? "hidden sm:inline" : ""}`} />
          <span className={`text-sm tracking-[0.14em] text-ink/80 ${right ? "hidden sm:inline" : ""}`}>shop</span>
          <span className={`rounded-full bg-[#d4f01f] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#0b3d1c] ${right ? "hidden sm:inline" : ""}`}>beta</span>
        </a>
        {right}
      </nav>
    </header>
  );
}
