import { useEffect, useRef } from "preact/hooks";

import { findSkill } from "../../shared/content";
import type { LogView } from "../../shared/views";
import { OutcomeBadge, cx } from "../ui";

function Narration({ text, big }: { text: string; big?: boolean }) {
  return (
    <div class={cx("space-y-3 leading-relaxed text-ink", big ? "text-xl md:text-2xl" : "text-base")}>
      {text
        .split(/\n+/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}

export function LogEntry({ e, big }: { e: LogView; big?: boolean }) {
  switch (e.kind) {
    case "scene":
      return (
        <div class="pt-6 pb-1">
          <p class="text-xs uppercase tracking-[0.35em] text-accent">Scene</p>
          <h3 class={cx("font-black text-ink", big ? "text-4xl" : "text-2xl")}>{e.text}</h3>
        </div>
      );
    case "narration":
      return <Narration text={e.text} big={big} />;
    case "action":
      return (
        <div class="rounded-xl border-l-4 border-accent bg-surface px-4 py-2">
          <span class="font-bold text-accent">{e.who}</span> <span class="text-ink">{e.text}</span>
        </div>
      );
    case "roll":
      return (
        <div class="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm">
          <span class="text-lg">🎲</span>
          <span class="font-bold">{e.who}</span>
          <span class="text-ink-muted">
            {e.roll ? `${findSkill(e.roll.skill)?.name ?? e.roll.skill}: ${e.roll.total} vs ${e.roll.difficulty}` : e.text}
          </span>
          {e.roll ? <OutcomeBadge outcome={e.roll.outcome} /> : null}
        </div>
      );
    case "whisper":
      return (
        <div class="rounded-xl border border-dashed border-[#b38cff] bg-[#b38cff]/10 px-4 py-2 text-sm">
          <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-[#b38cff]">Whisper — only you see this</p>
          <p class="mt-1 text-ink">{e.text}</p>
        </div>
      );
    case "effect":
      return (
        <p class="text-sm text-warning">
          <b>{e.who}</b>: {e.text}
        </p>
      );
    default:
      return <p class="text-center text-sm italic text-ink-muted">{e.text}</p>;
  }
}

/** The running story. Scrolls itself to the newest entry. */
export function StoryLog({ log, big, class: className }: { log: LogView[]; big?: boolean; class?: string }) {
  const end = useRef<HTMLDivElement>(null);
  const last = log.length ? log[log.length - 1].seq : 0;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [last]);
  return (
    <div class={cx("flex flex-col gap-4", className)}>
      {log.map((e) => (
        <LogEntry key={e.id} e={e} big={big} />
      ))}
      <div ref={end} />
    </div>
  );
}
