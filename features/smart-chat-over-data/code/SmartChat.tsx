"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { SmartToolMode, SmartToolMessage, ExtractedInsight } from "@/lib/claude";
import { InsightApplier } from "./InsightApplier";

const MODES: { id: SmartToolMode; label: string; sub: string; icon: string }[] = [
  {
    id: "brainstorm",
    label: "Brainstorm",
    sub: "3-5 structured approaches",
    icon: "◇"
  },
  {
    id: "decision",
    label: "Decide",
    sub: "weighted options, clear call",
    icon: "◆"
  },
  {
    id: "strategy",
    label: "Strategy",
    sub: "guided session with next steps",
    icon: "❯"
  },
  {
    id: "draft",
    label: "Draft",
    sub: "email, pitch, follow-up",
    icon: "✎"
  },
  {
    id: "briefing",
    label: "Briefing",
    sub: "morning orientation",
    icon: "◉"
  },
  {
    id: "outreach",
    label: "Outreach",
    sub: "cold message, warm path",
    icon: "→"
  },
  {
    id: "content",
    label: "Content",
    sub: "post, caption, angle",
    icon: "◈"
  },
  {
    id: "spec",
    label: "Spec",
    sub: "lean product specification",
    icon: "⊡"
  },
  {
    id: "analyze",
    label: "Analyze",
    sub: "find the actual pattern",
    icon: "⌬"
  }
];

const MODE_PLACEHOLDERS: Record<SmartToolMode, string> = {
  brainstorm: "What problem are you trying to solve?",
  decision: "What are you deciding between?",
  strategy: "What's the situation and what are you optimizing for?",
  draft: "What do you need to write? Audience and goal?",
  briefing: "Ask a follow-up question...",
  outreach: "Who are you reaching out to and what do you want from them?",
  content: "What's the angle, platform, or moment you're working with?",
  spec: "What are you building? Describe the problem it solves.",
  analyze: "What situation, data, or pattern do you want to understand?"
};

export function SmartChat() {
  const [mode, setMode] = useState<SmartToolMode>("brainstorm");
  const [messages, setMessages] = useState<SmartToolMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [insights, setInsights] = useState<ExtractedInsight | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || pending) return;

      const next: SmartToolMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setInput("");
      setPending(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, messages: next })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Chat failed.");
        setMessages([...next, { role: "assistant", content: data.reply }]);
        if (data.insights) setInsights(data.insights);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages([
          ...next,
          { role: "assistant", content: `[Error: ${msg}]` }
        ]);
      } finally {
        setPending(false);
      }
    },
    [input, messages, mode, pending]
  );

  const handleBriefing = useCallback(async () => {
    if (pending) return;
    const trigger = "Generate my morning briefing now.";
    const next: SmartToolMessage[] = [{ role: "user", content: trigger }];
    setMessages(next);
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "briefing", messages: next })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed.");
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (data.insights) setInsights(data.insights);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages([...next, { role: "assistant", content: `[Error: ${msg}]` }]);
    } finally {
      setPending(false);
    }
  }, [pending]);

  const clearSession = () => {
    setMessages([]);
    setInput("");
    setInsights(null);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Mode selector */}
      <div className="card">
        <div className="card-label em">Mode</div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left transition-colors",
                mode === m.id
                  ? "border-emerald-dim bg-emerald-bg"
                  : "border-border bg-bg-raised hover:border-border-light"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-[0.9rem]",
                    mode === m.id ? "text-emerald" : "text-text-dim"
                  )}
                >
                  {m.icon}
                </span>
                <span className="font-display text-[0.9rem] font-semibold text-text">
                  {m.label}
                </span>
              </div>
              <div className="mt-0.5 text-[0.68rem] text-text-muted">{m.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="card min-h-[360px] flex flex-col">
        <div className="flex items-center justify-between">
          <div className="card-label" id="smart-chat-label">
            Conversation
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearSession}
              aria-label="Clear conversation"
              className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-danger"
            >
              Clear session
            </button>
          )}
        </div>

        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-labelledby="smart-chat-label"
          className="flex-1 space-y-4 overflow-y-auto pr-1"
          style={{ maxHeight: "520px" }}
        >
          {messages.length === 0 ? (
            mode === "briefing" ? (
              <div className="py-10 text-center">
                <div className="font-mono text-[1.4rem] text-emerald mb-3">◉</div>
                <div className="font-display text-[1rem] font-semibold text-text">
                  Ready for your morning briefing.
                </div>
                <p className="mt-2 text-[0.82rem] text-text-muted">
                  Claude will summarize today's actions, follow-ups due, and your single most leveraged move.
                </p>
                <button
                  type="button"
                  onClick={handleBriefing}
                  disabled={pending}
                  className="mt-5 btn btn-primary disabled:opacity-50"
                >
                  Generate Today's Briefing
                </button>
              </div>
            ) : (
              <div className="py-10 text-center">
                <div className="font-display text-[1rem] font-semibold text-text">
                  What do you want to think about?
                </div>
                <p className="mt-2 text-[0.82rem] text-text-muted">
                  Pick a mode above, type below. Claude has full context on your
                  goals, actions, network, finances, and recent journal entries.
                </p>
              </div>
            )
          ) : (
            messages.map((m, i) => <ChatMessage key={i} message={m} />)
          )}
          {pending && (
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-bg font-mono text-[0.6rem] text-emerald">
                AI
              </div>
              <div className="flex-1 rounded-md border border-border bg-bg-raised px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-recPulse rounded-full bg-emerald" />
                  <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-text-muted">
                    thinking
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {insights && <InsightApplier insights={insights} />}

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          aria-label="Send a message to the smart tool"
          className="mt-4 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            aria-label={`Message in ${mode} mode`}
            placeholder={MODE_PLACEHOLDERS[mode]}
            disabled={pending}
            rows={2}
            className="flex-1 resize-none rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.9rem] text-text placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="btn btn-primary self-stretch disabled:opacity-50"
          >
            {pending ? "…" : "Send"}
          </button>
        </form>
        <div className="mt-1 text-[0.6rem] text-text-dim">
          ⌘ + Enter to send
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: SmartToolMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[0.6rem]",
          isUser ? "bg-bg-elevated text-text-med" : "bg-emerald-bg text-emerald"
        )}
      >
        {isUser ? "N" : "AI"}
      </div>
      <div
        className={cn(
          "max-w-[calc(100%-3rem)] rounded-md px-4 py-3 text-[0.88rem] leading-relaxed",
          isUser
            ? "bg-emerald-bg text-text"
            : "border border-border bg-bg-raised text-text-med"
        )}
      >
        <div className="whitespace-pre-wrap">{renderMarkdown(message.content)}</div>
      </div>
    </div>
  );
}

/**
 * Minimal markdown rendering. Handles **bold**, *italic*, inline `code`,
 * and preserves line breaks. Not a full parser — good enough for Claude
 * responses which use these primitives.
 */
function renderMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-text">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <em key={key++} className="italic text-text-med">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-[0.82em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
