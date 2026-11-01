import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Link, useQuery } from "@spacefast/zero/client";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Page({ children, wide }: { children: ComponentChildren; wide?: boolean }) {
  return (
    <main class={cx("mx-auto flex min-h-dvh w-full flex-col gap-5 px-4 pb-16 pt-5", wide ? "max-w-6xl" : "max-w-xl")}>{children}</main>
  );
}

export function TopBar({ back, title, right }: { back?: string; title?: string; right?: ComponentChildren }) {
  return (
    <header class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        {back ? (
          <Link to={back} class="rounded-full border border-line px-3 py-1 text-sm text-ink-muted hover:text-ink">
            ← Back
          </Link>
        ) : (
          <Link to="/" class="text-lg font-black tracking-[0.2em] text-accent">
            WAKEFIELD
          </Link>
        )}
        {title ? <h1 class="truncate text-lg font-semibold text-ink">{title}</h1> : null}
      </div>
      {right}
    </header>
  );
}

export function Panel({ children, class: className, title }: { children: ComponentChildren; class?: string; title?: string }) {
  return (
    <section class={cx("rounded-2xl border border-line bg-surface p-4 shadow-sm", className)}>
      {title ? <h2 class="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">{title}</h2> : null}
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
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2.5 text-base",
        size === "lg" && "px-5 py-3.5 text-lg",
        size === "xl" && "px-6 py-5 text-xl",
        tone === "accent" && "bg-accent text-canvas shadow-[0_0_24px_-6px] shadow-accent hover:brightness-110",
        tone === "ghost" && "border border-line bg-transparent text-ink hover:bg-surface",
        tone === "plain" && "bg-surface text-ink hover:brightness-125",
        tone === "danger" && "border border-danger bg-transparent text-danger hover:bg-danger hover:text-canvas",
        className as string,
      )}
    >
      {busy ? <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function Meter({ value, max, tone, label }: { value: number; max: number; tone: "vigor" | "charge"; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div class="flex items-center gap-2">
      {label ? <span class="w-14 shrink-0 text-xs uppercase tracking-wider text-ink-muted">{label}</span> : null}
      <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-canvas">
        <div
          class={cx(
            "h-full rounded-full transition-all duration-500",
            tone === "vigor" ? (pct <= 25 ? "bg-danger" : pct <= 50 ? "bg-warning" : "bg-success") : "bg-[#b38cff]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span class="w-12 shrink-0 text-right text-xs tabular-nums text-ink-muted">
        {value}/{max}
      </span>
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return <p class="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>;
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

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div class="flex flex-1 items-center justify-center gap-3 py-20 text-ink-muted">
      <span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      {label}
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const label = { surge: "Surge!", success: "Success", mixed: "Mixed", miss: "Miss", glitch: "Glitch!" }[outcome] ?? outcome;
  return (
    <span
      class={cx(
        "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
        outcome === "surge" && "bg-accent text-canvas",
        outcome === "success" && "bg-success text-canvas",
        outcome === "mixed" && "bg-warning text-canvas",
        (outcome === "miss" || outcome === "glitch") && "bg-danger text-canvas",
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
