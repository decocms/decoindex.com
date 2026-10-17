import { useState } from "react";
import { track } from "~/sdk/useShopChat";

const shareUrl = (id: string) => `${location.origin}/s/${id}`;
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
    const data = { title: `deco shop: ${q}`, text: shareText(q), url: shareUrl(id) };
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
    <div className="relative inline-block">
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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line/70 frost px-4 py-3 md:px-8">
      <a
        href="/"
        onClick={(e) => {
          if (onHome) {
            e.preventDefault();
            onHome();
          }
        }}
        className="flex items-baseline gap-2"
      >
        <span className="text-xl font-semibold leading-none tracking-tight">deco shop</span>
        <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#1a2e05]">beta</span>
      </a>
      {right}
    </header>
  );
}
