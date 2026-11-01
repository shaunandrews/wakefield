import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Link, useQuery } from "@spacefast/zero/client";

import { TYPE } from "./design";

// Components implementing docs/design-system.md. Tokens live in client/design.ts;
// global fonts, palette, and the wf-* helper classes are installed by client/index.tsx.

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Page({ children, wide }: { children: ComponentChildren; wide?: boolean }) {
  return (
    <main class={cx("mx-auto flex min-h-dvh w-full flex-col gap-6 px-4 pb-20 pt-5", wide ? "max-w-6xl" : "max-w-xl")}>{children}</main>
  );
}

/** Small terminal-style section label: "// CREW". */
export function Label({ children, class: className }: { children: ComponentChildren; class?: string }) {
  return <p class={cx(TYPE.label, className)}>// {children}</p>;
}

export function Logo() {
  return (
    <Link to="/" class="text-sm font-bold uppercase tracking-[0.4em] text-ink">
      Wakefield<span class="text-accent">_</span>
    </Link>
  );
}

export function TopBar({ back, title, right }: { back?: string; title?: string; right?: ComponentChildren }) {
  return (
    <header class="flex items-center justify-between gap-3 border-b border-line pb-3">
      <div class="flex min-w-0 items-center gap-4">
        {back ? (
          <Link to={back} class="text-xs uppercase tracking-[0.2em] text-ink-muted hover:text-accent">
            ‹ back
          </Link>
        ) : (
          <Logo />
        )}
        {title ? <h1 class="truncate text-xs uppercase tracking-[0.2em] text-ink">{title}</h1> : null}
      </div>
      {right}
    </header>
  );
}

export function Panel({ children, class: className, title }: { children: ComponentChildren; class?: string; title?: string }) {
  return (
    <section class={cx("border border-line p-4", className)}>
      {title ? <Label class="mb-3">{title}</Label> : null}
      {children}
    </section>
  );
}

type BtnProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "accent" | "ghost" | "danger" | "plain";
  size?: "sm" | "md" | "lg" | "xl";
  busy?: boolean;
};

export function Btn({ tone = "accent", size = "md", busy, children, class: className, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      class={cx(
        "inline-flex items-center justify-center gap-2 border font-medium uppercase tracking-[0.15em] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "px-3 py-1.5 text-[11px]",
        size === "md" && "px-4 py-2.5 text-xs",
        size === "lg" && "px-5 py-3.5 text-sm",
        size === "xl" && "px-6 py-4 text-sm",
        tone === "accent" && "border-accent bg-accent text-canvas hover:bg-transparent hover:text-accent",
        tone === "ghost" && "border-line bg-transparent text-ink hover:border-ink",
        tone === "plain" && "border-transparent bg-surface text-ink hover:border-line",
        tone === "danger" && "border-danger bg-transparent text-danger hover:bg-danger hover:text-canvas",
        className as string,
      )}
    >
      {busy ? <span class="wf-blink">▮</span> : null}
      {children}
    </button>
  );
}

/** Segmented bar, one block per point (capped so big pools stay readable). */
export function Meter({ value, max, tone, label }: { value: number; max: number; tone: "vigor" | "charge"; label?: string }) {
  const segments = Math.max(1, Math.min(max, 20));
  const filled = max > 0 ? Math.round((Math.max(0, value) / max) * segments) : 0;
  const ratio = max > 0 ? value / max : 0;
  const on = tone === "charge" ? "bg-ink-muted" : ratio <= 0.25 ? "bg-danger" : ratio <= 0.5 ? "bg-warning" : "bg-accent";
  return (
    <div class="flex items-center gap-2">
      {label ? <span class="w-10 shrink-0 text-[10px] uppercase tracking-[0.2em] text-ink-muted">{label}</span> : null}
      <div class="flex h-2 flex-1 gap-[2px]">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} class={cx("h-full flex-1", i < filled ? on : "bg-line")} />
        ))}
      </div>
      <span class="w-12 shrink-0 text-right text-[11px] tabular-nums text-ink-muted">
        {String(value).padStart(2, "0")}/{String(max).padStart(2, "0")}
      </span>
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return <p class="border-l-2 border-danger pl-3 text-xs text-danger">! {error}</p>;
}

/** Wrap an async call with busy + error state. */
export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

export function Loading({ label = "Connecting" }: { label?: string }) {
  return (
    <div class="flex flex-1 items-center justify-center py-24 text-xs uppercase tracking-[0.25em] text-ink-muted">
      {label}
      <span class="wf-blink ml-1 text-accent">_</span>
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const label = { surge: "Surge", success: "Success", mixed: "Mixed", miss: "Miss", glitch: "Glitch" }[outcome] ?? outcome;
  return (
    <span
      class={cx(
        "border px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.2em]",
        outcome === "surge" && "border-accent bg-accent text-canvas",
        outcome === "success" && "border-accent text-accent",
        outcome === "mixed" && "border-warning text-warning",
        (outcome === "miss" || outcome === "glitch") && "border-danger text-danger",
      )}
    >
      {label}
    </span>
  );
}

/**
 * A live query with a safety net. Zero pushes updates over realtime, but in
 * production some change notifications never reach other devices. For the game
 * screens that matters (a phone stuck in the lobby), so we also re-subscribe
 * every few seconds and whenever the screen wakes up. The extra `tick` argument
 * is ignored by the server; it only gives the subscription a fresh key. The
 * last value is kept while the fresh one loads, so nothing flickers.
 */
export function useResilientQuery<T>(name: string, arg: string, intervalMs = 4000): T | undefined {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    const timer = setInterval(bump, intervalMs);
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("focus", bump);
    };
  }, [intervalMs]);
  const value = useQuery<T>(name, arg, tick);
  const last = useRef<T | undefined>(undefined);
  if (value !== undefined) last.current = value;
  return value ?? last.current;
}
