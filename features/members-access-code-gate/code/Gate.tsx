"use client";

import { useEffect, useRef } from "react";
import { enterAction } from "./actions";
import Sedan9 from "@/app/brand/Sedan9";

export default function Gate({ initialCode = "", error = "" }: { initialCode?: string; error?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (initialCode && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      setTimeout(() => formRef.current?.requestSubmit(), 400);
    }
  }, [initialCode]);

  const wrong = error === "wrong";
  const locked = error === "locked";

  const inputClass = [
    "gate-input caret-gold text-center uppercase",
    "w-full mx-auto block",
    locked ? "opacity-30 grayscale pointer-events-none" : "opacity-100",
    wrong ? "shake" : "",
  ].join(" ");

  return (
    <>
      {/* Pre-paint body dark so the gate doesn't flash cream during hydration. */}
      <style>{`html,body{background:#0A0A12 !important}`}</style>
    <main className="dark-canvas gate-canvas flex items-center justify-center px-6">
      <div
        className="relative w-full flex flex-col items-center text-center"
        style={{ color: "#F5F1E8", maxWidth: "min(620px, 55vw, calc(100vw - 48px))" }}
      >
        {/* Plaque mark — emblem on a subtle warm halo, like a crest under a stage spot */}
        <div
          className="fade-in relative"
          style={{
            color: "#C9A86A",
            fontSize: "clamp(64px, 7.6vw, 104px)",
            lineHeight: 0,
            padding: "0.45em 0.55em",
          }}
        >
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(201, 168, 106, 0.16) 0%, rgba(201, 168, 106, 0.05) 35%, transparent 70%)",
              borderRadius: "50%",
              filter: "blur(2px)",
            }}
          />
          <svg viewBox="0 6 64 21" width="1em" height="0.328125em" aria-label="Momentum Motorcars" role="img" style={{ display: "block", position: "relative" }}>
            <path
              d="M 2 20 C 2 17, 4 16, 6 16 L 22 16 C 26 16, 28 12, 30 8 L 40 8 C 42 8, 44 12, 52 16 L 58 16 C 60 16, 62 17, 62 20"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="2" y1="20" x2="62" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="14" cy="22" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="50" cy="22" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>

        {/* Wordmark — weight 500 carries the type on dark; tighter tracking; subtle gold drop on the italic */}
        <p
          className="mt-9 leading-[0.98]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(36px, 6.2vw, 80px)",
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          Momentum
          <span
            className="block italic"
            style={{
              color: "#C9A86A",
              fontWeight: 500,
              letterSpacing: "0.005em",
              textShadow: "0 0 28px rgba(201, 168, 106, 0.18)",
            }}
          >
            Motorcars
          </span>
        </p>

        {/* Hairline */}
        <span
          aria-hidden
          className="block my-8 sm:my-10"
          style={{ width: "clamp(36px, 3.5vw, 56px)", height: 1, background: "rgba(201, 168, 106, 0.55)" }}
        />

        {/* Eyebrow */}
        <p
          id="gate-eyebrow"
          className="fade-in"
          style={{
            color: "#C9A86A",
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(11px, 1.05vw, 14px)",
            letterSpacing: "0.36em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          By Invitation
        </p>

        {/* Form */}
        <form
          ref={formRef}
          action={enterAction}
          className="fade-in-delay mt-10 w-full flex flex-col items-center"
        >
          <input
            ref={inputRef}
            name="code"
            defaultValue={initialCode}
            disabled={locked}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-label="Invitation code"
            aria-describedby="gate-eyebrow"
            placeholder="Code"
            className={inputClass}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(15px, 1.5vw, 20px)",
              letterSpacing: "0.32em",
              padding: "clamp(14px, 1.6vw, 22px) 12px",
              maxWidth: "clamp(280px, 38vw, 420px)",
            }}
          />
          <button type="submit" className="sr-only" aria-hidden>
            Enter
          </button>
        </form>

        {/* Plaque footer — dateline + houses */}
        <div className="mt-14 sm:mt-20 flex flex-col items-center gap-2">
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(10px, 0.95vw, 12px)",
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(245, 241, 232, 0.45)",
            }}
          >
            Monaco · London · Los Angeles
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(10px, 0.95vw, 12px)",
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(245, 241, 232, 0.32)",
            }}
          >
            Strictly by Introduction
          </p>
        </div>

        {wrong ? (
          <p
            className="mt-6"
            role="alert"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(245, 241, 232, 0.55)",
            }}
          >
            Code not recognised
          </p>
        ) : null}
        {locked ? (
          <p
            className="mt-6"
            role="alert"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(245, 241, 232, 0.55)",
            }}
          >
            Sixty seconds &middot; Please wait
          </p>
        ) : null}
      </div>
    </main>
    </>
  );
}
