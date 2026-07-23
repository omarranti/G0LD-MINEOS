"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  PROSPECT_RELATIONSHIP_LABELS,
  PROSPECT_SENIORITY_LABELS,
  PROSPECT_STATUS_LABELS,
  type Prospect,
  type ProspectRelationship,
  type ProspectStatus
} from "@/lib/database";
import {
  updateProspectRelationship,
  updateProspectStatus
} from "@/app/(dashboard)/prospects/mutations";

type SortKey = "fit" | "access" | "name" | "department" | "seniority";

type OptimisticPatch = {
  id: string;
  status?: ProspectStatus;
  relationship_to_user?: ProspectRelationship;
};

/**
 * Dense, client-sortable table of prospects with inline mutations for
 * status and relationship_to_user. Uses React 19's useOptimistic so
 * updates feel instant while the server action runs in the background.
 * On error, the reducer snaps back to the last-known server state.
 */
export function ProspectTable({ prospects }: { prospects: Prospect[] }) {
  const [sort, setSort] = useState<SortKey>("fit");
  const [filter, setFilter] = useState("");
  const [, startTransition] = useTransition();

  const [optimisticRows, applyPatch] = useOptimistic(
    prospects,
    (rows: Prospect[], patch: OptimisticPatch) =>
      rows.map((r) =>
        r.id === patch.id
          ? {
              ...r,
              ...(patch.status !== undefined && { status: patch.status }),
              ...(patch.relationship_to_user !== undefined && {
                relationship_to_user: patch.relationship_to_user
              })
            }
          : r
      )
  );

  function handleStatusChange(id: string, status: ProspectStatus) {
    startTransition(async () => {
      applyPatch({ id, status });
      await updateProspectStatus(id, status);
    });
  }

  function handleRelationshipChange(
    id: string,
    relationship: ProspectRelationship
  ) {
    startTransition(async () => {
      applyPatch({ id, relationship_to_user: relationship });
      await updateProspectRelationship(id, relationship);
    });
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return optimisticRows;
    return optimisticRows.filter((p) => {
      const hay = [
        p.name,
        p.title,
        p.department,
        p.target_org,
        p.location,
        ...(p.tags ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [optimisticRows, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case "fit":
          return (
            descNullsLast(a.fit_score, b.fit_score) ||
            descNullsLast(a.accessibility_score, b.accessibility_score)
          );
        case "access":
          return (
            descNullsLast(a.accessibility_score, b.accessibility_score) ||
            descNullsLast(a.fit_score, b.fit_score)
          );
        case "name":
          return a.name.localeCompare(b.name);
        case "department":
          return (a.department ?? "zz").localeCompare(b.department ?? "zz");
        case "seniority":
          return (a.seniority ?? "zz").localeCompare(b.seniority ?? "zz");
      }
    });
    return arr;
  }, [filtered, sort]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, title, department, tag…"
          className="w-full max-w-sm rounded-md border border-border bg-bg-raised px-3 py-1.5 text-[0.82rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
        />
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim">
          {sorted.length} / {prospects.length}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[0.78rem]">
          <thead>
            <tr className="border-b border-border-light text-left font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim">
              <SortHeader id="name" sort={sort} setSort={setSort}>
                Name
              </SortHeader>
              <th className="py-2 pr-3">Title</th>
              <SortHeader id="department" sort={sort} setSort={setSort}>
                Dept
              </SortHeader>
              <SortHeader id="seniority" sort={sort} setSort={setSort}>
                Level
              </SortHeader>
              <SortHeader id="fit" sort={sort} setSort={setSort} align="right">
                Fit
              </SortHeader>
              <SortHeader id="access" sort={sort} setSort={setSort} align="right">
                Reach
              </SortHeader>
              <th className="py-2 pr-3">Rel</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Link</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.id}
                className="border-b border-border-light/40 align-top hover:bg-bg-raised/30"
              >
                <td className="max-w-[12rem] py-2.5 pr-3 font-display text-[0.85rem] font-semibold text-text">
                  {p.name}
                </td>
                <td className="max-w-[14rem] py-2.5 pr-3 text-text-med">
                  {p.title ?? <span className="text-text-dim">—</span>}
                </td>
                <td className="py-2.5 pr-3 text-text-med">
                  {p.department ?? <span className="text-text-dim">—</span>}
                </td>
                <td className="py-2.5 pr-3 text-text-med">
                  {p.seniority ? (
                    <span className="badge badge-muted">
                      {PROSPECT_SENIORITY_LABELS[p.seniority]}
                    </span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right">
                  <ScoreBar value={p.fit_score} />
                </td>
                <td className="py-2.5 pr-3 text-right">
                  <ScoreBar value={p.accessibility_score} />
                </td>
                <td className="py-2.5 pr-3">
                  <select
                    value={p.relationship_to_user}
                    onChange={(e) =>
                      handleRelationshipChange(
                        p.id,
                        e.target.value as ProspectRelationship
                      )
                    }
                    aria-label={`Relationship for ${p.name}`}
                    className={cn(
                      "inline-cell-select rounded border px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] transition-colors focus-visible:outline-none",
                      p.relationship_to_user === "unknown"
                        ? "border-border bg-bg-raised text-text-muted hover:border-border-light"
                        : "border-emerald-dim bg-emerald-bg text-emerald hover:border-emerald"
                    )}
                  >
                    {(
                      Object.keys(
                        PROSPECT_RELATIONSHIP_LABELS
                      ) as ProspectRelationship[]
                    ).map((key) => (
                      <option
                        key={key}
                        value={key}
                        className="bg-bg text-text"
                      >
                        {PROSPECT_RELATIONSHIP_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 pr-3">
                  <select
                    value={p.status}
                    onChange={(e) =>
                      handleStatusChange(p.id, e.target.value as ProspectStatus)
                    }
                    aria-label={`Status for ${p.name}`}
                    className={cn(
                      "inline-cell-select rounded border px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] transition-colors focus-visible:outline-none",
                      p.status === "new"
                        ? "border-border bg-bg-raised text-text-muted hover:border-border-light"
                        : p.status === "dead"
                          ? "border-danger/50 bg-danger/10 text-danger hover:border-danger"
                          : p.status === "promoted"
                            ? "border-amber/60 bg-amber/10 text-amber hover:border-amber"
                            : "border-emerald-dim bg-emerald-bg text-emerald hover:border-emerald"
                    )}
                  >
                    {(
                      Object.keys(
                        PROSPECT_STATUS_LABELS
                      ) as ProspectStatus[]
                    ).map((key) => (
                      <option
                        key={key}
                        value={key}
                        className="bg-bg text-text"
                      >
                        {PROSPECT_STATUS_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 pr-3">
                  {p.linkedin_url ? (
                    <a
                      href={p.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-emerald hover:underline"
                    >
                      LI
                    </a>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="py-10 text-center text-[0.85rem] text-text-dim">
          No prospects match that filter.
        </div>
      )}
    </div>
  );
}

/**
 * Descending numeric compare with nulls bubbled to the bottom regardless
 * of sort direction. Used so that unverified prospects (null fit/access)
 * stay below verified ones in both ascending and descending sorts.
 */
function descNullsLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function SortHeader({
  id,
  sort,
  setSort,
  align = "left",
  children
}: {
  id: SortKey;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = sort === id;
  return (
    <th
      className={cn(
        "py-2 pr-3",
        align === "right" && "text-right"
      )}
    >
      <button
        type="button"
        onClick={() => setSort(id)}
        className={cn(
          "font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors",
          active ? "text-emerald" : "text-text-dim hover:text-text-med"
        )}
      >
        {children}
        {active && <span className="ml-1">↓</span>}
      </button>
    </th>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="font-mono text-[0.7rem] text-text-dim">—</span>;
  }
  return (
    <div className="inline-flex w-16 items-center gap-1.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg">
        <div
          className="h-full bg-emerald"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="w-5 text-right font-mono text-[0.7rem] text-text-med">
        {value}
      </span>
    </div>
  );
}
