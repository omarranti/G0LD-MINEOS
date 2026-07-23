# Dashboard App Shell

> A sidebar + topbar chrome, driven by a declarative nav config and applied once
> via a route-group layout, that wraps every authenticated dashboard page.

<!-- The reusable value here is the config-driven shell composition and the
behaviors centralized in one place, NOT the specific look. The visuals are almost
entirely skin and should be regenerated to match the destination project. -->

- **Slug:** `dashboard-app-shell`
- **Tags:** `layout`, `navigation`, `dashboard`, `shell`
- **Source project:** KIID
- **Stack:** Next.js 15 App Router (route groups, server + client components) + Tailwind
- **Reuse confidence:** adapt-the-shape (the shell pattern and the centralized behaviors are the portable kernel; every class, glyph, and label is project-specific skin)
- **Status in origin:** live (single-user personal OS)

## Problem it solves
Every page under the dashboard needs the same chrome (sidebar nav, topbar, auth
gate, mobile drawer, skip link) without each page re-implementing it. Adding a new
section should be one line in a config array, not new layout wiring.

## When to reach for this
- You have a set of authenticated routes that all share one sidebar + topbar frame.
- You want navigation to be data, not JSX: add a route by appending one object.
- You want drawer/escape/scroll-lock/active-route logic written once, inherited by every page.
- You want the auth gate enforced at the layout boundary, not repeated per page.

## How it works
- **Declarative nav config** (`dashboard-nav.ts`): a flat `DashboardNavItem[]`. Each
  item is `{ href, label, icon, group?, phase, status }`. `group` is an optional
  section bucket; `status` (`ready | scaffold | soon`) drives a per-item badge; `phase`
  is origin-only ordering metadata.
- **Sectioning is derived, not declared.** The sidebar runs a `reduce` to group items
  by `item.group ?? "Main"`, so order in the array determines render order and the
  "Main" group renders without a header. No nested config tree.
- **Route-group layout** (`(dashboard)/layout.tsx`): a server component that runs the
  auth check (`isAuthenticated()` → `redirect("/login")`) and then renders
  `DashboardChrome`. The parenthesized folder applies this to every child route without
  affecting the URL path.
- **Chrome is a single client component** (`DashboardChrome`): owns the one piece of
  interactive state (mobile drawer open/closed) and shares it between the Sidebar (drawer
  body) and Topbar (toggle button). Server layout stays thin; client state lives in one spot.
- **Active-route detection:** `pathname === href || pathname.startsWith(href + "/")`, so a
  section stays highlighted on its nested pages. Sets `aria-current="page"`.
- **Responsive collapse:** desktop (>= md) the sidebar is a fixed left column always
  visible and the main column is offset by its width; mobile it becomes an off-canvas
  drawer toggled by the Topbar hamburger, with a tap-to-dismiss backdrop.

## Data model
Stateless. The only "model" is the in-repo `DashboardNavItem[]` config array. No DB,
cookies, or persisted state. (The layout reads an auth session via `isAuthenticated()`,
but that lives outside this feature.)

## Key decisions & gotchas
- **Drawer state lives in one component, not in each consumer.** `DashboardChrome` holds
  `mobileOpen` and wires four cross-cutting behaviors in one place so every page inherits
  them free: close on route change (`usePathname` effect), Escape-to-close, body
  scroll-lock while open, and a first-in-tab-order skip-to-content link.
- **Server/client split is deliberate.** The layout is a server component (so the auth
  check and redirect happen server-side before render); the chrome is a client component
  (so it can hold drawer state and run effects). Keep that boundary when porting.
- **Auth is defense-in-depth.** The origin notes middleware also guards these routes, but
  the layout check is the source of truth for direct server-to-server navigation. Do not
  drop the layout check just because middleware exists.
- **Grouping order = array order.** Because sections are derived from a `reduce` over the
  flat array, moving an item in the config moves it in the UI. There is no explicit
  section ordering field, so an out-of-place item silently lands in the wrong group block.
- **`status: "soon"` is the only status that renders a badge.** `ready`/`scaffold` look
  identical in the sidebar today; the field is richer than the current UI uses.
- **`phase` is origin cruft.** It is build-ordering metadata for KIID's module rollout and
  carries no behavior. Drop it when porting.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/dashboard-nav.ts` | The nav config: `DashboardNavItem` type + the `dashboardNav` array | none (pure data) |
| `code/layout.tsx` | Route-group server layout: auth gate + render chrome | `@/lib/auth` (isAuthenticated), `@/lib/demo-data` (user email), `next/navigation` |
| `code/DashboardChrome.tsx` | Client chrome wrapper: owns drawer state, wires route-close/escape/scroll-lock/skip-link, lays out Sidebar + Topbar + main | `next/navigation` (usePathname) |
| `code/Sidebar.tsx` | Renders grouped nav from config, active-route highlight, desktop column vs mobile drawer, operator footer + signout | `@/lib/utils` (cn), `@/content/dashboard-nav`, `@/content/site`, `next/link` |
| `code/Topbar.tsx` | Sticky top bar: live clock, status dot, mobile hamburger calling `onMenuClick` | none beyond React |

## Structure to keep, skin to drop
- **Keep (the idea):**
  - The `DashboardNavItem` schema and the flat-array-with-derived-grouping approach.
  - The route-group layout doing the auth gate once and delegating to a client chrome.
  - The split: thin server layout for auth + redirect, single client chrome for interactive state.
  - Active-route logic (`pathname === href || pathname.startsWith(href + "/")` + `aria-current`).
  - The centralized drawer behaviors (close-on-route-change, Escape, scroll-lock, skip link).
  - Responsive collapse: fixed column on desktop, off-canvas drawer + backdrop on mobile.
- **Drop (regenerate natively):** essentially the entire visual layer. The `glass-chrome`
  / `nav-btn` / `is-active` / `focusable` utility classes, every Tailwind token
  (`text-amberTerm`, `text-text-dim`, `bg-emerald`, `max-w-main`, the 220/260px widths),
  the unicode glyph icons (`◉ ▸ ◆ ❋`), the `NATE_OS // Command Center` branding, the
  HUD copy ("online // command center"), the live clock, and the recPulse status dot.
  None of that is load-bearing. This entry exists for the composition and the centralized
  behaviors, not the look. Swap the glyph `icon: string` for a real icon component, and
  restyle from scratch in the destination's design system.

## Adaptation notes
- Replace `@/lib/auth` `isAuthenticated()` and `@/lib/demo-data` with the destination's
  real session + user lookup. If there is no auth, drop the gate and pass the user in directly.
- Replace `@/lib/utils` `cn` with the project's class-merge helper (or `clsx`/`tailwind-merge`).
- `@/content/site` is imported in `Sidebar.tsx` but the visible branding is currently
  hardcoded (`NATE_OS`); wire branding through config or inline it when porting.
- The `icon: string` glyph field should become an icon-component reference for any real
  design system. Update the `DashboardNavItem` type accordingly.
- Restyle entirely from scratch to match the destination (see Structure to keep, skin to drop).

## Provenance
- Origin files: `Loft/apps/web/src/components/dashboard/{Sidebar,Topbar,DashboardChrome}.tsx`,
  `apps/web/src/content/dashboard-nav.ts`, `apps/web/src/app/(dashboard)/layout.tsx` @ `5a1adfb`
- Related features: [[finances-runway]]
