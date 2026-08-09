"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "articles_read";

interface ArticleLimitOptions {
  /** How many full articles an anonymous reader gets before the soft gate. */
  limit?: number;
  /**
   * When true, the count resets each calendar month (a rolling monthly meter,
   * matching Google's Flexible Sampling guidance). When false, the count is a
   * single persistent counter (the original lifetime-per-browser behavior).
   */
  monthly?: boolean;
}

/** Current month key, e.g. "2026-06". */
function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Tracks how many full articles an anonymous user has read.
 * After the limit, the soft gate triggers.
 *
 * Defaults (limit 1, lifetime) preserve the original behavior so callers that
 * pass nothing are unchanged.
 */
export function useArticleLimit({ limit = 1, monthly = false }: ArticleLimitOptions = {}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      if (monthly) {
        // Monthly mode stores JSON { month, count }; reset when the month rolls.
        const parsed = JSON.parse(raw) as { month?: string; count?: number };
        if (parsed.month === monthKey()) {
          setCount(parsed.count ?? 0);
        } else {
          setCount(0);
        }
      } else {
        setCount(parseInt(raw, 10) || 0);
      }
    } catch {
      // localStorage unavailable, or legacy value in the other format: start fresh.
    }
  }, [monthly]);

  const increment = useCallback(() => {
    try {
      const next = count + 1;
      if (monthly) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ month: monthKey(), count: next }));
      } else {
        localStorage.setItem(STORAGE_KEY, String(next));
      }
      setCount(next);
    } catch {
      // ignore
    }
  }, [count, monthly]);

  return {
    articlesRead: count,
    hasReachedLimit: count >= limit,
    increment,
    limit,
  };
}
