import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";

import { COLOR, FONT } from "./design";

/**
 * Wakefield is always played at night. Pin the platform's semantic tokens to
 * the design tokens instead of following the device's light/dark setting.
 */
const PALETTE: Record<string, string> = {
  "--color-canvas": COLOR.canvas,
  "--color-surface": COLOR.surface,
  "--color-line": COLOR.line,
  "--color-ink": COLOR.ink,
  "--color-ink-muted": COLOR.muted,
  "--color-accent": COLOR.signal,
  "--color-success": COLOR.signal,
  "--color-warning": COLOR.caution,
  "--color-danger": COLOR.alarm,
};

const FONTS_HREF = FONT.href;

/** Global type and the small set of wf-* helpers Tailwind can't express statically. */
const GLOBAL_CSS = `
html, body { background: ${COLOR.canvas}; }
.wf { font-family: ${FONT.mono}; font-feature-settings: "zero" 1; }
.wf ::selection { background: ${COLOR.signal}; color: ${COLOR.canvas}; }
.wf-read { font-family: ${FONT.read}; }
.wf-blink { animation: wf-blink 1s steps(1) infinite; }
@keyframes wf-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .wf-blink { animation: none; } }
.wf-frame { position: relative; }
.wf-frame::before, .wf-frame::after { content: ""; position: absolute; width: 10px; height: 10px; pointer-events: none; }
.wf-frame::before { top: -1px; left: -1px; border-top: 1px solid ${COLOR.signal}; border-left: 1px solid ${COLOR.signal}; }
.wf-frame::after { bottom: -1px; right: -1px; border-bottom: 1px solid ${COLOR.signal}; border-right: 1px solid ${COLOR.signal}; }
.wf-scan { background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px); }
.wf input, .wf textarea { border-radius: 0; }
.wf input::placeholder, .wf textarea::placeholder { color: ${COLOR.muted}; opacity: 0.55; }
`;

/** Wraps every interactive page. Routes live in pages/. */
export function Layout({ children }: { children: ComponentChildren }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = "dark";
    for (const [k, v] of Object.entries(PALETTE)) root.style.setProperty(k, v);
    if (!document.getElementById("wf-fonts")) {
      const link = Object.assign(document.createElement("link"), { id: "wf-fonts", rel: "stylesheet", href: FONTS_HREF });
      document.head.append(link);
    }
    if (!document.getElementById("wf-css")) {
      const style = Object.assign(document.createElement("style"), { id: "wf-css", textContent: GLOBAL_CSS });
      document.head.append(style);
    }
  }, []);
  return (
    <div class="wf min-h-dvh bg-canvas text-ink antialiased" style={{ ...PALETTE, colorScheme: "dark" }}>
      {children}
    </div>
  );
}
