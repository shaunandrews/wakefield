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
    <main class={cx("mx-auto flex min-h-dvh w-full flex-col gap-6 px-4 pb-24 pt-5", wide ? "max-w-6xl" : "max-w-xl")}>{children}</main>
  );
}

/** Section label. Use only when a section's purpose isn't obvious from its content. */
export function Label({ children, class: className }: { children: ComponentChildren; class?: string }) {
  return <p class={cx(TYPE.label, className)}>{children}</p>;
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
            ‹ Back
          </Link>
        ) : (
          <Logo />
        )}
        {title ? <h1 class="truncate text-sm text-ink">{title}</h1> : null}
      </div>
      {right}
    </header>
  );
}

type BtnProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "accent" | "ghost" | "danger" | "plain";
  size?: "sm" | "md" | "lg" | "xl";
  busy?: boolean;
};

/**
 * Buttons. A filled signal button always means "tap me": when disabled, the
 * primary button drops to an outline with muted text instead of a dimmed fill.
 */
export function Btn({ tone = "accent", size = "md", busy, children, class: className, disabled, ...rest }: BtnProps) {
  const off = Boolean(disabled || busy);
  return (
    <button
      {...rest}
      disabled={off}
      class={cx(
        "inline-flex items-center justify-center gap-2 border font-medium uppercase tracking-[0.15em] transition-colors disabled:cursor-not-allowed",
        size === "sm" && "px-3 py-1.5 text-[11px]",
        size === "md" && "px-4 py-2.5 text-xs",
        size === "lg" && "px-5 py-3.5 text-sm",
        size === "xl" && "px-6 py-4 text-sm",
        tone === "accent" && !off && "border-accent bg-accent text-canvas hover:bg-transparent hover:text-accent",
        tone === "accent" && off && "border-line bg-transparent text-ink-muted",
        tone === "ghost" && "border-line bg-transparent text-ink hover:border-ink disabled:text-ink-muted",
        tone === "plain" && "border-transparent bg-surface text-ink hover:border-line",
        tone === "danger" && "border-danger bg-transparent text-danger hover:bg-danger hover:text-canvas",
        className as string,
      )}
    >
      {busy ? <span class="wf-blink text-accent">▮</span> : null}
      {children}
    </button>
  );
}

/** Segmented Vigor bar: one block per point. Plain words, no codes. */
export function VigorBar({ value, max, label = true }: { value: number; max: number; label?: boolean }) {
  const segments = Math.max(1, Math.min(max, 20));
  const filled = max > 0 ? Math.round((Math.max(0, value) / max) * segments) : 0;
  const ratio = max > 0 ? value / max : 0;
  const on = ratio <= 0.25 ? "bg-danger" : ratio <= 0.5 ? "bg-warning" : "bg-accent";
  return (
    <div class="flex items-center gap-3">
      {label ? <span class="text-xs text-ink-muted">Vigor</span> : null}
      <div class="flex h-2 flex-1 gap-[2px]">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} class={cx("h-full flex-1", i < filled ? on : "bg-line")} />
        ))}
      </div>
      <span class="w-10 shrink-0 text-right text-xs tabular-nums text-ink-muted">
        {value}/{max}
      </span>
    </div>
  );
}

/** Small pools (Charge) as pips. */
export function Pips({ value, max, title }: { value: number; max: number; title?: string }) {
  return (
    <span class="inline-flex items-center gap-1" title={title ?? `${value} of ${max}`} aria-label={title ?? `${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} class={cx("h-2.5 w-2.5 border", i < value ? "border-accent bg-accent" : "border-line")} />
      ))}
    </span>
  );
}

export function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return <p class="border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>;
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

/** Loading keeps the screen's shape: faint placeholder lines, never a black screen. */
export function Loading({ lines = 4 }: { lines?: number }) {
  return (
    <div class="flex flex-col gap-4 py-8" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} class={cx("h-4 bg-surface", i % 3 === 0 ? "w-2/3" : i % 3 === 1 ? "w-full" : "w-5/6")} />
      ))}
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

/** What each outcome means, in plain words. */
export const OUTCOME_MEANING: Record<string, string> = {
  surge: "Better than hoped.",
  success: "You do it.",
  mixed: "You do it, at a cost.",
  miss: "It doesn't work.",
  glitch: "It goes wrong.",
};

/**
 * The full-screen "moment": the one pattern for big beats (dice, scene titles,
 * the ending). Scanlines, a framed panel, nothing else on screen.
 */
export function Moment({ children, onDismiss, solid }: { children: ComponentChildren; onDismiss?: () => void; solid?: boolean }) {
  return (
    <div
      class={cx("wf-scan fixed inset-0 z-50 flex items-center justify-center p-6", solid ? "bg-canvas" : "bg-canvas/95", onDismiss ? "cursor-pointer" : "pointer-events-none")}
      onClick={onDismiss}
      role="dialog"
    >
      <div class="wf-frame flex max-w-2xl flex-col items-center gap-6 border border-line bg-canvas px-10 py-10 text-center md:px-14">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data

const lastValues = new Map<string, unknown>();

/**
 * Live query with three guarantees:
 * 1. Fresh on open: every mount subscribes under a new key, so a screen never
 *    shows results cached from before you navigated away (the stale-list bug).
 * 2. No blank screens: the last value seen for the same query renders
 *    instantly while the fresh one loads.
 * 3. Optional safety net (`refreshMs`): production realtime sometimes drops
 *    change notifications between devices, so game screens re-subscribe on an
 *    interval and whenever the screen wakes.
 * Extra arguments are ignored by the server; they only key the subscription.
 */
export function useLiveQuery<T>(name: string, args: unknown[] = [], refreshMs = 0): T | undefined {
  const [mountKey] = useState(() => Math.random().toString(36).slice(2, 8));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!refreshMs) return;
    const bump = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    const timer = setInterval(bump, refreshMs);
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("focus", bump);
    };
  }, [refreshMs]);
  const key = `${name}:${JSON.stringify(args)}`;
  const padded = [...args];
  // Pad so the key arguments always land after the real ones.
  const value = useQuery<T>(name, ...padded, `${mountKey}.${tick}`);
  if (value !== undefined) lastValues.set(key, value);
  return value ?? (lastValues.get(key) as T | undefined);
}

/** Seconds since an ISO timestamp, ticking once a second. */
export function useSecondsSince(iso: string): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const at = Date.parse(iso || "");
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 1000)) : 0;
}

/** Keep a value for at least `ms` after it last changed (for "moments"). */
export function useLatch<T>(value: T, ms: number): [T | null, () => void] {
  const [shown, setShown] = useState<T | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (value === null || value === undefined) return;
    setShown(value);
    const t = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(t);
  }, [value]);
  return [shown, () => setShown(null)];
}
