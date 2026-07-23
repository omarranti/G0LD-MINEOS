"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Contact } from "@/lib/database";
import { cn } from "@/lib/utils";

/**
 * Network map — a radial visualization of the operator's contacts.
 *
 * Layout:
 *  - A central "You" node.
 *  - Three concentric rings by relationship_strength:
 *      ring 1 (inner):  8-10  → closest people
 *      ring 2 (middle): 5-7   → working relationships
 *      ring 3 (outer):  1-4   → acquaintances / weak ties
 *  - Contacts inside a ring are spaced evenly around the circle.
 *  - Node size scales with strength (strong = bigger).
 *  - Color signals follow-up state: emerald (recent), amber (soon),
 *    red (overdue), slate (no cadence set).
 *
 * No external dependency. Pure SVG. Hover state is tracked in React so
 * the component can render a floating label without relying on CSS
 * `:hover` inside an SVG <g>, which is finicky.
 */

type NetworkNode = {
  contact: Contact;
  ring: 1 | 2 | 3;
  angle: number; // radians
  size: number; // svg radius
  color: string;
  state: "recent" | "soon" | "overdue" | "unset";
};

const VIEWBOX = { w: 720, h: 520 };
const CENTER = { x: VIEWBOX.w / 2, y: VIEWBOX.h / 2 };
const RING_RADII = { 1: 90, 2: 170, 3: 240 } as const;

const STATE_COLORS: Record<NetworkNode["state"], string> = {
  recent: "#10b981",
  soon: "#f59e0b",
  overdue: "#ef4444",
  unset: "#71717a"
};

function ringFor(strength: number | null): 1 | 2 | 3 {
  const s = strength ?? 5;
  if (s >= 8) return 1;
  if (s >= 5) return 2;
  return 3;
}

function sizeFor(strength: number | null): number {
  const s = strength ?? 5;
  // 1-10 → 8-18 px radius
  return 8 + (Math.max(1, Math.min(10, s)) - 1) * (10 / 9);
}

function stateFor(c: Contact): NetworkNode["state"] {
  if (!c.follow_up_days) return "unset";
  if (!c.last_interaction_date) return "overdue";
  const last = new Date(c.last_interaction_date + "T00:00:00");
  const due = new Date(last);
  due.setDate(due.getDate() + c.follow_up_days);
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysToDue = (due.getTime() - now.getTime()) / msPerDay;
  if (daysToDue < 0) return "overdue";
  if (daysToDue < 3) return "soon";
  return "recent";
}

export function NetworkMap({
  contacts,
  className
}: {
  contacts: Contact[];
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const nodes = useMemo<NetworkNode[]>(() => {
    // Group by ring, then distribute angles evenly per ring.
    const byRing: Record<1 | 2 | 3, Contact[]> = { 1: [], 2: [], 3: [] };
    for (const c of contacts) {
      byRing[ringFor(c.relationship_strength)].push(c);
    }

    const out: NetworkNode[] = [];
    for (const ring of [1, 2, 3] as const) {
      const group = byRing[ring];
      const count = group.length;
      if (count === 0) continue;
      // Offset each ring by a small phase so inner and outer don't line up
      // on the same radial line — reads as more organic.
      const phase = ring * 0.35;
      group.forEach((c, i) => {
        const angle = phase + (i / count) * Math.PI * 2;
        out.push({
          contact: c,
          ring,
          angle,
          size: sizeFor(c.relationship_strength),
          color: STATE_COLORS[stateFor(c)],
          state: stateFor(c)
        });
      });
    }
    return out;
  }, [contacts]);

  const hoveredNode = hovered
    ? nodes.find((n) => n.contact.id === hovered) ?? null
    : null;

  if (nodes.length === 0) {
    return (
      <div className="py-10 text-center text-[0.85rem] text-text-muted">
        Add a contact below to populate the map.
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Network map of ${nodes.length} contacts, arranged by relationship strength.`}
      >
        {/* Concentric guide rings */}
        {([1, 2, 3] as const).map((ring) => (
          <circle
            key={ring}
            cx={CENTER.x}
            cy={CENTER.y}
            r={RING_RADII[ring]}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="2 4"
          />
        ))}

        {/* Radial connectors */}
        {nodes.map((n) => {
          const x = CENTER.x + Math.cos(n.angle) * RING_RADII[n.ring];
          const y = CENTER.y + Math.sin(n.angle) * RING_RADII[n.ring];
          const isHot = hovered === n.contact.id;
          return (
            <line
              key={`line-${n.contact.id}`}
              x1={CENTER.x}
              y1={CENTER.y}
              x2={x}
              y2={y}
              stroke={isHot ? n.color : "rgba(255,255,255,0.08)"}
              strokeWidth={isHot ? 1.25 : 0.75}
            />
          );
        })}

        {/* Center "You" node */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={26}
          fill="rgba(16,185,129,0.12)"
          stroke="rgba(16,185,129,0.55)"
          strokeWidth={1.5}
        />
        <motion.circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={26}
          fill="none"
          stroke="rgba(16,185,129,0.5)"
          strokeWidth={2}
          animate={{ r: [26, 40, 26], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeOut" }}
        />
        <text
          x={CENTER.x}
          y={CENTER.y + 4}
          textAnchor="middle"
          className="fill-emerald font-mono"
          style={{ fontSize: 11, letterSpacing: 2 }}
        >
          YOU
        </text>

        {/* Contact nodes */}
        {nodes.map((n, i) => {
          const x = CENTER.x + Math.cos(n.angle) * RING_RADII[n.ring];
          const y = CENTER.y + Math.sin(n.angle) * RING_RADII[n.ring];
          const isHot = hovered === n.contact.id;
          return (
            <motion.g
              key={n.contact.id}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.1 + i * 0.02,
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1]
              }}
              onMouseEnter={() => setHovered(n.contact.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(n.contact.id)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
              className="cursor-pointer focus-visible:outline-none"
              style={{ transformOrigin: `${x}px ${y}px` }}
            >
              <title>
                {n.contact.name}
                {n.contact.company ? ` · ${n.contact.company}` : ""}
              </title>
              {/* Glow aura on hover */}
              {isHot && (
                <circle
                  cx={x}
                  cy={y}
                  r={n.size + 8}
                  fill={n.color}
                  opacity={0.18}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={n.size}
                fill={n.color}
                fillOpacity={isHot ? 0.9 : 0.55}
                stroke={n.color}
                strokeWidth={isHot ? 2 : 1}
              />
              {/* Inner highlight for depth */}
              <circle
                cx={x - n.size * 0.3}
                cy={y - n.size * 0.3}
                r={n.size * 0.3}
                fill="rgba(255,255,255,0.35)"
              />
            </motion.g>
          );
        })}
      </svg>

      {/* Floating label for the hovered node */}
      {hoveredNode && (
        <div
          className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 font-mono text-[0.68rem] text-text backdrop-blur-sm"
          aria-hidden="true"
        >
          <span className="font-semibold">{hoveredNode.contact.name}</span>
          {hoveredNode.contact.title && (
            <span className="text-text-dim"> · {hoveredNode.contact.title}</span>
          )}
          {hoveredNode.contact.company && (
            <span className="text-text-dim"> · {hoveredNode.contact.company}</span>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/50 pt-4 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim">
        <LegendDot color={STATE_COLORS.recent} label="recent" />
        <LegendDot color={STATE_COLORS.soon} label="due soon" />
        <LegendDot color={STATE_COLORS.overdue} label="overdue" />
        <LegendDot color={STATE_COLORS.unset} label="no cadence" />
        <span className="ml-auto text-text-dim">
          inner ring = strongest ties
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {label}
    </span>
  );
}
