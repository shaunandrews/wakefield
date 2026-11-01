import { useEffect, useRef } from "preact/hooks";

import { findSkill } from "../../shared/content";
import type { LogView } from "../../shared/views";
import { TYPE } from "../design";
import { OutcomeBadge, cx } from "../ui";

function Narration({ text, big }: { text: string; big?: boolean }) {
  return (
    <div class={cx("space-y-4", big ? TYPE.narration : TYPE.body)}>
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
        <div class="flex items-center gap-4 pt-8">
          <span class="text-[11px] uppercase tracking-[0.3em] text-accent">scene</span>
          <h3 class={cx("uppercase tracking-[0.2em] text-ink", big ? "text-2xl" : "text-base")}>{e.text}</h3>
          <span class="h-px flex-1 bg-line" />
        </div>
      );
    case "narration":
      return <Narration text={e.text} big={big} />;
    case "action":
      return (
        <p class={cx("border-l border-accent pl-4 text-ink-muted", big ? "text-base" : "text-sm")}>
          <span class="text-accent">&gt; {e.who}</span> <span class="text-ink">{e.text}</span>
        </p>
      );
    case "roll":
      return (
        <div class={cx("flex flex-wrap items-center gap-3 text-ink-muted", big ? "text-sm" : "text-xs")}>
          <span class="text-accent">d20</span>
          <span class="text-ink">{e.who}</span>
          <span>
            {e.roll ? `${findSkill(e.roll.skill)?.name ?? e.roll.skill} · ${e.roll.total} vs ${e.roll.difficulty}` : e.text}
          </span>
          {e.roll ? <OutcomeBadge outcome={e.roll.outcome} /> : null}
        </div>
      );
    case "whisper":
      return (
        <div class="border border-dashed border-ink-muted px-4 py-3">
          <p class="text-[10px] uppercase tracking-[0.3em] text-ink-muted">// private channel</p>
          <p class="wf-read mt-1 text-sm text-ink">{e.text}</p>
        </div>
      );
    case "effect":
      return (
        <p class={cx("text-warning", big ? "text-sm" : "text-xs")}>
          ▲ {e.who} — {e.text}
        </p>
      );
    default:
      return <p class="text-center text-[11px] uppercase tracking-[0.25em] text-ink-muted">— {e.text} —</p>;
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
    <div class={cx("flex flex-col gap-6", className)}>
      {log.map((e) => (
        <LogEntry key={e.id} e={e} big={big} />
      ))}
      <div ref={end} />
    </div>
  );
}
