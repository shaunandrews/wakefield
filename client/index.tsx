import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";

/**
 * Wakefield is always played at night: pin the platform's semantic tokens to
 * the neon-tide palette instead of following the device's light/dark setting.
 */
const PALETTE: Record<string, string> = {
  "--color-canvas": "#070b14",
  "--color-surface": "#0f1626",
  "--color-line": "#1e2a42",
  "--color-ink": "#e8f1ff",
  "--color-ink-muted": "#8a9bb8",
  "--color-accent": "#3ee6c8",
  "--color-success": "#3ddc84",
  "--color-warning": "#ffb547",
  "--color-danger": "#ff5c7a",
};

/** Wraps every interactive page. Routes live in pages/. */
export function Layout({ children }: { children: ComponentChildren }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = "dark";
    for (const [k, v] of Object.entries(PALETTE)) root.style.setProperty(k, v);
    document.body.style.background = PALETTE["--color-canvas"];
  }, []);
  return (
    <div class="min-h-dvh bg-canvas text-ink antialiased" style={{ ...PALETTE, colorScheme: "dark" }}>
      {children}
    </div>
  );
}
