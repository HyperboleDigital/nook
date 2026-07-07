"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link as LinkIcon, Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// lucide-react has no brand logos — these three are common enough (and specifically asked for)
// that a real, recognizable glyph matters more than pulling in a whole icon library for it.
// Simplified single-path marks, not full brand assets.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.71.45 3.36 1.29 4.83L2 22l5.36-1.4a9.9 9.9 0 0 0 4.68 1.19h.01c5.46 0 9.9-4.45 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2Zm5.8 14.1c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.79-4.17-4.94-4.36-.15-.2-1.18-1.57-1.18-3 0-1.43.75-2.13 1.02-2.42.27-.29.58-.36.78-.36h.55c.18 0 .41-.07.64.49.24.58.81 2 .88 2.14.07.15.11.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.27.71 1.17 1.52 1.9 1.05.94 1.93 1.24 2.2 1.38.27.14.43.11.59-.07.16-.17.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.55.73 1.82.86.27.13.45.2.51.31.07.11.07.65-.17 1.33Z" />
    </svg>
  );
}
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
    </svg>
  );
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

type Channel = {
  key: string;
  label: string;
  bg: string;
  icon: React.ReactNode;
  // `copies` channels show their own checkmark feedback instead of navigating away.
  copies?: boolean;
  go: (url: string, title: string) => void | Promise<void>;
};

function buildChannels(): Channel[] {
  return [
    {
      key: "copy", label: "Copy link", bg: "bg-[var(--foreground)]", copies: true,
      icon: <LinkIcon className="h-5 w-5 text-white" />,
      go: (url) => navigator.clipboard.writeText(url),
    },
    {
      key: "whatsapp", label: "WhatsApp", bg: "bg-[#25D366]",
      icon: <WhatsAppIcon className="h-5 w-5 text-white" />,
      go: (url, title) => window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, "_blank", "noopener,noreferrer"),
    },
    {
      key: "messages", label: "Messages", bg: "bg-[#34C759]",
      icon: <MessageCircle className="h-5 w-5 text-white" />,
      // sms: URIs are honored on iOS/Android; harmless no-op on a platform with nothing
      // registered to handle them.
      go: (url, title) => { window.location.href = `sms:&body=${encodeURIComponent(`${title} ${url}`)}`; },
    },
    {
      key: "facebook", label: "Facebook", bg: "bg-[#1877F2]",
      icon: <FacebookIcon className="h-5 w-5 text-white" />,
      go: (url) => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer,width=600,height=600"),
    },
    {
      key: "instagram", label: "Instagram", bg: "bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]", copies: true,
      // Instagram has no web-share intent for an external link (DMs/stories/bio are all
      // in-app-only) — the honest move is to copy the link and hand the user off to paste it
      // themselves, rather than pretending there's a real share flow.
      icon: <InstagramIcon className="h-5 w-5 text-white" />,
      go: async (url) => {
        await navigator.clipboard.writeText(url);
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      },
    },
    {
      key: "email", label: "Email", bg: "bg-[var(--muted-foreground)]",
      icon: <Mail className="h-5 w-5 text-white" />,
      go: (url, title) => { window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`; },
    },
  ];
}

/**
 * A custom, branded share popover — replaces relying on `navigator.share` alone, which only
 * exists on some platforms (nothing on most desktop browsers) and, where it DOES exist, hands
 * control of the whole UI to the OS with zero say over how it looks. This gives every user the
 * same modern, on-brand set of options regardless of device: copy link, WhatsApp, Messages,
 * Facebook, Instagram, Email. `copies` channels (copy link, Instagram — see above) show their own
 * checkmark instead of closing the menu, so a mis-tap doesn't feel like nothing happened.
 */
export default function ShareMenu({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onClick); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const channels = buildChannels();

  const trigger = (c: Channel) => {
    c.go(url, title);
    if (c.copies) {
      setCopiedKey(c.key);
      setTimeout(() => setCopiedKey((k) => (k === c.key ? null : k)), 1800);
    } else {
      onClose();
    }
  };

  return (
    <div ref={ref} className="absolute top-full right-0 mt-2 w-72 rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)] p-4 z-10">
      <p className="text-sm font-semibold mb-3">Share this room</p>
      <div className="grid grid-cols-3 gap-3">
        {channels.map((c) => (
          <button key={c.key} type="button" onClick={() => trigger(c)}
            className="flex flex-col items-center gap-1.5 group">
            <span className={cn(
              "h-11 w-11 rounded-full flex items-center justify-center shadow-[var(--shadow-soft)] transition-transform group-hover:scale-105",
              c.bg,
            )}>
              {copiedKey === c.key ? <Check className="h-5 w-5 text-white" /> : c.icon}
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {copiedKey === c.key ? "Copied!" : c.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
