# Social Presence Tracker

> A dashboard surface that audits the user's social handles, surfaces the gap between their real credentials and their online presence, and exposes operator playbooks for closing it, all driven by a hand-authored content config with no database persistence.

- **Slug:** `social-presence-tracker`
- **Tags:** `social, dashboard, config-driven, personal-brand, analytics`
- **Source project:** Loft
- **Stack:** Next.js 15 App Router + Neon (no persistence; config-only in the captured state)
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves

A personal-OS dashboard needs a "where am I online" audit surface: not just a list of handles, but a structured read on the gap between the user's actual credentials and what their social presence communicates. The feature makes that audit inspectable and actionable from a single page rather than scattered across platform tabs.

## When to reach for this

- You are building a personal dashboard and want a social audit section that is driven by a content config, not a live API.
- You need a pattern for a config-driven page with multiple heterogeneous sections (stats, identity snapshot, platform cards, pillars, gap analysis, playbooks) that all pull from one typed object.
- You want to show editorial commentary alongside raw social data without wiring up OAuth to every platform.
- The destination project already has a dashboard shell with Card/Stat primitives, and you want to plug a new surface in.

## How it works

- A single typed config object (`socialPresence`) in `social-presence.ts` is the single source of truth. All sections of the page are destructured from it; there is no fetch, no database read, no server action.
- The page is an async Server Component that reads the config at import time. Adding `async` is correct but the function body is synchronous today, making the page ready to accept an async data fetch later without refactoring the JSX.
- Stats at the top (followers, following, posts, number of surfaces) are pulled by finding the `instagram` platform by `id`. Any platform can be the headline stat source by changing which `id` is matched.
- Platform cards iterate `platforms[]`; each card is an anchor tag linking to the live profile. Follower/following/post counts are optional fields and are omitted from the card if absent.
- Content pillars, gap body, gap moves, and operator playbooks each iterate their own typed arrays from the config, so adding or removing entries is a single array edit.
- Playbooks expose operator commands (Claude Code slash commands in the origin) that power the section. The page displays them as informational cards; execution happens outside the page.

## Data model

Stateless. No database tables touched. All data lives in `social-presence.ts` as a `const` object with TypeScript types inlined in the same file.

```typescript
type SocialPlatform = {
  id: string;
  label: string;
  handle: string;
  href: string;
  followers?: string;   // display string, e.g. "~2,000"
  following?: string;
  posts?: string;
  note?: string;
};

type SocialPillar = { label: string; body: string };

type OperatorPlaybook = { command: string; label: string; body: string; cta: string };

const socialPresence = {
  headline: string,
  platforms: SocialPlatform[],
  identity: { handle, handleNote, bio, bioPlatform, quote, quoteNote },
  credentials: string[],
  pillars: SocialPillar[],
  gap: { title: string, body: string[], moves: string[] },
  playbooks: OperatorPlaybook[]
} as const;
```

Follower counts are stored as display strings (`"~2,000"`, `"low"`) rather than integers. This is intentional: the data is hand-audited and the precision does not warrant a number type.

## Key decisions & gotchas

- **Config-only, no persistence.** Phase 1-3 of the origin project uses hand-written content for every dashboard module. The comment in `social-presence.ts` explicitly notes that a future "Smart Tool" phase will refresh stats from platforms on a cadence. Do not add a database layer until that phase is ready; the config approach keeps the page zero-dependency and instantly editable.
- **`as const` on the config.** The full object is `as const`, giving literal types throughout. This means you get autocomplete on specific values. The tradeoff is that mutating the object at runtime is not possible, which is correct here.
- **Platform count in the heading.** The `Surfaces` stat and the card group label both use `platforms.length`, so adding a platform to the array automatically increments both without touching JSX.
- **IG as the headline stat source.** `platforms.find((p) => p.id === "instagram")` hard-codes Instagram as the primary headline stat. If Instagram is removed or renamed, those stats silently fall back to `"–"`. A future version could make the featured platform id a config field.
- **Playbooks are display-only.** The playbook cards show command strings but provide no execution mechanism. They are reminders for the operator, not buttons. Wire them to a command palette or API route only if the destination project has that infrastructure.
- **No search or filtering.** The page renders all platforms and all pillars. At the scale of a personal dashboard (5-10 platforms, 4 pillars) this is correct. Do not add filtering until there is a concrete need.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server Component; renders all sections from the config | `@/components/dashboard/PageHead`, `@/components/dashboard/Card`, `@/components/dashboard/Stat` + `StatGrid` |
| `code/social-presence.ts` | Typed config object + TypeScript type exports | None (pure TS) |

`page.tsx` imports from three dashboard component aliases (`PageHead`, `Card`, `Stat`/`StatGrid`). These are Loft-specific wrappers. Replace them with whatever your destination project uses for page headers and card containers.

## Structure to keep, skin to drop

- **Keep (the idea):**
  - The single typed config object pattern: one `as const` file drives the entire page.
  - The section sequence: headline stat grid, identity snapshot, platform cards, credential signals, content pillars, gap analysis with ordered moves, operator playbooks.
  - `SocialPlatform`, `SocialPillar`, `OperatorPlaybook` type shapes. These are the data contract; preserve them.
  - The "find by id" pattern for extracting a featured platform for the stat grid.
  - Optional fields on `SocialPlatform` (followers, following, posts) rendered conditionally; absence produces clean output, not errors.
  - The gap section's `body` + `moves` split: prose analysis followed by an ordered action list.

- **Drop (regenerate natively):**
  - All Tailwind class names in `page.tsx`: font sizes, colors (`text-emerald`, `text-amber`, `text-text-dim`), spacing, grid layout, border styles. These are Loft's design tokens.
  - `PageHead`, `Card`, `Stat`, `StatGrid` components. Rebuild equivalents to match the destination design system.
  - The `robots: { index: false }` metadata. Set indexing policy per destination project.
  - The user-specific content inside `social-presence.ts` (Jordan's handles, credentials, pillars). Replace with the destination user's data.

## Adaptation notes

1. **Import paths.** `page.tsx` imports `@/components/dashboard/PageHead|Card|Stat`. Either create those components or swap for the destination project's equivalents.
2. **Config content.** Replace everything inside `socialPresence` in `social-presence.ts` with the target user's handles, bio, credentials, pillars, gap analysis, and playbooks. The TypeScript types enforce the shape.
3. **Platform data.** `href` values are live public URLs in the origin; update them per user. `followers`/`following`/`posts` are display strings; update on each audit cycle.
4. **Stat grid featured platform.** If you do not have an Instagram account or want a different platform to anchor the stat grid, change the `id` in `platforms.find((p) => p.id === "instagram")`.
5. **Playbook commands.** In the origin these are Claude Code slash commands (`/content-strategy`, `/social-content`, `/draft-content`). In a destination project without Claude Code, replace with whatever command surface you have, or remove the playbooks section.
6. **Future persistence.** When ready to pull live stats, replace the config arrays with async fetches in `SocialPage` (the function is already `async`). The config object can become defaults/fallbacks.
7. **Styling.** Rebuild all visual styles natively to match the destination project; do not copy Tailwind class strings.

## Provenance

- Origin files:
  - `apps/web/src/app/(dashboard)/social/page.tsx` @ `5a1adfb`
  - `apps/web/src/content/social-presence.ts` @ `5a1adfb`
- Source repo: Loft (`github.com/omarranti/Loft`)
- Related features: [[dashboard-app-shell]], [[profile-questionnaire]]
