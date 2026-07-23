# Network Map (radial personal-CRM visualization)

> A radial "you at the center" network map of your contacts, rendered as
> hand-rolled SVG, with rings by relationship strength and node color by
> follow-up state.

- **Slug:** `network-map`
- **Tags:** `network`, `crm`, `visualization`, `dashboard`
- **Source project:** KIID (personal OS dashboard)
- **Stack:** Next.js 15 App Router (server component page + client component) + Framer Motion + raw SVG + Neon Postgres (tagged-template SQL, no ORM)
- **Reuse confidence:** adapt-the-shape (the SVG renderer is close to drop-in once you map your contact type; the page + mutations are Neon-shaped and single-user)
- **Status in origin:** live (personal dashboard, single operator)

## Problem it solves
A personal CRM needs to feel human, not like a spreadsheet. A flat list of
contacts hides who is actually close to you and who is going cold. This surface
answers two questions at a glance: who are my strongest ties (inner ring), and
who is overdue for a follow-up (red nodes). It is the "something human" framing
of the page header, not Salesforce.

## When to reach for this
- You have a contacts/relationship table and want a visual instead of (or above)
  the list view.
- You want a dependency-free graph that ships in one SVG, no d3 / react-force-graph
  / cytoscape in the bundle.
- The relationship is hub-and-spoke (one ego node, N contacts), NOT an arbitrary
  many-to-many social graph. This layout assumes a center.
- You want strength and recency encoded as position + color + size, decoded
  without reading labels.

## How it works
Data flows server -> props -> deterministic layout -> SVG.

- The **page** (`page.tsx`) is a server component. It loads all contacts once via
  `listContacts()`, computes overdue contacts for the list sections, and passes the
  full `contacts` array to `<NetworkMap>`. No client fetching.
- **Layout is pure math, no physics simulation.** `NetworkMap` buckets each contact
  into one of three concentric rings by `relationship_strength` (`ringFor`), then
  spaces the members of each ring evenly around its circle (`angle = phase + (i/count) * 2π`).
  A per-ring `phase` offset (`ring * 0.35` rad) keeps inner and outer nodes from
  lining up on the same spoke, so it reads organic instead of gridded.
- **Three visual channels encode three facts.** Ring (radius) = strength bucket,
  node radius (`sizeFor`, 8-18px) = strength again (finer), node color = follow-up
  state (recent/soon/overdue/unset). Color is the load-bearing one: red = overdue.
- **Follow-up state** (`stateFor`) is computed client-side from `last_interaction_date +
  follow_up_days`: no cadence -> slate, never interacted -> overdue, due in <3 days ->
  amber, past due -> red, otherwise emerald.
- **Render is raw SVG** in a fixed 720x520 viewBox that scales responsively
  (`w-full h-auto`). Guide rings, radial connector lines, a pulsing "YOU" center
  node, then one `<g>` per contact (filled circle + white highlight dot for fake
  depth). Framer Motion only does entrance stagger and the center pulse.
- **Hover/focus state lives in React**, not CSS. `onMouseEnter/onFocus` set a
  `hovered` id; the matching node gets a glow aura and a brighter connector, and a
  floating label renders in an absolutely-positioned div over the SVG. The comment
  is explicit that SVG `:hover` inside a `<g>` is too finicky to rely on.
- Mutations (`mutations.ts`) are Next server actions: create / delete contact, log
  an interaction (which also stamps `last_interaction_date`), and bump strength.
  Each runs raw SQL through Neon and `revalidatePath`s `/network` + `/dashboard`.

## Data model
```sql
create table public.contacts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null,
  name                    text not null,
  title                   text,
  company                 text,
  relationship_strength   integer check (relationship_strength between 1 and 5),
  how_met                 text,
  tags                    text[] default '{}',
  notes                   text,
  last_interaction_date   date,
  follow_up_days          integer,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.interactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  type        text not null check (type in ('call','meeting','text','email','event')),
  date        date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);
```
The map reads only `contacts` (`relationship_strength`, `last_interaction_date`,
`follow_up_days`, plus `name`/`title`/`company` for labels). `interactions` exists
to drive `last_interaction_date` when you log a touchpoint.

## Key decisions & gotchas
- **No graph library, on purpose.** This is a hub-and-spoke ego graph, so position
  is a closed-form trig formula and a force-directed layout would be overkill. The
  cost: it does NOT generalize to contact-to-contact edges. There is exactly one
  center and every line goes back to it. If you need a real social graph, this is
  the wrong base.
- **Strength scale mismatch is a live bug to fix on reuse.** The DB constrains
  `relationship_strength` to 1-5 (`check between 1 and 5`), and `updateContactStrength`
  clamps to 1-5. But `NetworkMap.ringFor` expects a 1-10 scale (ring 1 needs `>= 8`,
  ring 2 needs `>= 5`). With the real 1-5 data, ring 1 is unreachable, almost
  everything lands in ring 2/3, and `sizeFor` (also 1-10) never produces large nodes.
  Either widen the DB check to 1-10 or rescale `ringFor`/`sizeFor` to 1-5. Decide
  before copying.
- **Layout is deterministic but order-sensitive.** Angles come from array index, so
  re-sorting `contacts` reshuffles the whole ring. There is no stable per-contact
  angle. Fine for a glance view, not for "this person is always at 3 o'clock."
- **Performance is fine into the low hundreds, not thousands.** Every node is its own
  Framer Motion `<g>` with an entrance animation and React hover handlers. At a few
  dozen contacts (the single-operator use case) it is smooth. At 500+ nodes the
  stagger animation and per-node motion components get heavy. Drop Framer Motion or
  switch to a single delegated handler before scaling up.
- **Hover state in React, not SVG CSS.** Intentional (see the component comment).
  Keep it: it is what lets the floating HTML label and the connector highlight stay
  in sync.
- **Empty states are handled twice.** `NetworkMap` returns an "add a contact" prompt
  when zero nodes; the page also only mounts the map card when `contacts.length > 0`.
  Harmless redundancy, but know both exist.
- **Single-user / sentinel auth.** Inserts stamp a `DEMO_SENTINEL_USER_ID`; updates
  and deletes deliberately do NOT scope by `user_id` (a noted prior bug where the
  sentinel filter no-matched console-inserted rows). The code comment says re-add
  `and user_id = ...` once real auth lands. For a multi-tenant app this is a security
  gap you must close.
- **Demo mode.** Every mutation short-circuits to a no-op "demo" success when `getSql()`
  is null (no DB configured), so the UI is clickable without a database.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/NetworkMap.tsx` | Client component. Buckets contacts into rings, computes angles/size/color, renders the SVG, owns hover/focus + legend. The reusable core. | `framer-motion`, `@/lib/database` (`Contact` type), `@/lib/utils` (`cn`) |
| `code/page.tsx` | Server component. Loads contacts, splits overdue vs ranked for the list, mounts the map + contact form + cards. | `@/lib/repo` (`listContacts`), `@/lib/insights`, `@/lib/database`, dashboard UI components (`PageHead`, `Card`, `ContactForm`, `ContactCard`) |
| `code/mutations.ts` | Server actions: create / delete contact, log interaction, update strength. Raw Neon SQL + `revalidatePath`. | `next/cache`, `@/lib/neon` (`getSql`, `DEMO_SENTINEL_USER_ID`), `@/lib/database` types |

## Adaptation notes
- **Map your contact type.** `NetworkMap` only needs `id`, `name`, `title?`,
  `company?`, `relationship_strength`, `last_interaction_date`, `follow_up_days`.
  Point the `Contact` import at your own type with those fields and the renderer
  is essentially drop-in.
- **Pick a strength scale and make it consistent.** Resolve the 1-5 vs 1-10 mismatch
  (see gotchas) before relying on rings. The constants `RING_RADII`, the `>= 8 / >= 5`
  thresholds in `ringFor`, and the `1-10` math in `sizeFor` all assume the same scale.
- **Swap the data layer.** `page.tsx` calls `listContacts()` and `mutations.ts` uses
  Neon tagged templates with a sentinel user id. Replace with your ORM/query layer and
  add real `user_id` scoping for multi-tenant use.
- **Re-theme.** Colors are hard-coded hex in `STATE_COLORS` and Tailwind tokens
  (`text-text-dim`, `border-border`, `fill-emerald`, `bg-amber`, the `animate-recPulse`
  keyframe). Replace tokens with yours; the four state colors are the meaningful part.
- **Strip the dashboard chrome.** `PageHead`, `Card`, `ContactForm`, `ContactCard`,
  `getInsight` are app-specific and not included in `code/`. Only `NetworkMap.tsx` is
  the portable artifact; `page.tsx` is a wiring reference.

## Provenance
- Origin files (@ commit `5a1adfb`):
  - `apps/web/src/app/(dashboard)/network/page.tsx`
  - `apps/web/src/app/(dashboard)/network/mutations.ts`
  - `apps/web/src/components/dashboard/NetworkMap.tsx`
- Schema: `db/migrations/0001_initial.sql` (`public.contacts`, `public.interactions`)
- Related memory: none
